/// Injectable time sources.
///
/// The runtime never calls [DateTime.now] directly. Two distinct notions of
/// time exist and must not be conflated (Sprint 09 · §21):
///
///  * **Wall / calendar time** — used for schedule windows, `localDate`,
///    telemetry timestamps. Subject to clock adjustments, NTP steps and DST.
///  * **Monotonic time** — never runs backwards, unaffected by wall-clock
///    changes. Used for elapsed-time reasoning: playback position sanity,
///    backoff, soak measurements, uptime.
library;

/// Wall-clock source. Injected everywhere calendar time is needed so tests can
/// pin "now" deterministically.
abstract interface class Clock {
  DateTime now();
}

/// Monotonic source. The returned [Duration] is only meaningful relative to
/// another reading from the *same* clock instance.
abstract interface class MonotonicClock {
  Duration elapsed();
}

/// Production wall clock. Returns UTC to keep the runtime timezone-agnostic;
/// local-date derivation happens explicitly where a timezone is available.
final class SystemClock implements Clock {
  const SystemClock();

  @override
  DateTime now() => DateTime.now().toUtc();
}

/// Production monotonic clock backed by a process-lifetime [Stopwatch].
final class SystemMonotonicClock implements MonotonicClock {
  SystemMonotonicClock() : _sw = Stopwatch()..start();

  final Stopwatch _sw;

  @override
  Duration elapsed() => _sw.elapsed;
}

/// Test wall clock. Advance time explicitly; never ticks on its own.
final class FakeClock implements Clock {
  FakeClock(this._now);

  DateTime _now;

  @override
  DateTime now() => _now;

  /// Move wall time forward. Negative values are allowed to model a clock step
  /// backwards (e.g. NTP correction) — the runtime must tolerate this.
  void advance(Duration by) => _now = _now.add(by);

  /// Jump to an absolute instant.
  void set(DateTime instant) => _now = instant;
}

/// Test monotonic clock. Only ever moves forward; [advance] rejects negatives
/// because a real monotonic source cannot go backwards.
final class FakeMonotonicClock implements MonotonicClock {
  FakeMonotonicClock([Duration start = Duration.zero]) : _elapsed = start;

  Duration _elapsed;

  @override
  Duration elapsed() => _elapsed;

  void advance(Duration by) {
    if (by.isNegative) {
      throw ArgumentError.value(by, 'by', 'monotonic time cannot go backwards');
    }
    _elapsed += by;
  }
}
