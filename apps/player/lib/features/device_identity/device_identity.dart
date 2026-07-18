/// Device identity (Sprint 09 · §11).
///
/// A Player represents one unit. Its identity is persistent and survives
/// restarts. Sensitive material (activation secret) is kept out of the plain
/// document and stored via a secure store port; only non-sensitive descriptive
/// fields live here. No invasive hardware fingerprinting is used — the
/// [deviceId] is a locally generated random identifier minted once.
library;

enum ActivationStatus { unactivated, pending, activated }

final class DeviceCapabilities {
  const DeviceCapabilities({
    required this.audioPlayback,
    required this.secureStorage,
    required this.keepScreenOn,
    required this.kioskMode,
  });

  final bool audioPlayback;
  final bool secureStorage;
  final bool keepScreenOn;
  final bool kioskMode;

  Map<String, Object?> toJson() => {
    'audioPlayback': audioPlayback,
    'secureStorage': secureStorage,
    'keepScreenOn': keepScreenOn,
    'kioskMode': kioskMode,
  };

  static DeviceCapabilities fromJson(Map<String, Object?> j) =>
      DeviceCapabilities(
        audioPlayback: j['audioPlayback'] as bool? ?? false,
        secureStorage: j['secureStorage'] as bool? ?? false,
        keepScreenOn: j['keepScreenOn'] as bool? ?? false,
        kioskMode: j['kioskMode'] as bool? ?? false,
      );

  static const unknown = DeviceCapabilities(
    audioPlayback: false,
    secureStorage: false,
    keepScreenOn: false,
    kioskMode: false,
  );
}

final class DeviceIdentity {
  const DeviceIdentity({
    required this.deviceId,
    required this.platform,
    required this.appVersion,
    required this.schemaVersion,
    required this.capabilities,
    required this.activationStatus,
    this.firstActivatedAt,
    this.tenantId,
    this.unitId,
    this.syncGroupId,
    this.friendlyName,
  });

  /// Locally minted, stable across restarts.
  final String deviceId;
  final String platform;
  final String appVersion;

  /// Local persistence schema version this identity document was written with.
  final int schemaVersion;
  final DeviceCapabilities capabilities;
  final ActivationStatus activationStatus;

  final DateTime? firstActivatedAt;
  final String? tenantId;
  final String? unitId;
  final String? syncGroupId;

  /// Operator-assigned label; mutable, never used as an identity key.
  final String? friendlyName;

  bool get isActivated => activationStatus == ActivationStatus.activated;

  DeviceIdentity copyWith({
    String? platform,
    String? appVersion,
    DeviceCapabilities? capabilities,
    ActivationStatus? activationStatus,
    DateTime? firstActivatedAt,
    String? tenantId,
    String? unitId,
    String? syncGroupId,
    String? friendlyName,
  }) => DeviceIdentity(
    deviceId: deviceId,
    platform: platform ?? this.platform,
    appVersion: appVersion ?? this.appVersion,
    schemaVersion: schemaVersion,
    capabilities: capabilities ?? this.capabilities,
    activationStatus: activationStatus ?? this.activationStatus,
    firstActivatedAt: firstActivatedAt ?? this.firstActivatedAt,
    tenantId: tenantId ?? this.tenantId,
    unitId: unitId ?? this.unitId,
    syncGroupId: syncGroupId ?? this.syncGroupId,
    friendlyName: friendlyName ?? this.friendlyName,
  );

  /// A partially masked device id for diagnostics/telemetry, e.g.
  /// `dev_a1b2…f9`. Never expose the full id in operator-facing surfaces.
  String get maskedDeviceId {
    if (deviceId.length <= 8) return deviceId;
    return '${deviceId.substring(0, 6)}…${deviceId.substring(deviceId.length - 2)}';
  }

  Map<String, Object?> toJson() => {
    'deviceId': deviceId,
    'platform': platform,
    'appVersion': appVersion,
    'capabilities': capabilities.toJson(),
    'activationStatus': activationStatus.name,
    'firstActivatedAt': firstActivatedAt?.toIso8601String(),
    'tenantId': tenantId,
    'unitId': unitId,
    'syncGroupId': syncGroupId,
    'friendlyName': friendlyName,
  };

  static DeviceIdentity fromJson(
    Map<String, Object?> j, {
    required int schemaVersion,
  }) => DeviceIdentity(
    deviceId: j['deviceId'] as String,
    platform: j['platform'] as String? ?? 'unknown',
    appVersion: j['appVersion'] as String? ?? '0.0.0',
    schemaVersion: schemaVersion,
    capabilities: DeviceCapabilities.fromJson(
      (j['capabilities'] as Map?)?.cast<String, Object?>() ?? const {},
    ),
    activationStatus: ActivationStatus.values.firstWhere(
      (s) => s.name == j['activationStatus'],
      orElse: () => ActivationStatus.unactivated,
    ),
    firstActivatedAt: _parseDate(j['firstActivatedAt']),
    tenantId: j['tenantId'] as String?,
    unitId: j['unitId'] as String?,
    syncGroupId: j['syncGroupId'] as String?,
    friendlyName: j['friendlyName'] as String?,
  );

  static DateTime? _parseDate(Object? v) =>
      v is String ? DateTime.tryParse(v) : null;
}
