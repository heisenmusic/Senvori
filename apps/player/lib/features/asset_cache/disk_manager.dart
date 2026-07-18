import '../../core/logging/logger.dart';
import 'cached_asset.dart';
import 'ports.dart';

/// The outcome of an eviction pass: which assets to remove and why.
final class EvictionPlan {
  const EvictionPlan({required this.evict, required this.freedBytes});
  final List<CachedAssetEviction> evict;
  final int freedBytes;
  bool get isEmpty => evict.isEmpty;
}

final class CachedAssetEviction {
  const CachedAssetEviction({
    required this.assetId,
    required this.reason,
    required this.bytes,
  });
  final String assetId;
  final String reason;
  final int bytes;
}

/// Deterministic disk policy (Sprint 09 · §19). Given the current cache entries
/// and disk stats, it computes which removable assets to evict to keep a safety
/// margin, and records the reason for each eviction. Pinned assets (active
/// plan, emergency, imminent items) are never evicted.
///
/// This is a pure function of its inputs — no IO — so eviction decisions are
/// fully testable. The caller performs the actual deletes.
final class DiskManager {
  DiskManager({
    required Logger logger,
    this.safetyMarginBytes = 256 * 1024 * 1024,
    this.configuredLimitBytes,
  }) : _logger = logger;

  final Logger _logger;

  /// Keep at least this many bytes free.
  final int safetyMarginBytes;

  /// Optional cap on Senvori-owned bytes, independent of device free space.
  final int? configuredLimitBytes;

  EvictionPlan planEviction({
    required Iterable<CachedAsset> entries,
    required DiskStats stats,
  }) {
    final ready = entries
        .where((e) => e.isReady && (e.expectedBytes ?? 0) >= 0)
        .toList();
    final ownedBytes = ready.fold<int>(0, (sum, e) => sum + (e.receivedBytes));

    final needByFreeSpace = safetyMarginBytes - stats.availableBytes;
    final needByLimit = configuredLimitBytes == null
        ? 0
        : ownedBytes - configuredLimitBytes!;
    var bytesToFree = needByFreeSpace > needByLimit
        ? needByFreeSpace
        : needByLimit;
    if (bytesToFree <= 0) return const EvictionPlan(evict: [], freedBytes: 0);

    // Evict removable (non-pinned) assets, coldest first (least-recently
    // accessed), then lowest priority. Deterministic tie-break by assetId.
    final removable = ready.where((e) => !e.pinned).toList()
      ..sort((a, b) {
        final la = a.lastAccess?.millisecondsSinceEpoch ?? 0;
        final lb = b.lastAccess?.millisecondsSinceEpoch ?? 0;
        if (la != lb) return la.compareTo(lb);
        if (a.priority.index != b.priority.index) {
          return b.priority.index.compareTo(a.priority.index);
        }
        return a.assetId.compareTo(b.assetId);
      });

    final evict = <CachedAssetEviction>[];
    var freed = 0;
    for (final e in removable) {
      if (freed >= bytesToFree) break;
      final reason = needByLimit > 0 && freed < needByLimit
          ? 'over_configured_limit'
          : 'low_free_space';
      evict.add(
        CachedAssetEviction(
          assetId: e.assetId,
          reason: reason,
          bytes: e.receivedBytes,
        ),
      );
      freed += e.receivedBytes;
    }

    for (final e in evict) {
      _logger.info(LogEvent.assetEvicted, {
        'assetId': e.assetId,
        'reason': e.reason,
        'bytes': e.bytes,
      });
    }
    if (stats.availableBytes < safetyMarginBytes) {
      _logger.warning(LogEvent.storageLow, {
        'availableBytes': stats.availableBytes,
      });
    }
    return EvictionPlan(evict: evict, freedBytes: freed);
  }
}
