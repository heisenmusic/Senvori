import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/features/net/player_http_client.dart';

void main() {
  group('resolveEndpoint', () {
    test('joins origin + v1 prefix + route', () {
      expect(
        resolveEndpoint('https://api.senvori.test', 'player/execution-plan')
            .toString(),
        'https://api.senvori.test/v1/player/execution-plan',
      );
    });

    test('tolerates a trailing slash on the origin', () {
      expect(
        resolveEndpoint('https://api.senvori.test/', 'player/heartbeat')
            .toString(),
        'https://api.senvori.test/v1/player/heartbeat',
      );
    });

    test('tolerates a leading slash on the route', () {
      expect(
        resolveEndpoint('https://api.senvori.test', '/player/telemetry')
            .toString(),
        'https://api.senvori.test/v1/player/telemetry',
      );
    });

    test('passes an absolute (signed asset) URL through unchanged', () {
      const signed =
          'https://cdn.senvori.test/assets/abc?X-Amz-Signature=deadbeef';
      expect(resolveEndpoint('https://api.senvori.test', signed).toString(),
          signed);
    });
  });

  group('PlayerHttpException classification', () {
    test('status 0 is a network error', () {
      const e = PlayerHttpException(0, 'boom');
      expect(e.isNetwork, isTrue);
      expect(e.isUnauthorized, isFalse);
    });

    test('401 and 403 are unauthorized', () {
      expect(const PlayerHttpException(401, 'x').isUnauthorized, isTrue);
      expect(const PlayerHttpException(403, 'x').isUnauthorized, isTrue);
    });

    test('409 is a conflict (activation replay)', () {
      expect(const PlayerHttpException(409, 'x').isConflict, isTrue);
    });

    test('5xx is a server error', () {
      expect(const PlayerHttpException(503, 'x').isServerError, isTrue);
      expect(const PlayerHttpException(404, 'x').isServerError, isFalse);
    });
  });
}
