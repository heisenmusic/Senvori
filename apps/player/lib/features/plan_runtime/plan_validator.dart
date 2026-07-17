import '../../core/errors/player_error.dart';
import '../../core/result/result.dart';
import 'plan.dart';

/// Validates a domain [PlayerPlan] before it is allowed to become pending or
/// active (Sprint 09 · §13). An invalid plan is rejected and must never replace
/// the last-known-good plan (§14). Validation is pure — no clock, no IO — so it
/// is fully deterministic and testable.
final class PlanValidator {
  const PlanValidator();

  Result<PlayerPlan> validate(PlayerPlan plan) {
    if (plan.effectivePlanHash.isEmpty) {
      return Err(PlayerErrors.planInvalid('empty effectivePlanHash'));
    }
    if (plan.unitId.isEmpty) {
      return Err(PlayerErrors.planInvalid('empty unitId'));
    }
    if (!_isLocalDate(plan.localDate)) {
      return Err(
        PlayerErrors.planInvalid(
          'bad localDate "${plan.localDate}"',
          ctx: {'localDate': plan.localDate},
        ),
      );
    }

    final ids = <String>{};
    for (final item in plan.items) {
      if (item.id.isEmpty) {
        return Err(PlayerErrors.planInvalid('item with empty id'));
      }
      if (!ids.add(item.id)) {
        return Err(
          PlayerErrors.planInvalid(
            'duplicate item id "${item.id}"',
            ctx: {'itemId': item.id},
          ),
        );
      }
      if (item.duration.isNegative) {
        return Err(
          PlayerErrors.planInvalid(
            'negative duration on "${item.id}"',
            ctx: {'itemId': item.id},
          ),
        );
      }
      if (item.startOffset.isNegative) {
        return Err(
          PlayerErrors.planInvalid(
            'negative startOffset on "${item.id}"',
            ctx: {'itemId': item.id},
          ),
        );
      }
      // Non-interrupt playable items must reference an asset; interrupts may be
      // policy-only (silence/duck) with a null asset.
      if (item.assetId == null && !item.isInterrupt) {
        return Err(
          PlayerErrors.planInvalid(
            'playable item "${item.id}" has no assetId',
            ctx: {'itemId': item.id},
          ),
        );
      }
    }

    // Ordering invariant: items are expected in non-decreasing start offset so
    // the orchestrator can walk them linearly.
    for (var i = 1; i < plan.items.length; i++) {
      if (plan.items[i].startOffset < plan.items[i - 1].startOffset) {
        return Err(
          PlayerErrors.planInvalid('items are not ordered by startOffset'),
        );
      }
    }

    // If the plan declares an emergency, at least one emergency item must exist
    // to honour it; otherwise the flag is meaningless and rejected.
    if (plan.emergencyActive && plan.emergencyItems.isEmpty) {
      return Err(
        PlayerErrors.planInvalid(
          'emergencyActive set but no emergency item present',
        ),
      );
    }

    return Ok(plan);
  }

  static bool _isLocalDate(String s) =>
      RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(s);
}
