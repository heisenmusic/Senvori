import '../../core/persistence/key_value_store.dart';
import 'device_identity.dart';

/// Mints and persists the device identity. On first launch it generates a
/// [DeviceIdentity] with a random [DeviceIdentity.deviceId] and persists it;
/// on subsequent launches it loads the same one. The generator and clock are
/// injected so tests are deterministic.
final class DeviceIdentityRepository {
  DeviceIdentityRepository({
    required DocumentStore store,
    required String Function() idGenerator,
    required String platform,
    required String appVersion,
    required DeviceCapabilities capabilities,
    this.storageKey = 'device_identity',
    this.schemaVersion = 1,
  }) : _store = store,
       _idGenerator = idGenerator,
       _platform = platform,
       _appVersion = appVersion,
       _capabilities = capabilities;

  final DocumentStore _store;
  final String Function() _idGenerator;
  final String _platform;
  final String _appVersion;
  final DeviceCapabilities _capabilities;
  final String storageKey;
  final int schemaVersion;

  /// Loads the persisted identity, minting and persisting a fresh one on first
  /// run. Always refreshes volatile descriptive fields (app version, platform,
  /// capabilities) since those can legitimately change between launches without
  /// changing identity.
  Future<DeviceIdentity> loadOrCreate() async {
    final doc = await _store.read(storageKey);
    if (doc == null) {
      final identity = DeviceIdentity(
        deviceId: _idGenerator(),
        platform: _platform,
        appVersion: _appVersion,
        schemaVersion: schemaVersion,
        capabilities: _capabilities,
        activationStatus: ActivationStatus.unactivated,
      );
      await save(identity);
      return identity;
    }
    final existing = DeviceIdentity.fromJson(
      doc.data,
      schemaVersion: doc.schemaVersion,
    );
    final refreshed = existing.copyWith(
      platform: _platform,
      appVersion: _appVersion,
      capabilities: _capabilities,
    );
    if (_differs(existing, refreshed)) {
      await save(refreshed);
    }
    return refreshed;
  }

  Future<void> save(DeviceIdentity identity) => _store.write(
    storageKey,
    StoredDocument(schemaVersion: schemaVersion, data: identity.toJson()),
  );

  bool _differs(DeviceIdentity a, DeviceIdentity b) =>
      a.platform != b.platform ||
      a.appVersion != b.appVersion ||
      a.capabilities.audioPlayback != b.capabilities.audioPlayback ||
      a.capabilities.secureStorage != b.capabilities.secureStorage ||
      a.capabilities.keepScreenOn != b.capabilities.keepScreenOn ||
      a.capabilities.kioskMode != b.capabilities.kioskMode;
}
