import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/core/logging/logger.dart';
import 'package:senvori_player/core/time/clock.dart';
import 'package:senvori_player/features/asset_cache/cached_asset.dart';
import 'package:senvori_player/features/asset_cache/disk_manager.dart';
import 'package:senvori_player/features/asset_cache/download_manager.dart';
import 'package:senvori_player/features/asset_cache/ports.dart';

/// A fake transport that returns scripted bytes or throws for named assets.
class _FakeTransport implements AssetTransport {
  _FakeTransport({this.failFirstN = 0, this.bytes = const [1, 2, 3, 4]});
  int failFirstN;
  final List<int> bytes;
  int calls = 0;

  @override
  Future<DownloadOutcome> fetch(
    String uri, {
    void Function(int, int?)? onProgress,
  }) async {
    calls++;
    if (calls <= failFirstN) throw StateError('boom');
    return DownloadOutcome(bytes: bytes, mimeType: 'audio/mpeg');
  }
}

class _MemFs implements FileSystemPort {
  final Map<String, List<int>> files = {};
  @override
  Future<void> writeTemp(String tempPath, List<int> bytes) async =>
      files[tempPath] = bytes;
  @override
  Future<void> promote(String tempPath, String finalPath) async {
    files[finalPath] = files.remove(tempPath) ?? const [];
  }

  @override
  Future<void> deleteIfExists(String path) async => files.remove(path);
  @override
  Future<bool> exists(String path) async => files.containsKey(path);
  @override
  Future<int> sizeOf(String path) async => files[path]?.length ?? 0;
  @override
  Future<DiskStats> diskStats() async =>
      const DiskStats(totalBytes: 1000, availableBytes: 500);
}

class _IdentityChecksum implements ChecksumPort {
  @override
  String compute(List<int> bytes) => bytes.join(',');
}

CachedAsset _asset(String id, {String? checksum, int attempts = 0}) =>
    CachedAsset(
      assetId: id,
      version: 1,
      sourceUri: 'https://x/$id',
      status: AssetStatus.missing,
      checksum: checksum,
      attempts: attempts,
    );

