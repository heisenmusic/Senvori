/// Execution queue (Sprint 09 · §22).
///
/// The queue materialises the active plan as an ordered, observable list of
/// operational items with their own lifecycle. The UI may *view* the queue but
/// must never reorder it — ordering is a runtime concern derived from the plan.
library;

import '../plan_runtime/plan.dart';

enum QueueItemState {
  scheduled,
  preparing,
  ready,
  playing,
  completed,
  skipped,
  failed,
  interrupted,
}

final class QueueItem {
  QueueItem({
    required this.planItem,
    this.state = QueueItemState.scheduled,
    this.attempts = 0,
    this.errorCode,
  });

  final PlanItem planItem;
  QueueItemState state;
  int attempts;
  String? errorCode;

  String get id => planItem.id;
  bool get isTerminal =>
      state == QueueItemState.completed ||
      state == QueueItemState.skipped ||
      state == QueueItemState.failed;
}

/// An ordered queue over a plan's non-emergency items. Emergency items are held
/// separately by the orchestrator so they can interrupt regardless of position.
final class ExecutionQueue {
  ExecutionQueue(PlayerPlan plan)
    : _items = plan.items
          .where((i) => !i.isEmergency)
          .map((i) => QueueItem(planItem: i))
          .toList(),
      effectivePlanHash = plan.effectivePlanHash;

  final List<QueueItem> _items;
  final String effectivePlanHash;
  int _cursor = 0;

  List<QueueItem> get items => List.unmodifiable(_items);
  int get length => _items.length;
  bool get isEmpty => _items.isEmpty;

  QueueItem? get current =>
      _cursor >= 0 && _cursor < _items.length ? _items[_cursor] : null;

  QueueItem? peekNext() {
    final n = _cursor + 1;
    return n < _items.length ? _items[n] : null;
  }

  /// Advances the cursor to the next non-terminal item, returning it (or null
  /// when the queue is exhausted). Wraps to the start when the day's list is a
  /// continuous rotation and every item has completed — a fresh cycle reruns.
  QueueItem? advance({bool rotate = true}) {
    if (_items.isEmpty) return null;
    _cursor++;
    if (_cursor >= _items.length) {
      if (!rotate) return null;
      _resetStates();
      _cursor = 0;
    }
    return current;
  }

  void _resetStates() {
    for (final i in _items) {
      i.state = QueueItemState.scheduled;
      i.attempts = 0;
      i.errorCode = null;
    }
  }

  void markCurrent(
    QueueItemState state, {
    String? errorCode,
    bool incrementAttempt = false,
  }) {
    final c = current;
    if (c == null) return;
    c.state = state;
    if (errorCode != null) c.errorCode = errorCode;
    if (incrementAttempt) c.attempts++;
  }
}
