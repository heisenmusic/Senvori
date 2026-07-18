/// Persistence port (Sprint 09 · §16).
///
/// A small, versioned key/value contract. The runtime persists JSON-encodable
/// documents that always carry a `schemaVersion`, so local migrations are
/// possible and corruption is recoverable rather than fatal. Two production
/// backends are envisaged (secure store for identity, plain store for the
/// rest); tests use the in-memory backend.
library;

import 'dart:convert';

abstract interface class KeyValueStore {
  /// Returns the raw stored string for [key], or `null` if absent.
  Future<String?> readRaw(String key);

  /// Persists [value] under [key] atomically (backend-dependent).
  Future<void> writeRaw(String key, String value);

  Future<void> delete(String key);

  Future<List<String>> keys();
}

/// A stored document envelope: the payload plus the schema version it was
/// written with. Readers compare [schemaVersion] against the current version
/// and migrate or reject accordingly.
final class StoredDocument {
  const StoredDocument({required this.schemaVersion, required this.data});

  final int schemaVersion;
  final Map<String, Object?> data;

  Map<String, Object?> toJson() => {
    'schemaVersion': schemaVersion,
    'data': data,
  };

  static StoredDocument fromJson(Map<String, Object?> json) {
    final v = json['schemaVersion'];
    final d = json['data'];
    if (v is! int || d is! Map) {
      throw const FormatException('missing schemaVersion/data envelope');
    }
    return StoredDocument(schemaVersion: v, data: Map<String, Object?>.from(d));
  }
}

/// Typed helper around [KeyValueStore] that enforces the envelope and turns
/// decode failures into a caller-visible signal rather than a thrown blob.
final class DocumentStore {
  DocumentStore(this._backend);
  final KeyValueStore _backend;

  /// Reads and decodes the envelope. Returns `null` when absent. Throws
  /// [FormatException] on corruption so callers can apply a recovery policy.
  Future<StoredDocument?> read(String key) async {
    final raw = await _backend.readRaw(key);
    if (raw == null) return null;
    final decoded = jsonDecode(raw);
    if (decoded is! Map) {
      throw const FormatException('stored value is not a JSON object');
    }
    return StoredDocument.fromJson(Map<String, Object?>.from(decoded));
  }

  Future<void> write(String key, StoredDocument doc) =>
      _backend.writeRaw(key, jsonEncode(doc.toJson()));

  Future<void> delete(String key) => _backend.delete(key);

  Future<List<String>> keys() => _backend.keys();
}

/// In-memory backend for tests and demo mode. Deterministic and synchronous
/// under the hood.
final class InMemoryKeyValueStore implements KeyValueStore {
  final Map<String, String> _map = {};

  /// Test seam: simulate corruption by injecting arbitrary raw bytes.
  void seedRaw(String key, String value) => _map[key] = value;

  @override
  Future<String?> readRaw(String key) async => _map[key];

  @override
  Future<void> writeRaw(String key, String value) async => _map[key] = value;

  @override
  Future<void> delete(String key) async => _map.remove(key);

  @override
  Future<List<String>> keys() async => _map.keys.toList(growable: false);
}
