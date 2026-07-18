/// Authenticated HTTP client for the Player↔backend surface (Sprint 10B).
///
/// A thin wrapper over `dart:io`'s [HttpClient] — no third-party HTTP package is
/// added, keeping the runtime dependency-free and the transport swappable. It
/// owns exactly the cross-cutting concerns every device call shares: origin +
/// versioned prefix, JSON encode/decode, bearer authentication (the raw device
/// token supplied lazily by a [TokenProvider], never logged), timeouts, and a
/// uniform failure surface via [PlayerHttpException].
///
/// URL building and error classification are pure functions ([resolveEndpoint],
/// [PlayerHttpException.isUnauthorized]) so they are unit-testable without a
/// socket; only [send] touches real IO.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'player_backend_config.dart';

/// Supplies the current raw device bearer token, or `null`/empty when the device
/// is not yet activated. Read lazily per request so a rotated token is picked up
/// without rebuilding the client.
typedef TokenProvider = Future<String?> Function();

/// A uniform transport failure. `statusCode == 0` denotes a network/timeout
/// error (no HTTP response was received).
final class PlayerHttpException implements Exception {
  const PlayerHttpException(this.statusCode, this.message, {this.body});

  final int statusCode;
  final String message;

  /// Response body when one was received (may be an error envelope). Never
  /// contains the request's Authorization header.
  final String? body;

  bool get isNetwork => statusCode == 0;
  bool get isUnauthorized => statusCode == 401 || statusCode == 403;
  bool get isServerError => statusCode >= 500;
  bool get isConflict => statusCode == 409;

  @override
  String toString() => 'PlayerHttpException($statusCode, $message)';
}

/// A decoded successful response.
final class JsonResponse {
  const JsonResponse(this.statusCode, this.json);
  final int statusCode;
  final Map<String, Object?> json;
}

/// Joins an API origin and a versioned route into an absolute URI.
///
/// [route] is the path *after* the `v1` prefix, e.g. `player/execution-plan`.
/// Absolute routes (already `http(s)://…`) are returned as-is so a signed asset
/// URL can be fetched directly.
Uri resolveEndpoint(String baseUrl, String route) {
  if (route.startsWith('http://') || route.startsWith('https://')) {
    return Uri.parse(route);
  }
  final origin = baseUrl.endsWith('/')
      ? baseUrl.substring(0, baseUrl.length - 1)
      : baseUrl;
  final path = route.startsWith('/') ? route.substring(1) : route;
  return Uri.parse('$origin/$kApiPrefix/$path');
}

final class PlayerHttpClient {
  PlayerHttpClient({
    required this.config,
    HttpClient? httpClient,
    TokenProvider? tokenProvider,
  }) : _tokenProvider = tokenProvider,
       _client = httpClient ?? (HttpClient()..connectionTimeout = config.connectTimeout);

  final PlayerBackendConfig config;
  final HttpClient _client;
  final TokenProvider? _tokenProvider;

  Future<JsonResponse> getJson(String route, {bool authenticated = false}) =>
      send('GET', route, authenticated: authenticated);

  Future<JsonResponse> postJson(
    String route,
    Map<String, Object?>? body, {
    bool authenticated = false,
  }) => send('POST', route, body: body, authenticated: authenticated);

  /// Performs one request. Throws [PlayerHttpException] on any non-2xx status or
  /// transport failure. A 2xx with an empty body decodes to an empty map (e.g.
  /// 204 on deactivate).
  Future<JsonResponse> send(
    String method,
    String route, {
    Map<String, Object?>? body,
    bool authenticated = false,
  }) async {
    final uri = resolveEndpoint(config.baseUrl, route);
    try {
      final request = await _client
          .openUrl(method, uri)
          .timeout(config.connectTimeout);
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.set('x-player-contract-version', kPlayerContractVersion);

      if (authenticated) {
        final token = await _tokenProvider?.call();
        if (token == null || token.isEmpty) {
          throw const PlayerHttpException(401, 'no device credential available');
        }
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      }

      if (body != null) {
        request.headers.contentType = ContentType.json;
        request.add(utf8.encode(jsonEncode(body)));
      }

      final response = await request.close().timeout(config.requestTimeout);
      final text = await response
          .transform(utf8.decoder)
          .join()
          .timeout(config.requestTimeout);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return JsonResponse(response.statusCode, _decode(text));
      }
      throw PlayerHttpException(
        response.statusCode,
        'HTTP ${response.statusCode} for $method ${uri.path}',
        body: text,
      );
    } on PlayerHttpException {
      rethrow;
    } on TimeoutException {
      throw const PlayerHttpException(0, 'request timed out');
    } on SocketException catch (e) {
      throw PlayerHttpException(0, 'network error: ${e.message}');
    } on HttpException catch (e) {
      throw PlayerHttpException(0, 'transport error: ${e.message}');
    } on FormatException catch (e) {
      throw PlayerHttpException(0, 'malformed response: ${e.message}');
    }
  }

  static Map<String, Object?> _decode(String text) {
    if (text.trim().isEmpty) return const {};
    final decoded = jsonDecode(text);
    if (decoded is Map) return decoded.cast<String, Object?>();
    throw const FormatException('expected a JSON object');
  }

  void close() => _client.close(force: true);
}
