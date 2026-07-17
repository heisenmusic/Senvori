/// Structured logging (Sprint 09 · §35).
///
/// Logs are structured events with a stable [event] name, a [level], a
/// monotonic-ish timestamp and a sanitized context map. Sinks decide what to do
/// with them (console in dev, ring buffer for diagnostics, outbox for
/// telemetry). Sensitive values must be redacted *before* they reach a log.
library;

import '../time/clock.dart';

enum LogLevel { debug, info, warning, error, fatal }

/// Canonical operational event names. Using an enum keeps the vocabulary closed
/// and greppable; §35 lists the required events.
enum LogEvent {
  playerBootStarted,
  playerBootCompleted,
  deviceIdentityLoaded,
  activationStarted,
  activationCompleted,
  planReceived,
  planRejected,
  planActivated,
  assetDownloadStarted,
  assetDownloadCompleted,
  assetDownloadFailed,
  assetEvicted,
  playbackStarted,
  playbackCompleted,
  playbackFailed,
  playbackInterrupted,
  offlineEntered,
  onlineRestored,
  storageLow,
  emergencyStarted,
  emergencyEnded,
  lifecycleTransition,
  lifecycleTransitionRejected,
  outboxEnqueued,
  outboxFlushed,
}

final class LogRecord {
  LogRecord({
    required this.level,
    required this.event,
    required this.timestamp,
    this.fields = const {},
  });

  final LogLevel level;
  final LogEvent event;
  final DateTime timestamp;
  final Map<String, Object?> fields;

  Map<String, Object?> toJson() => {
    'level': level.name,
    'event': event.name,
    'ts': timestamp.toIso8601String(),
    ...fields,
  };
}

abstract interface class LogSink {
  void add(LogRecord record);
}

/// Fan-out logger. A single instance is shared; sinks are appended at bootstrap.
final class Logger {
  Logger(this._clock, {List<LogSink>? sinks}) : _sinks = sinks ?? [];

  final Clock _clock;
  final List<LogSink> _sinks;

  void addSink(LogSink sink) => _sinks.add(sink);

  void log(
    LogLevel level,
    LogEvent event, [
    Map<String, Object?> fields = const {},
  ]) {
    final record = LogRecord(
      level: level,
      event: event,
      timestamp: _clock.now(),
      fields: _sanitize(fields),
    );
    for (final s in _sinks) {
      s.add(record);
    }
  }

  void debug(LogEvent e, [Map<String, Object?> f = const {}]) =>
      log(LogLevel.debug, e, f);
  void info(LogEvent e, [Map<String, Object?> f = const {}]) =>
      log(LogLevel.info, e, f);
  void warning(LogEvent e, [Map<String, Object?> f = const {}]) =>
      log(LogLevel.warning, e, f);
  void error(LogEvent e, [Map<String, Object?> f = const {}]) =>
      log(LogLevel.error, e, f);
  void fatal(LogEvent e, [Map<String, Object?> f = const {}]) =>
      log(LogLevel.fatal, e, f);

  /// Defensive redaction. Any field whose key looks secret is masked; full
  /// signed URLs are trimmed to their origin. Diagnostics/telemetry rely on
  /// this being applied centrally rather than at every call site.
  static Map<String, Object?> _sanitize(Map<String, Object?> fields) {
    if (fields.isEmpty) return const {};
    final out = <String, Object?>{};
    fields.forEach((k, v) {
      final key = k.toLowerCase();
      if (key.contains('token') ||
          key.contains('secret') ||
          key.contains('password') ||
          key.contains('authorization') ||
          key.contains('apikey') ||
          key == 'key') {
        out[k] = '***';
      } else if (v is String && _looksLikeSignedUrl(v)) {
        out[k] = _stripQuery(v);
      } else {
        out[k] = v;
      }
    });
    return out;
  }

  static bool _looksLikeSignedUrl(String v) =>
      v.startsWith('http') &&
      (v.contains('signature=') ||
          v.contains('token=') ||
          v.contains('X-Amz-') ||
          v.contains('sig='));

  static String _stripQuery(String url) {
    final q = url.indexOf('?');
    return q == -1 ? url : '${url.substring(0, q)}?…';
  }
}

/// In-memory ring buffer used by the diagnostics screen. Bounded so an
/// always-on player cannot grow it unbounded.
final class RingBufferSink implements LogSink {
  RingBufferSink({this.capacity = 200});
  final int capacity;
  final List<LogRecord> _records = [];

  List<LogRecord> get records => List.unmodifiable(_records);

  @override
  void add(LogRecord record) {
    _records.add(record);
    if (_records.length > capacity) {
      _records.removeRange(0, _records.length - capacity);
    }
  }

  void clear() => _records.clear();
}
