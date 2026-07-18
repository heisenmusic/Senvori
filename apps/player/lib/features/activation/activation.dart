/// Player activation (Sprint 09 · §12).
///
/// A Player pairs to a unit by displaying a short code the operator enters in
/// the Dashboard. The backend confirms the pairing out-of-band. This sprint
/// models the flow behind a [ActivationGateway] port; the default gateway is a
/// deterministic mock (honest: no real backend is contacted). Tokens/secrets
/// returned by a real gateway must be stored via secure storage, never logged.
library;

import '../../core/errors/player_error.dart';
import '../../core/result/result.dart';
import '../../core/time/clock.dart';

/// Result of a completed pairing: the unit/tenant the Player is bound to.
final class ActivationResult {
  const ActivationResult({
    required this.tenantId,
    required this.unitId,
    this.syncGroupId,
    this.friendlyName,
  });
  final String tenantId;
  final String unitId;
  final String? syncGroupId;
  final String? friendlyName;
}

/// A short-lived activation code the operator types into the Dashboard.
final class ActivationCode {
  const ActivationCode({required this.code, required this.expiresAt});
  final String code;
  final DateTime expiresAt;

  bool isExpired(DateTime now) => !now.isBefore(expiresAt);

  /// Human-friendly grouping, e.g. `ABCD-1234`.
  String get display {
    if (code.length <= 4) return code;
    final mid = code.length ~/ 2;
    return '${code.substring(0, mid)}-${code.substring(mid)}';
  }
}

/// Port to the pairing backend. Requests a code, then polls for confirmation.
abstract interface class ActivationGateway {
  Future<ActivationCode> requestCode(String deviceId);
  Future<Result<ActivationResult?>> poll(String deviceId, String code);
}

/// Deterministic mock gateway for tests/demo. Confirms after [confirmAfterPolls]
/// polls, or reports expiry/invalid based on the injected clock.
final class MockActivationGateway implements ActivationGateway {
  MockActivationGateway({
    required Clock clock,
    this.confirmAfterPolls = 2,
    this.codeTtl = const Duration(minutes: 5),
    this.result = const ActivationResult(
      tenantId: 'tenant-demo',
      unitId: 'unit-demo',
      syncGroupId: 'sg-demo',
      friendlyName: 'Demo Unit',
    ),
  }) : _clock = clock;

  final Clock _clock;
  final int confirmAfterPolls;
  final Duration codeTtl;
  final ActivationResult result;
  int _polls = 0;
  ActivationCode? _issued;

  @override
  Future<ActivationCode> requestCode(String deviceId) async {
    _polls = 0;
    _issued = ActivationCode(
      code: 'SENV${deviceId.hashCode.abs() % 10000}',
      expiresAt: _clock.now().add(codeTtl),
    );
    return _issued!;
  }

  @override
  Future<Result<ActivationResult?>> poll(String deviceId, String code) async {
    final issued = _issued;
    if (issued == null || issued.code != code) {
      return Err(PlayerErrors.activationInvalidCode());
    }
    if (issued.isExpired(_clock.now())) {
      return Err(PlayerErrors.activationExpired());
    }
    _polls++;
    if (_polls >= confirmAfterPolls) return Ok(result);
    return const Ok(null); // still pending
  }
}

/// Drives request → poll → confirm. Pure orchestration over the gateway; the
/// UI observes [state].
enum ActivationPhase { idle, requesting, awaiting, confirmed, error }

final class ActivationController {
  ActivationController({
    required ActivationGateway gateway,
    required Clock clock,
  }) : _gateway = gateway,
       _clock = clock;

  final ActivationGateway _gateway;
  final Clock _clock;

  ActivationPhase phase = ActivationPhase.idle;
  ActivationCode? code;
  ActivationResult? result;
  PlayerError? error;

  Future<void> start(String deviceId) async {
    phase = ActivationPhase.requesting;
    error = null;
    try {
      code = await _gateway.requestCode(deviceId);
      phase = ActivationPhase.awaiting;
    } catch (e) {
      error = PlayerErrors.activationInvalidCode().copyWith(cause: e);
      phase = ActivationPhase.error;
    }
  }

  /// One poll step. Returns true when confirmed. Handles expiry by moving to
  /// error so the UI can offer "try again".
  Future<bool> pollOnce(String deviceId) async {
    final c = code;
    if (c == null) return false;
    if (c.isExpired(_clock.now())) {
      error = PlayerErrors.activationExpired();
      phase = ActivationPhase.error;
      return false;
    }
    final res = await _gateway.poll(deviceId, c.code);
    return res.fold(
      (value) {
        if (value != null) {
          result = value;
          phase = ActivationPhase.confirmed;
          return true;
        }
        return false;
      },
      (err) {
        error = err;
        phase = ActivationPhase.error;
        return false;
      },
    );
  }
}
