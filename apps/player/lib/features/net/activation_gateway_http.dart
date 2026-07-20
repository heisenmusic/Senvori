/// Real activation gateway (Sprint 10B) — proof-of-possession pairing.
///
/// Implements the Sprint 09 [ActivationGateway] port (`requestCode` → `poll`)
/// over the Sprint 10A activation endpoints:
///
///   requestCode → POST /v1/player/activation/start   (sends only sha256(secret))
///   poll        → GET  /v1/player/activation/:code    (status only)
///               → POST /v1/player/activation/complete (once claimed; mints token)
///
/// The raw high-entropy `activationSecret` never travels — only its SHA-256 hash
/// does, so knowledge of the displayed code alone cannot claim a credential. On
/// `complete` the server returns the raw device token exactly once; this gateway
/// persists it via [TokenStore] as a side effect (the port's `ActivationResult`
/// intentionally carries no token — it is a secret, not descriptive data) and
/// returns the tenant/unit binding for the identity record.
///
/// Honesty: `complete` is single-use (replay ⇒ 409). If the app is killed after
/// the operator claims but before `complete` succeeds, the in-memory secret is
/// lost and the device must restart activation with a fresh code — the token is
/// never recoverable after its one issuance.
library;

import 'dart:convert';
import 'dart:math';

import '../../core/crypto/sha256.dart';
import '../../core/errors/player_error.dart';
import '../../core/persistence/token_store.dart';
import '../../core/result/result.dart';
import '../activation/activation.dart';
import '../device_identity/device_identity.dart';
import 'player_http_client.dart';

const String kActivationStartRoute = 'player/activation/start';
const String kActivationCompleteRoute = 'player/activation/complete';
String activationStatusRoute(String code) => 'player/activation/$code';

final class HttpActivationGateway implements ActivationGateway {
  HttpActivationGateway({
    required PlayerHttpClient http,
    required TokenStore tokenStore,
    required String platform,
    required String appVersion,
    required DeviceCapabilities capabilities,
    Random? random,
  }) : _http = http,
       _tokenStore = tokenStore,
       _platform = platform,
       _appVersion = appVersion,
       _capabilities = capabilities,
       _random = random ?? Random.secure();

  final PlayerHttpClient _http;
  final TokenStore _tokenStore;
  final String _platform;
  final String _appVersion;
  final DeviceCapabilities _capabilities;
  final Random _random;

  // Raw proof-of-possession secret, held only between start and complete.
  String? _pendingSecret;
  String? _pendingCode;
  ActivationResult? _confirmed;

  @override
  Future<ActivationCode> requestCode(String deviceId) async {
    final secret = _generateSecret();
    final secretHash = sha256HexOfString(secret);

    final res = await _http.postJson(kActivationStartRoute, {
      'schemaVersion': 1,
      'deviceId': deviceId,
      'platform': _platform,
      'appVersion': _appVersion,
      'activationSecretHash': secretHash,
      'capabilities': _capabilities.toJson(),
    });

    final code = res.json['code'] as String?;
    final expiresAt = _parseDate(res.json['expiresAt']);
    if (code == null || expiresAt == null) {
      throw const PlayerHttpException(0, 'malformed activation start response');
    }

    _pendingSecret = secret;
    _pendingCode = code;
    _confirmed = null;
    return ActivationCode(code: code, expiresAt: expiresAt);
  }

  @override
  Future<Result<ActivationResult?>> poll(String deviceId, String code) async {
    // Idempotent success: once confirmed, keep returning the same binding.
    if (_confirmed != null) return Ok(_confirmed);

    try {
      final res = await _http.getJson(activationStatusRoute(code));
      final status = res.json['status'] as String? ?? 'pending';
      switch (status) {
        case 'pending':
          return const Ok(null);
        case 'claimed':
          return _complete(code);
        case 'completed':
          // Server considers it done but we hold no confirmed binding (e.g. the
          // app restarted between claim and complete). The token was issued once
          // and cannot be recovered — restart activation.
          return Err(PlayerErrors.activationInvalidCode());
        case 'expired':
          return Err(PlayerErrors.activationExpired());
        case 'revoked':
        default:
          return Err(PlayerErrors.activationInvalidCode());
      }
    } on PlayerHttpException catch (e) {
      if (e.statusCode == 404) return Err(PlayerErrors.activationInvalidCode());
      if (e.isNetwork) return Err(PlayerErrors.network(e.message, cause: e));
      return Err(PlayerErrors.server(e.statusCode, cause: e));
    }
  }

  Future<Result<ActivationResult?>> _complete(String code) async {
    final secret = _pendingSecret;
    if (secret == null || _pendingCode != code) {
      // No local secret for this code — cannot prove possession.
      return Err(PlayerErrors.activationInvalidCode());
    }
    try {
      final res = await _http.postJson(kActivationCompleteRoute, {
        'code': code,
        'activationSecret': secret,
      });

      final token = res.json['token'] as String?;
      final tenantId = res.json['tenantId'] as String?;
      final unitId = res.json['unitId'] as String?;
      if (token == null || tenantId == null || unitId == null) {
        return Err(PlayerErrors.activationInvalidCode());
      }

      await _tokenStore.writeToken(
        token,
        expiresAt: _parseDate(res.json['tokenExpiresAt']),
      );
      // Secret has served its purpose; drop it so it never lingers in memory.
      _pendingSecret = null;

      final result = ActivationResult(
        tenantId: tenantId,
        unitId: unitId,
        friendlyName: res.json['friendlyName'] as String?,
      );
      _confirmed = result;
      return Ok(result);
    } on PlayerHttpException catch (e) {
      if (e.isConflict) return Err(PlayerErrors.activationInvalidCode());
      if (e.isNetwork) return Err(PlayerErrors.network(e.message, cause: e));
      return Err(PlayerErrors.server(e.statusCode, cause: e));
    }
  }

  /// 32 random bytes as base64url (43 chars, no padding) — within the contract's
  /// 16–256 char bound and high-entropy.
  String _generateSecret() {
    final bytes = List<int>.generate(32, (_) => _random.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  static DateTime? _parseDate(Object? v) =>
      v is String ? DateTime.tryParse(v) : null;
}