void main() {
  group('BackoffPolicy', () {
    const p = BackoffPolicy(
      base: Duration(seconds: 2),
      factor: 2,
      max: Duration(seconds: 30),
    );
    test(
      'first attempt has no delay, then grows geometrically capped at max',
      () {
        expect(p.delayForAttempt(1), Duration.zero);
        expect(p.delayForAttempt(2), const Duration(seconds: 2));
        expect(p.delayForAttempt(3), const Duration(seconds: 4));
        expect(p.delayForAttempt(4), const Duration(seconds: 8));
        expect(p.delayForAttempt(10), const Duration(seconds: 30)); // capped
      },
    );
    test('jitter increases delay deterministically', () {
      final base = p.delayForAttempt(3);
      final jittered = p.delayForAttempt(3, jitter: 0.5);
      expect(jittered > base, isTrue);
    });
  });

  group('DownloadManager', () {
    test(
      'downloads, validates checksum, and promotes atomically to ready',
      () async {
        final t = _FakeTransport(bytes: const [9, 9]);
        final fs = _MemFs();
        final dm = DownloadManager(
          transport: t,
          fs: fs,
          checksum: _IdentityChecksum(),
          logger: Logger(FakeClock(DateTime.utc(2026))),
          clock: FakeClock(DateTime.utc(2026)),
          cacheRoot: '/c',
        );
        final done = dm.updates.firstWhere((a) => a.isReady);
        dm.enqueue(_asset('a', checksum: '9,9'));
        final ready = await done;
        expect(ready.status, AssetStatus.ready);
        expect(ready.localPath, '/c/assets/a');
        expect(fs.files.containsKey('/c/assets/a'), isTrue);
        expect(
          fs.files.containsKey('/c/tmp/a.part'),
          isFalse,
        ); // temp cleaned up via promote
        await dm.dispose();
      },
    );

    test('checksum mismatch marks corrupted and does not promote', () async {
      final t = _FakeTransport(bytes: const [1]);
      final fs = _MemFs();
      final dm = DownloadManager(
        transport: t,
        fs: fs,
        checksum: _IdentityChecksum(),
        logger: Logger(FakeClock(DateTime.utc(2026))),
        clock: FakeClock(DateTime.utc(2026)),
        cacheRoot: '/c',
      );
      final done = dm.updates.firstWhere(
        (a) => a.status == AssetStatus.corrupted,
      );
      dm.enqueue(_asset('bad', checksum: 'expected-different'));
      final res = await done;
      expect(res.status, AssetStatus.corrupted);
      expect(fs.files.containsKey('/c/assets/bad'), isFalse);
      await dm.dispose();
    });

    test('transport failure marks failed', () async {
      final t = _FakeTransport(failFirstN: 100);
      final fs = _MemFs();
      final dm = DownloadManager(
        transport: t,
        fs: fs,
        checksum: _IdentityChecksum(),
        logger: Logger(FakeClock(DateTime.utc(2026))),
        clock: FakeClock(DateTime.utc(2026)),
        cacheRoot: '/c',
      );
      final done = dm.updates.firstWhere((a) => a.status == AssetStatus.failed);
      dm.enqueue(_asset('f'));
      expect((await done).status, AssetStatus.failed);
      await dm.dispose();
    });

    test('deduplicates an already in-flight asset', () async {
      final t = _FakeTransport();
      final fs = _MemFs();
      final dm = DownloadManager(
        transport: t,
        fs: fs,
        checksum: _IdentityChecksum(),
        logger: Logger(FakeClock(DateTime.utc(2026))),
        clock: FakeClock(DateTime.utc(2026)),
        cacheRoot: '/c',
      );
      final done = dm.updates.firstWhere((a) => a.isReady);
      dm.enqueue(_asset('dup'));
      dm.enqueue(_asset('dup'));
      await done;
      expect(t.calls, 1);
      await dm.dispose();
    });
  });

  group('DiskManager', () {
    DiskManager dm({int margin = 300, int? limit}) => DiskManager(
      logger: Logger(FakeClock(DateTime.utc(2026))),
      safetyMarginBytes: margin,
      configuredLimitBytes: limit,
    );

    CachedAsset ready(
      String id, {
      int bytes = 100,
      bool pinned = false,
      DateTime? access,
    }) => CachedAsset(
      assetId: id,
      version: 1,
      sourceUri: '',
      status: AssetStatus.ready,
      receivedBytes: bytes,
      expectedBytes: bytes,
      pinned: pinned,
      lastAccess: access,
    );

    test('no eviction when free space is above the margin', () {
      final plan = dm(margin: 100).planEviction(
        entries: [ready('a')],
        stats: const DiskStats(totalBytes: 1000, availableBytes: 500),
      );
      expect(plan.isEmpty, isTrue);
    });

    test('evicts coldest, non-pinned assets first to reclaim space', () {
      final entries = [
        ready('warm', access: DateTime.utc(2026, 1, 2)),
        ready('cold', access: DateTime.utc(2026, 1, 1)),
        ready('pinned', pinned: true, access: DateTime.utc(2026, 1, 1)),
      ];
      final plan = dm(margin: 250).planEviction(
        entries: entries,
        stats: const DiskStats(totalBytes: 1000, availableBytes: 200),
      );
      expect(plan.evict.first.assetId, 'cold');
      expect(plan.evict.any((e) => e.assetId == 'pinned'), isFalse);
    });

    test('respects a configured Senvori-owned byte limit', () {
      final entries = [ready('a', bytes: 200), ready('b', bytes: 200)];
      final plan = dm(margin: 0, limit: 300).planEviction(
        entries: entries,
        stats: const DiskStats(totalBytes: 10000, availableBytes: 9000),
      );
      expect(plan.freedBytes >= 100, isTrue);
    });
  });
}
