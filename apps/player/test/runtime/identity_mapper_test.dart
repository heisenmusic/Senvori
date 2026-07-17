import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/app/player_lifecycle.dart';
import 'package:senvori_player/app/view_state_mapper.dart';
import 'package:senvori_player/core/persistence/key_value_store.dart';
import 'package:senvori_player/features/connectivity/connectivity.dart';
import 'package:senvori_player/features/device_identity/device_identity.dart';
import 'package:senvori_player/features/device_identity/device_identity_repository.dart';
import 'package:senvori_player/features/now_playing/now_playing_view_state.dart';
import 'package:senvori_player/features/playback/playback_orchestrator.dart';

void main() {
  group('DeviceIdentityRepository', () {
    test(
      'mints a stable identity on first run and reloads the same id',
      () async {
        final backend = InMemoryKeyValueStore();
        var minted = 0;
        DeviceIdentityRepository repo() => DeviceIdentityRepository(
          store: DocumentStore(backend),
          idGenerator: () => 'dev_${minted++}',
          platform: 'linux',
          appVersion: '1.0.0',
          capabilities: DeviceCapabilities.unknown,
        );
        final first = await repo().loadOrCreate();
        final second = await repo().loadOrCreate();
        expect(first.deviceId, second.deviceId);
        expect(minted, 1); // generator only called once
        expect(first.activationStatus, ActivationStatus.unactivated);
      },
    );

    test('masks the device id for diagnostics', () {
      const id = DeviceIdentity(
        deviceId: 'dev_abcdef123456',
        platform: 'linux',
        appVersion: '1',
        schemaVersion: 1,
        capabilities: DeviceCapabilities.unknown,
        activationStatus: ActivationStatus.activated,
      );
      expect(id.maskedDeviceId.contains('…'), isTrue);
      expect(id.maskedDeviceId.contains('abcdef123456'), isFalse);
    });
  });

  group('ViewStateMapper', () {
    OrchestratorSnapshot snap({
      bool emergency = false,
      bool degraded = false,
    }) => OrchestratorSnapshot(
      current: null,
      next: null,
      emergencyActive: emergency,
      degraded: degraded,
      playback: OrchestratorSnapshot.idle.playback,
    );

    test('emergency overrides everything', () {
      expect(
        ViewStateMapper.status(
          lifecycle: PlayerLifecycleState.playing,
          orchestrator: snap(emergency: true),
          connectivity: ConnectivityState.apiReachable,
        ),
        OperationalStatus.emergency,
      );
    });

    test('storage low takes precedence over normal states', () {
      expect(
        ViewStateMapper.status(
          lifecycle: PlayerLifecycleState.playing,
          orchestrator: snap(),
          connectivity: ConnectivityState.apiReachable,
          storageLow: true,
        ),
        OperationalStatus.storageLow,
      );
    });

    test('offline lifecycle maps to offlineOperational', () {
      expect(
        ViewStateMapper.status(
          lifecycle: PlayerLifecycleState.offlineOperational,
          orchestrator: snap(),
          connectivity: ConnectivityState.offline,
        ),
        OperationalStatus.offlineOperational,
      );
    });
  });
}
