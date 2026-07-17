import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/core/logging/logger.dart';
import 'package:senvori_player/core/persistence/key_value_store.dart';
import 'package:senvori_player/core/time/clock.dart';
import 'package:senvori_player/features/connectivity/connectivity.dart';
import 'package:senvori_player/features/telemetry/outbox.dart';

class _Probe implements ConnectivityProbe {
  _Probe(this.state);
  ConnectivityState state;
  @override
  Future<ConnectivityState> probe() async => state;
}

void main() {
  group('Outbox', () {
    late InMemoryKeyValueStore backend;
    late DocumentStore store;
    late MockTelemetryTransport transport;
    late FakeClock clock;

    Outbox build() => Outbox(
      store: store,
      transport: transport,
      logger: Logger(clock),
      clock: clock,
      capacity: 3,
    );

    setUp(() {
      backend = InMemoryKeyValueStore();
      store = DocumentStore(backend);
      transport = MockTelemetryTransport();
      clock = FakeClock(DateTime.utc(2026, 7, 17));
    });

    test('deduplicates by idempotency key', () async {
      final ob = build();
      await ob.enqueue(ob.build(TelemetryKind.playbackStarted, 'k1', {}));
      await ob.enqueue(ob.build(TelemetryKind.playbackStarted, 'k1', {}));
      expect(ob.length, 1);
    });

    test(
      'flush removes only accepted events; nothing accepted when transport disabled',
      () async {
        final ob = build();
        await ob.enqueue(ob.build(TelemetryKind.playbackStarted, 'k1', {}));
        expect(await ob.flush(), 0); // transport disabled ⇒ stays queued
        expect(ob.length, 1);
        transport.enabled = true;
        expect(await ob.flush(), 1);
        expect(ob.length, 0);
      },
    );

    test(
      'persists across restart (a new outbox restores queued events)',
      () async {
        final ob1 = build();
        await ob1.enqueue(
          ob1.build(TelemetryKind.playbackCompleted, 'k1', {'itemId': 'x'}),
        );
        final ob2 = Outbox(
          store: DocumentStore(backend),
          transport: transport,
          logger: Logger(clock),
          clock: clock,
        );
        await ob2.restore();
        expect(ob2.length, 1);
      },
    );

    test('prune drops non-critical events first when over capacity', () async {
      final ob = build(); // capacity 3
      await ob.enqueue(
        ob.build(TelemetryKind.playbackProgress, 'p1', {}),
      ); // non-critical
      await ob.enqueue(
        ob.build(TelemetryKind.playbackStarted, 'c1', {}),
      ); // critical
      await ob.enqueue(
        ob.build(TelemetryKind.playbackStarted, 'c2', {}),
      ); // critical
      await ob.enqueue(
        ob.build(TelemetryKind.playbackStarted, 'c3', {}),
      ); // critical -> over cap
      expect(ob.length, 3);
      // The non-critical progress event should have been dropped.
      expect(ob.pending.any((e) => e.idempotencyKey == 'p1'), isFalse);
    });
  });

  group('ConnectivityMonitor', () {
    test('emits and logs offline->online edges', () async {
      final probe = _Probe(ConnectivityState.offline);
      final mon = ConnectivityMonitor(
        probe: probe,
        logger: Logger(FakeClock(DateTime.utc(2026))),
      );
      final events = <ConnectivityState>[];
      mon.changes.listen(events.add);

      await mon.evaluate();
      expect(mon.state, ConnectivityState.offline);
      expect(mon.state.isOperationalOffline, isTrue);

      probe.state = ConnectivityState.apiReachable;
      await mon.evaluate();
      expect(mon.state.canReachApi, isTrue);

      await Future<void>.delayed(Duration.zero);
      expect(events, [
        ConnectivityState.offline,
        ConnectivityState.apiReachable,
      ]);
      await mon.dispose();
    });

    test('no event when state is unchanged', () async {
      final mon = ConnectivityMonitor(
        probe: _Probe(ConnectivityState.apiReachable),
        logger: Logger(FakeClock(DateTime.utc(2026))),
      );
      await mon.evaluate();
      var count = 0;
      mon.changes.listen((_) => count++);
      await mon.evaluate();
      await Future<void>.delayed(Duration.zero);
      expect(count, 0);
      await mon.dispose();
    });
  });
}
