/// Real connectivity probe (Sprint 10B).
///
/// Pings the API's lightweight health endpoint (`GET /v1/health`) to distinguish
/// "API reachable" from "link but the backend is unreachable/degraded" from
/// "offline". This is deliberately cheap; the [ConnectivityMonitor] applies
/// backoff so it is never run in a tight loop.
///
/// It does not attempt to detect a captive portal or classify local-only vs.
/// full-internet reachability — that needs OS network APIs (a plugin). The
/// honest mapping here is health-endpoint-centric, which is what the runtime's
/// sync decisions actually depend on.
library;

import '../connectivity/connectivity.dart';
import 'player_http_client.dart';

/// Route (after the `v1` prefix) for the health check.
const String kHealthRoute = 'health';

final class HttpConnectivityProbe implements ConnectivityProbe {
  HttpConnectivityProbe(this._http);
  final PlayerHttpClient _http;

  @override
  Future<ConnectivityState> probe() async {
    try {
      await _http.getJson(kHealthRoute);
      return ConnectivityState.apiReachable;
    } on PlayerHttpException catch (e) {
      // A response arrived but was not healthy ⇒ degraded; no response ⇒ offline.
      return e.isNetwork
          ? ConnectivityState.offline
          : ConnectivityState.apiDegraded;
    }
  }
}
