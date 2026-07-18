/// Asset cache domain (Sprint 09 · §17).
///
/// Each referenced asset has a local cache entry that tracks its lifecycle from
/// `missing` through `downloading`/`validating` to `ready`, plus failure and
/// eviction terminal-ish states. Checksums are validated when provided.
library;

enum AssetStatus {
  missing,
  queued,
  downloading,
  validating,
  ready,
  failed,
  corrupted,
  evicted,
}

/// Download priority (Sprint 09 · §18). Lower ordinal = more urgent.
enum AssetPriority {
  currentItem,
  nextItems,
  emergency,
  today,
  future,
  optional,
}

final class CachedAsset {
  const CachedAsset({
    required this.assetId,
    required this.version,
    required this.sourceUri,
    required this.status,
    this.localPath,
    this.expectedBytes,
    this.receivedBytes = 0,
    this.checksum,
    this.mimeType,
    this.duration,
    this.attempts = 0,
    this.lastErrorCode,
    this.lastAccess,
    this.pinned = false,
    this.priority = AssetPriority.today,
  });

  final String assetId;
  final int version;
  final String sourceUri;
  final AssetStatus status;
  final String? localPath;
  final int? expectedBytes;
  final int receivedBytes;

  /// Expected checksum (hex). When present, a downloaded file is only promoted
  /// to `ready` if it matches.
  final String? checksum;
  final String? mimeType;
  final Duration? duration;
  final int attempts;
  final String? lastErrorCode;
  final DateTime? lastAccess;

  /// Pinned assets are protected from eviction (active plan, emergency).
  final bool pinned;
  final AssetPriority priority;

  bool get isReady => status == AssetStatus.ready;
  bool get isTerminalFailure =>
      status == AssetStatus.failed || status == AssetStatus.corrupted;

  CachedAsset copyWith({
    AssetStatus? status,
    String? localPath,
    int? expectedBytes,
    int? receivedBytes,
    String? checksum,
    String? mimeType,
    Duration? duration,
    int? attempts,
    String? lastErrorCode,
    DateTime? lastAccess,
    bool? pinned,
    AssetPriority? priority,
  }) => CachedAsset(
    assetId: assetId,
    version: version,
    sourceUri: sourceUri,
    status: status ?? this.status,
    localPath: localPath ?? this.localPath,
    expectedBytes: expectedBytes ?? this.expectedBytes,
    receivedBytes: receivedBytes ?? this.receivedBytes,
    checksum: checksum ?? this.checksum,
    mimeType: mimeType ?? this.mimeType,
    duration: duration ?? this.duration,
    attempts: attempts ?? this.attempts,
    lastErrorCode: lastErrorCode ?? this.lastErrorCode,
    lastAccess: lastAccess ?? this.lastAccess,
    pinned: pinned ?? this.pinned,
    priority: priority ?? this.priority,
  );

  Map<String, Object?> toJson() => {
    'assetId': assetId,
    'version': version,
    'sourceUri': sourceUri,
    'status': status.name,
    'localPath': localPath,
    'expectedBytes': expectedBytes,
    'receivedBytes': receivedBytes,
    'checksum': checksum,
    'mimeType': mimeType,
    'durationMs': duration?.inMilliseconds,
    'attempts': attempts,
    'lastErrorCode': lastErrorCode,
    'lastAccess': lastAccess?.toIso8601String(),
    'pinned': pinned,
    'priority': priority.name,
  };

  static CachedAsset fromJson(Map<String, Object?> j) => CachedAsset(
    assetId: j['assetId'] as String,
    version: (j['version'] as num?)?.toInt() ?? 1,
    sourceUri: j['sourceUri'] as String? ?? '',
    status: AssetStatus.values.firstWhere(
      (s) => s.name == j['status'],
      orElse: () => AssetStatus.missing,
    ),
    localPath: j['localPath'] as String?,
    expectedBytes: (j['expectedBytes'] as num?)?.toInt(),
    receivedBytes: (j['receivedBytes'] as num?)?.toInt() ?? 0,
    checksum: j['checksum'] as String?,
    mimeType: j['mimeType'] as String?,
    duration: j['durationMs'] is num
        ? Duration(milliseconds: (j['durationMs'] as num).toInt())
        : null,
    attempts: (j['attempts'] as num?)?.toInt() ?? 0,
    lastErrorCode: j['lastErrorCode'] as String?,
    lastAccess: j['lastAccess'] is String
        ? DateTime.tryParse(j['lastAccess'] as String)
        : null,
    pinned: j['pinned'] as bool? ?? false,
    priority: AssetPriority.values.firstWhere(
      (p) => p.name == j['priority'],
      orElse: () => AssetPriority.today,
    ),
  );
}
