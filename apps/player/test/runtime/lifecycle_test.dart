import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/app/player_lifecycle.dart';
import 'package:senvori_player/core/logging/logger.dart';
import 'package:senvori_player/core/time/clock.dart';

void main() {
  late Logger logger;
  late FakeClock clock;
  late FakeMonotonicClock mono;

  PlayerLifecycle build() =>
      PlayerLifecycle(logger: logger, clock: clock, monotonic: mono);

  setUp(() {
    clock = FakeClock(DateTime.utc(2026, 7, 17));
    mono = FakeMonotonicClock();
    logger = Logger(clock);
  });

  test('starts in booting', () {
    expect(build().state, PlayerLifecycleState.booting);
  });

  test('valid transition is applied and emitted', () async {
    final lc = build();
    final future = lc.changes.first;
    expect(
      lc.transition(PlayerLifecycleState.loadingConfiguration, reason: 'x'),
      isTrue,
    );
    expect(lc.state, PlayerLifecycleState.loadingConfiguration);
    expect(await future, PlayerLifecycleState.loadingConfiguration);
  });

  test('invalid transition is rejected and state is unchanged', () {
    final lc = build();
    // booting -> playing is not allowed.
    expect(lc.transition(PlayerLifecycleState.playing, reason: 'bad'), isFalse);
    expect(lc.state, PlayerLifecycleState.booting);
  });

  test('same-state transition is a no-op success and updates reason', () {
    final lc = build();
    expect(
      lc.transition(PlayerLifecycleState.booting, reason: 'again'),
      isTrue,
    );
    expect(lc.reason, 'again');
  });

  test('timeInState uses the monotonic clock', () {
    final lc = build();
    lc.transition(PlayerLifecycleState.loadingConfiguration, reason: 'x');
    mono.advance(const Duration(seconds: 5));
    expect(lc.timeInState, const Duration(seconds: 5));
  });

  test('canTransition matches the table', () {
    expect(
      PlayerLifecycle.canTransition(
        PlayerLifecycleState.playing,
        PlayerLifecycleState.emergency,
      ),
      isTrue,
    );
    expect(
      PlayerLifecycle.canTransition(
        PlayerLifecycleState.awaitingActivation,
        PlayerLifecycleState.playing,
      ),
      isFalse,
    );
  });

  test('emergency returns to an operational state', () {
    final lc = build();
    lc.transition(PlayerLifecycleState.loadingConfiguration, reason: '1');
    lc.transition(PlayerLifecycleState.synchronizing, reason: '2');
    lc.transition(PlayerLifecycleState.ready, reason: '3');
    lc.transition(PlayerLifecycleState.playing, reason: '4');
    expect(
      lc.transition(PlayerLifecycleState.emergency, reason: 'emg'),
      isTrue,
    );
    expect(
      lc.transition(PlayerLifecycleState.playing, reason: 'restore'),
      isTrue,
    );
  });
}
