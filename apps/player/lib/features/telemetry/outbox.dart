/// Operational telemetry & Proof-of-Play foundation (Sprint 09 · §36–§37).
///
/// Honesty note: these are *prepared* operational-telemetry events, NOT a
/// certified Proof of Play. The transport is pluggable and, in this sprint,
/// defaults to a no-op/mock. The outbox itself is real: it persists before
/// sending, deduplicates by idempotency key, retries, batches, bounds its size
/// and preserves critical events over non-critical ones under pressure.
library;

import 'dart:collection';

import '../../core/logging/logger.dart';
import '../../core/persistence/key_value_store.dart';
import '../../core/time/clock.dart';

enum TelemetryKind {
  planActivated,
  itemPrepared,
  playbackStarted,
  playbackProgress,
  playbackCompleted,
  playbackFailed,
  playbackSkipped,
  playbackInterrupted,
  emergencyPlayback,
}

extension TelemetryKindX on TelemetryKind {
  /// Critical events are preserved when the outbox is pruned under pressure;
  /// non-critical (e.g. progress checkpoints) may be dropped.
  bool get isCritical => switch (this) {
    TelemetryKind.playbackProgress => false,
    TelemetryKind.itemPrepared => false,
    _ => true,
  };
}

final class TelemetryEvent {
  const TelemetryEvent({
    required this.idempotencyKey,
    required this.kind,
    required this.createdAt,
    required this.fields,
  });

  /// Stable id: the same logical event produced twice carries the same key, so
  /// a retry after an ambiguous send never double-counts.
  final String idempotencyKey;
  final TelemetryKind kind;
  final DateTime createdAt;
  final Map<String, Object?> fields;

  Map<String, Object?> toJson() => {
    'idempotencyKey': idempotencyKey,
    'kind': kind.name,
    'createdAt': createdAt.toIso8601String(),
    'fields': fields,
  };

  static TelemetryEvent fromJson(Map<String, Object?> j) => TelemetryEvent(
    idempotencyKey: j['idempotencyKey'] as String,
    kind: TelemetryKind.values.firstWhere(
      (k) => k.name == j['kind'],
      orElse: () => TelemetryKind.playbackProgress,
    ),
    createdAt:
        DateTime.tryParse(j['createdAt'] as String? ?? '') ?? DateTime(1970),
    fields: (j['fields'] as Map?)?.cast<String, Object?>() ?? const {},
  );
}

/// Transport that ships a batch of events. Returns the keys it durably
/// accepted. A mock/no-op transport (this sprint's default) accepts nothing,
/// so events remain queued — proving the outbox persists and does not lose
/// data when there is no real backend.
abstract interface class TelemetryTransport {
  Future<Set<String>> send(List<TelemetryEvent> batch);
}

/// Prepared transport stub. Accepts nothing (events stay queued) unless
/// [enabled] is flipped, at which point it "accepts" everything. Used to prove
/// flush/dedup behaviour without a network.
final class MockTelemetryTransport implements TelemetryTransport {
  MockTelemetryTransport({this.enabled = false});
  bool enabled;
  final List<TelemetryEvent> sent = [];

  @override
  Future<Set<String>> send(List<TelemetryEvent> batch) async {
    if (!enabled) return const {};
    sent.addAll(batch);
    return batch.map((e) => e.idempotencyKey).toSet();
  }
}

final class Outbox {
  Outbox({
    required DocumentStore store,
    required TelemetryTransport transport,
    required Logger logger,
    required Clock clock,
    this.capacity = 5000,
    this.batchSize = 50,
    this.storageKey = 'telemetry_outbox',
    this.schemaVersion = 1,
  }) : _store = store,
       _transport = transport,
       _logger = logger,
       _clock = clock;

  final DocumentStore _store;
  final TelemetryTransport _transport;
  final Logger _logger;
  final Clock _clock;
  final int capacity;
  final int batchSize;
  final String storageKey;
  final int schemaVersion;

  final LinkedHashMap<String, TelemetryEvent> _events = LinkedHashMap();

  int get length => _events.length;
  List<TelemetryEvent> get pending => _events.values.toList(growable: false);

  Future<void> restore() async {
    try {
      final doc = await _store.read(storageKey);
      if (doc == null || doc.schemaVersion != schemaVersion) return;
      final list = (doc.data['events'] as List?) ?? const [];
      for (final e in list.cast<Map>()) {
        final ev = TelemetryEvent.fromJson(e.cast<String, Object?>());
        _events[ev.idempotencyKey] = ev;
      }
    } on FormatException {
      _events.clear();
    }
  }

  /// Enqueues an event, deduplicating by idempotency key. Persists immediately
  /// so an event survives a crash between enqueue and flush.
  Future<void> enqueue(TelemetryEvent event) async {
    if (_events.containsKey(event.idempotencyKey)) return;
    _events[event.idempotencyKey] = event;
    _prune();
    await _persist();
    _logger.debug(LogEvent.outboxEnqueued, {'kind': event.kind.name});
  }

  /// Convenience for building an event with a monotonic-ish created time.
  TelemetryEvent build(
    TelemetryKind kind,
    String idempotencyKey,
    Map<String, Object?> fields,
  ) => TelemetryEvent(
    idempotencyKey: idempotencyKey,
    kind: kind,
    createdAt: _clock.now(),
    fields: fields,
  );

  /// Attempts to flush one batch. Only keys the transport durably accepted are
  /// removed; the rest remain for the next attempt (at-least-once + dedup on the
  /// server via idempotency key ⇒ effectively once).
  Future<int> flush() async {
    if (_events.isEmpty) return 0;
    final batch = _events.values.take(batchSize).toList();
    final accepted = await _transport.send(batch);
    if (accepted.isEmpty) return 0;
    _events.removeWhere((k, _) => accepted.contains(k));
    await _persist();
    _logger.info(LogEvent.outboxFlushed, {
      'accepted': accepted.length,
      'remaining': _events.length,
    });
    return accepted.length;
  }

  /// Bounds the outbox: when over capacity, drop the oldest *non-critical*
  /// events first; only if still over capacity drop oldest critical ones.
  void _prune() {
    if (_events.length <= capacity) return;
    final overflow = _events.length - capacity;
    var removed = 0;
    final nonCriticalKeys = _events.entries
        .where((e) => !e.value.kind.isCritical)
        .map((e) => e.key)
        .toList();
    for (final k in nonCriticalKeys) {
      if (removed >= overflow) break;
      _events.remove(k);
      removed++;
    }
    while (removed < overflow && _events.isNotEmpty) {
      _events.remove(_events.keys.first);
      removed++;
    }
  }

  Future<void> _persist() => _store.write(
    storageKey,
    StoredDocument(
      schemaVersion: schemaVersion,
      data: {'events': _events.values.map((e) => e.toJson()).toList()},
    ),
  );
}
