/// Real asset download transport (Sprint 10B).
///
/// Fetches an asset's bytes from a signed, expiring URL into memory, streaming
/// progress as bytes arrive. The [DownloadManager] owns validation (SHA-256),
/// atomic promotion and retry/backoff — this adapter's sole job is "URL → bytes
/// or throw". It uses `dart:io` directly (no third-party HTTP package) so the
/// runtime stays dependency-free.
///
/// Streaming into a `BytesBuilder` matches the existing [AssetTransport]
/// contract (which returns the full byte list). Truly large assets would want a
/// file-streaming variant; that is noted as a follow-up rather than pretended.
library;

import 'dart:io';
import 'dart:typed_data';

import '../asset_cache/ports.dart';

final class HttpAssetTransport implements AssetTransport {
  HttpAssetTransport({
    HttpClient? httpClient,
    this.timeout = const Duration(minutes: 5),
  }) : _client = httpClient ?? HttpClient();

  final HttpClient _client;
  final Duration timeout;

  @override
  Future<DownloadOutcome> fetch(
    String uri, {
    void Function(int received, int? total)? onProgress,
  }) async {
    final parsed = Uri.parse(uri);
    final request = await _client.getUrl(parsed).timeout(timeout);
    final response = await request.close().timeout(timeout);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      // Drain so the socket can be reused, then fail with the status.
      await response.drain<void>();
      throw HttpException(
        'asset fetch failed: HTTP ${response.statusCode}',
        uri: parsed,
      );
    }

    final total = response.contentLength >= 0 ? response.contentLength : null;
    final builder = BytesBuilder(copy: false);
    var received = 0;

    await for (final chunk in response.timeout(timeout)) {
      builder.add(chunk);
      received += chunk.length;
      onProgress?.call(received, total);
    }

    final mime = response.headers.contentType?.mimeType;
    return DownloadOutcome(bytes: builder.takeBytes(), mimeType: mime);
  }

  void close() => _client.close(force: true);
}
