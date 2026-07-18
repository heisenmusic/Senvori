import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/core/persistence/key_value_store.dart';
import 'package:senvori_player/core/persistence/token_store.dart';

void main() {
  group('DocumentTokenStore', () {
    late DocumentStore store;
    late DocumentTokenStore tokens;

    setUp(() {
      store = DocumentStore(InMemoryKeyValueStore());
      tokens = DocumentTokenStore(store);
    });

    test('round-trips a token and expiry', () async {
      final expiry = DateTime.utc(2026, 8, 1, 12);
      await tokens.writeToken('secret-token', expiresAt: expiry);
      expect(await tokens.readToken(), 'secret-token');
      expect(await tokens.readExpiry(), expiry);
    });

    test('returns null before any token is written', () async {
      expect(await tokens.readToken(), isNull);
      expect(await tokens.readExpiry(), isNull);
    });

    test('clear removes the credential', () async {
      await tokens.writeToken('t');
      await tokens.clear();
      expect(await tokens.readToken(), isNull);
    });

    test('tolerates corrupted storage without throwing', () async {
      final backend = InMemoryKeyValueStore()
        ..seedRaw('device_credential', 'not-json{');
      final corrupted = DocumentTokenStore(DocumentStore(backend));
      expect(await corrupted.readToken(), isNull);
    });
  });

  group('InMemoryTokenStore', () {
    test('round-trips and clears', () async {
      final t = InMemoryTokenStore();
      await t.writeToken('x', expiresAt: DateTime.utc(2026));
      expect(await t.readToken(), 'x');
      expect(await t.readExpiry(), DateTime.utc(2026));
      await t.clear();
      expect(await t.readToken(), isNull);
    });
  });
}
