import '../../core/logging/logger.dart';
import '../../core/persistence/key_value_store.dart';
import '../../core/time/clock.dart';
import '../plan_runtime/plan.dart';
import 'cached_asset.dart';
import 'download_manager.dart';

/// In-memory index of cache entries, backed by a persisted document so metadata
/// survives restarts (Sprint 09 · §16–§17). The bytes live on disk via the
/// [DownloadManager]; this class owns the metadata and readiness view.
final class AssetCache {
  AssetCache({
    required DocumentStore store,
    required DownloadManager downloader,
    required Logger logger,
    required Clock clock,
    this.storageKey = 'asset_cache_index',
    this.schemaVersion = 1,
  }) : _store = store,
       _downloader = downloader,
       _logger = logger,
       _clock = clock {
    _downloader.updates.listen(_onDownloadUpdate);
  }

  final DocumentStore _store;
  final DownloadManager _downloader;
  final Logger _logger;
  final Clock _clock;
  final String storageKey;
  final int schemaVersion;

  final Map<String, CachedAsset> _entries = {};

  Iterable<CachedAsset> get entries => _entries.values;
  CachedAsset? entryFor(String assetId) => _entries[assetId];
  bool isReady(String assetId) => _entries[assetId]?.isReady ?? false;

  /// Restores the persisted index. Corruption yields an empty index rather than
  /// a crash — assets will simply be re-fetched.
  Future<void> restore() async {
    try {
      final doc = await _store.read(storageKey);
      if (doc == null || doc.schemaVersion != schemaVersion) return;
      final list = (doc.data['entries'] as List?) ?? const [];
      for (final e in list.cast<Map>()) {
        final asset = CachedAsset.fromJson(e.cast<String, Object?>());
        _entries[asset.assetId] = asset;
      }
    } on FormatException {
      _logger.warning(LogEvent.planRejected, {
        'reason': 'asset_index_corrupted',
      });
      _entries.clear();
    }
  }

  /// Registers/updates the descriptor for an asset without downloading it.
  void register(CachedAsset asset) => _entries[asset.assetId] = asset;

  /// Ensures every asset referenced by [plan] has an entry and enqueues the
  /// ones that are not yet ready, with priority proportional to imminence.
  /// Returns the set of asset ids that are still not ready.
  Future<Set<String>> ensureForPlan(
    PlayerPlan plan, {
    required Map<String, String> sourceUris,
    Map<String, String?> checksums = const {},
    int nextWindow = 3,
  }) async {
    final referenced = plan.referencedAssetIds;
    final notReady = <String>{};
    for (var i = 0; i < referenced.length; i++) {
      final assetId = referenced[i];
      final priority = _priorityFor(
        plan,
        assetId,
        index: i,
        nextWindow: nextWindow,
      );
      final existing = _entries[assetId];
      final pinned =
          priority == AssetPriority.currentItem ||
          priority == AssetPriority.emergency ||
          priority == AssetPriority.nextItems;
      final asset =
          (existing ??
                  CachedAsset(
                    assetId: assetId,
                    version: 1,
                    sourceUri: sourceUris[assetId] ?? '',
                    status: AssetStatus.missing,
                  ))
              .copyWith(
                priority: priority,
                pinned: pinned,
                checksum: checksums[assetId],
              );
      _entries[assetId] = asset;
      if (!asset.isReady) {
        notReady.add(assetId);
        if (asset.sourceUri.isNotEmpty) _downloader.enqueue(asset);
      }
    }
    await _persist();
    return notReady;
  }

  AssetPriority _priorityFor(
    PlayerPlan plan,
    String assetId, {
    required int index,
    required int nextWindow,
  }) {
    if (plan.emergencyItems.any((i) => i.assetId == assetId)) {
      return AssetPriority.emergency;
    }
    if (index == 0) return AssetPriority.currentItem;
    if (index <= nextWindow) return AssetPriority.nextItems;
    return AssetPriority.today;
  }

  void _onDownloadUpdate(CachedAsset asset) {
    _entries[asset.assetId] = asset;
    // Persist opportunistically on terminal transitions to bound write rate.
    if (asset.isReady || asset.isTerminalFailure) {
      _persist();
    }
  }

  Future<void> touch(String assetId) async {
    final e = _entries[assetId];
    if (e != null) _entries[assetId] = e.copyWith(lastAccess: _clock.now());
  }

  Future<void> _persist() => _store.write(
    storageKey,
    StoredDocument(
      schemaVersion: schemaVersion,
      data: {'entries': _entries.values.map((e) => e.toJson()).toList()},
    ),
  );
}
