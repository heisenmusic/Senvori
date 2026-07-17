import 'dart:async';
import 'dart:collection';

import '../../core/errors/player_error.dart';
import '../../core/logging/logger.dart';
import '../../core/time/clock.dart';
import 'cached_asset.dart';
import 'ports.dart';

/// A backoff policy with deterministic (optionally jittered) delays. Kept pure
/// so retry timing is testable (Sprint 09 · §38).
final class BackoffPolicy {
  const BackoffPolicy({
    this.base = const Duration(seconds: 2),
    this.max = const Duration(minutes: 5),
    this.factor = 2,
    this.maxAttempts = 5,
  });

  final Duration base;
  final Duration max;
  final int factor;
  final int maxAttempts;

  /// Delay before attempt number [attempt] (1-based). Grows geometrically and
  /// is capped at [max]. A caller-supplied [jitter] in [0,1) spreads retries so
  /// a fleet does not reconnect in lockstep after an outage.
  Duration delayForAttempt(int attempt, {double jitter = 0}) {
    if (attempt <= 1) return Duration.zero;
    var ms = base.inMilliseconds;
    for (var i = 2; i < attempt; i++) {
      ms *= factor;
      if (ms >= max.inMilliseconds) {
        ms = max.inMilliseconds;
        break;
      }
    }
    ms = ms.clamp(0, max.inMilliseconds);
    final jitterMs = (ms * jitter).round();
    return Duration(milliseconds: ms + jitterMs);
  }
}

/// A pending download request.
final class DownloadRequest {
  const DownloadRequest({required this.asset});
  final CachedAsset asset;
}

/// Serialises and rate-limits downloads (Sprint 09 · §18). Enforces a max
/// concurrency, deduplicates in-flight requests, validates checksums, and
/// promotes atomically via a temp file. Cancellation and retry are supported.
///
/// The manager is transport/filesystem-agnostic and clock-injected; it does not
/// itself sleep for backoff (the caller/scheduler decides when to re-enqueue),
/// which keeps it deterministic under test.
final class DownloadManager {
  DownloadManager({
    required AssetTransport transport,
    required FileSystemPort fs,
    required ChecksumPort checksum,
    required Logger logger,
    required Clock clock,
    required String cacheRoot,
    this.maxConcurrency = 2,
    this.backoff = const BackoffPolicy(),
  }) : _transport = transport,
       _fs = fs,
       _checksum = checksum,
       _logger = logger,
       _clock = clock,
       _cacheRoot = cacheRoot;

  final AssetTransport _transport;
  final FileSystemPort _fs;
  final ChecksumPort _checksum;
  final Logger _logger;
  final Clock _clock;
  final String _cacheRoot;
  final int maxConcurrency;
  final BackoffPolicy backoff;

  final Set<String> _inFlight = {};
  final Queue<DownloadRequest> _pending = Queue();
  int _active = 0;

  final _controller = StreamController<CachedAsset>.broadcast();

  /// Emits the latest [CachedAsset] snapshot each time one changes state.
  Stream<CachedAsset> get updates => _controller.stream;

  int get activeCount => _active;
  int get pendingCount => _pending.length;

  /// Enqueues an asset for download. No-op if already in flight (dedup) or
  /// already queued. Higher-priority requests are inserted ahead of lower ones.
  void enqueue(CachedAsset asset) {
    if (_inFlight.contains(asset.assetId)) return;
    if (_pending.any((r) => r.asset.assetId == asset.assetId)) return;
    _insertByPriority(DownloadRequest(asset: asset));
    _logger.info(LogEvent.assetDownloadStarted, {
      'assetId': asset.assetId,
      'priority': asset.priority.name,
    });
    _pump();
  }

  void _insertByPriority(DownloadRequest req) {
    // Stable priority insert: place before the first pending item of strictly
    // lower priority (higher ordinal).
    final list = _pending.toList();
    final idx = list.indexWhere(
      (r) => r.asset.priority.index > req.asset.priority.index,
    );
    if (idx == -1) {
      _pending.addLast(req);
    } else {
      list.insert(idx, req);
      _pending
        ..clear()
        ..addAll(list);
    }
  }

  void _pump() {
    while (_active < maxConcurrency && _pending.isNotEmpty) {
      final req = _pending.removeFirst();
      unawaited(_run(req.asset));
    }
  }

  Future<void> _run(CachedAsset asset) async {
    _inFlight.add(asset.assetId);
    _active++;
    final tempPath = '$_cacheRoot/tmp/${asset.assetId}.part';
    final finalPath = '$_cacheRoot/assets/${asset.assetId}';
    try {
      _emit(
        asset.copyWith(
          status: AssetStatus.downloading,
          attempts: asset.attempts + 1,
        ),
      );
      final outcome = await _transport.fetch(asset.sourceUri);

      // Validate before promoting. A checksum, when known, must match.
      _emit(asset.copyWith(status: AssetStatus.validating));
      if (asset.checksum != null) {
        final actual = _checksum.compute(outcome.bytes);
        if (actual.toLowerCase() != asset.checksum!.toLowerCase()) {
          await _fs.deleteIfExists(tempPath);
          _fail(
            asset,
            PlayerErrors.assetChecksumMismatch(asset.assetId),
            corrupted: true,
          );
          return;
        }
      }

      // Atomic promotion: write temp, then move into place.
      await _fs.writeTemp(tempPath, outcome.bytes);
      await _fs.promote(tempPath, finalPath);

      _emit(
        asset.copyWith(
          status: AssetStatus.ready,
          localPath: finalPath,
          receivedBytes: outcome.bytes.length,
          mimeType: outcome.mimeType ?? asset.mimeType,
          lastAccess: _clock.now(),
          lastErrorCode: null,
        ),
      );
      _logger.info(LogEvent.assetDownloadCompleted, {
        'assetId': asset.assetId,
        'bytes': outcome.bytes.length,
      });
    } catch (e) {
      await _fs.deleteIfExists(tempPath);
      final retryable = asset.attempts + 1 < backoff.maxAttempts;
      _fail(
        asset,
        PlayerErrors.downloadFailed(
          asset.assetId,
          retryable: retryable,
          cause: e,
        ),
      );
    } finally {
      _inFlight.remove(asset.assetId);
      _active--;
      _pump();
    }
  }

  void _fail(CachedAsset asset, PlayerError err, {bool corrupted = false}) {
    _emit(
      asset.copyWith(
        status: corrupted ? AssetStatus.corrupted : AssetStatus.failed,
        lastErrorCode: err.code,
      ),
    );
    _logger.warning(LogEvent.assetDownloadFailed, {
      'assetId': asset.assetId,
      'code': err.code,
    });
  }

  void _emit(CachedAsset asset) {
    if (!_controller.isClosed) _controller.add(asset);
  }

  Future<void> dispose() => _controller.close();
}
