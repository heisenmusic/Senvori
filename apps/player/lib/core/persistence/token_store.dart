/// Device credential (token) storage (Sprint 10B).
///
/// The raw device bearer token is the one true secret on the device: it is
/// returned exactly once by activation `complete`/`refresh` and must never be
/// logged. This port isolates *where* it is kept so the transport reads it
/// lazily without knowing the backing store.
///
/// Honesty: the provided [DocumentTokenStore] persists the token in the app's
/// document store (a JSON file via [FileKeyValueStore] in production, in-memory
/// in tests). That is durable and app-private, but it is **not** OS-backed
/// hardware-encrypted storage (Android Keystore / iOS Keychain) — that requires
/// a platform plugin (`flutter_secure_storage`) which is intentionally not in
/// this dependency-free runtime. `DeviceCapabilities.secureStorage` reflects
/// this: it is `false` until a Keystore-backed adapter is wired. See
/// `docs/PLAYER_SECURITY.md`.
library;

import 'key_value_store.dart';

/// Reads/writes the raw device bearer token and its expiry.
abstract interface class TokenStore {
  Future<String?> readToken();
  Future<DateTime?> readExpiry();
  Future<void> writeToken(String token, {DateTime? expiresAt});
  Future<void> clear();
}

/// A [TokenStore] backed by the shared [DocumentStore]. In production the store
/// is file-backed under app-private storage; in tests it is in-memory.
final class DocumentTokenStore implements TokenStore {
  DocumentTokenStore(
    DocumentStore store, {
    this.storageKey = 'device_credential',
    this.schemaVersion = 1,
  }) : _store = store;

  final DocumentStore _store;
  final String storageKey;
  final int schemaVersion;

  @override
  Future<String?> readToken() async {
    final doc = await _readDoc();
    return doc?.data['token'] as String?;
  }

  @override
  Future<DateTime?> readExpiry() async {
    final doc = await _readDoc();
    final raw = doc?.data['expiresAt'];
    return raw is String ? DateTime.tryParse(raw) : null;
  }

  @override
  Future<void> writeToken(String token, {DateTime? expiresAt}) => _store.write(
    storageKey,
    StoredDocument(
      schemaVersion: schemaVersion,
      data: {'token': token, 'expiresAt': expiresAt?.toIso8601String()},
    ),
  );

  @override
  Future<void> clear() => _store.delete(storageKey);

  Future<StoredDocument?> _readDoc() async {
    try {
      return await _store.read(storageKey);
    } on FormatException {
      return null;
    }
  }
}

/// A trivial in-memory [TokenStore] for tests/demo.
final class InMemoryTokenStore implements TokenStore {
  String? _token;
  DateTime? _expiresAt;

  @override
  Future<String?> readToken() async => _token;

  @override
  Future<DateTime?> readExpiry() async => _expiresAt;

  @override
  Future<void> writeToken(String token, {DateTime? expiresAt}) async {
    _token = token;
    _expiresAt = expiresAt;
  }

  @override
  Future<void> clear() async {
    _token = null;
    _expiresAt = null;
  }
}
