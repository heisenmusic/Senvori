import '../../core/errors/player_error.dart';
import '../../core/logging/logger.dart';
import '../../core/persistence/key_value_store.dart';
import '../../core/result/result.dart';
import 'plan.dart';
import 'plan_validator.dart';

/// Holds the three plan slots and enforces the fallback rules (Sprint 09 · §14).
///
///  * `lastKnownGood` — the newest plan proven both valid *and* runnable
///    (assets ready). Persisted; survives restarts and offline boots.
///  * `pending` — a freshly received, validated plan whose assets are still
///    being prepared. Not yet promoted.
///  * `active` — what the orchestrator currently runs.
///
/// Rules enforced here:
///  * An invalid plan is rejected and never touches any slot.
///  * A new plan enters as `pending`; it only becomes `active` once explicitly
///    activated (caller confirms asset readiness).
///  * Activation preserves the previous active plan as `lastKnownGood`.
///  * A sync/network failure never destroys the active plan.
final class PlanStore {
  PlanStore({
    required DocumentStore store,
    required Logger logger,
    PlanValidator validator = const PlanValidator(),
    this.storageKey = 'last_known_good_plan',
    this.schemaVersion = 1,
  }) : _store = store,
       _logger = logger,
       _validator = validator;

  final DocumentStore _store;
  final Logger _logger;
  final PlanValidator _validator;
  final String storageKey;
  final int schemaVersion;

  PlayerPlan? _lastKnownGood;
  PlayerPlan? _pending;
  PlayerPlan? _active;

  PlayerPlan? get lastKnownGood => _lastKnownGood;
  PlayerPlan? get pending => _pending;
  PlayerPlan? get active => _active;

  /// Loads the persisted last-known-good plan into memory. On corruption the
  /// slot is left empty (recoverable) and the error is returned, never thrown.
  Future<Result<PlayerPlan?>> restore() async {
    try {
      final doc = await _store.read(storageKey);
      if (doc == null) return const Ok(null);
      if (doc.schemaVersion != schemaVersion) {
        // Future: run migrations. For v1 an unknown version is treated as
        // unusable but non-fatal — we simply start without a cached plan.
        _logger.warning(LogEvent.planRejected, {
          'reason': 'schema_version_mismatch',
          'found': doc.schemaVersion,
          'expected': schemaVersion,
        });
        return const Ok(null);
      }
      final plan = PlayerPlan.fromJson(doc.data);
      final validated = _validator.validate(plan);
      return validated.fold(
        (p) {
          _lastKnownGood = p;
          _active = p; // boot straight into the last good plan (offline-first)
          return Ok<PlayerPlan?>(p);
        },
        (err) {
          _logger.warning(LogEvent.planRejected, {
            'reason': 'restore_invalid',
            'code': err.code,
          });
          return const Ok<PlayerPlan?>(null);
        },
      );
    } on FormatException catch (e) {
      // Corrupted persisted state: do not loop, do not wipe silently — surface
      // it. The bootstrap decides recovery (start without cache).
      final err = PlayerErrors.persistenceCorrupted(storageKey, cause: e);
      _logger.error(LogEvent.planRejected, {
        'reason': 'corrupted',
        'store': storageKey,
      });
      return Err(err);
    }
  }

  /// Validates and stages a received plan as `pending`. The active plan is
  /// untouched, so a bad or not-yet-ready plan cannot interrupt playback.
  Result<PlayerPlan> receive(PlayerPlan plan) {
    _logger.info(LogEvent.planReceived, {
      'unitId': plan.unitId,
      'effectivePlanHash': plan.effectivePlanHash,
    });
    final validated = _validator.validate(plan);
    return validated.fold(
      (p) {
        _pending = p;
        return Ok(p);
      },
      (err) {
        _logger.warning(LogEvent.planRejected, {
          'code': err.code,
          'message': err.message,
        });
        return Err(err);
      },
    );
  }

  /// Promotes the pending plan to active once the caller has confirmed its
  /// assets are ready. Persists it as the new last-known-good. Returns an error
  /// if there is nothing pending or the pending hash does not match.
  Future<Result<PlayerPlan>> activatePending(String effectivePlanHash) async {
    final pending = _pending;
    if (pending == null || pending.effectivePlanHash != effectivePlanHash) {
      return Err(
        PlayerErrors.planInvalid('no matching pending plan to activate'),
      );
    }
    _active = pending;
    _lastKnownGood = pending;
    _pending = null;
    await _persist(pending);
    _logger.info(LogEvent.planActivated, {
      'effectivePlanHash': pending.effectivePlanHash,
      'basePlanHash': pending.basePlanHash,
      'emergencyActive': pending.emergencyActive,
    });
    return Ok(pending);
  }

  /// Discards a pending plan (e.g. its assets failed to prepare). The active
  /// plan continues untouched.
  void discardPending() => _pending = null;

  Future<void> _persist(PlayerPlan plan) => _store.write(
    storageKey,
    StoredDocument(schemaVersion: schemaVersion, data: plan.toJson()),
  );
}
