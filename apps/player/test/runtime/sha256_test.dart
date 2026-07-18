import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/core/crypto/sha256.dart';
import 'package:senvori_player/core/crypto/sha256_checksum.dart';

void main() {
  group('sha256Hex known-answer vectors (FIPS 180-4 / NIST)', () {
    test('empty input', () {
      expect(
        sha256Hex(const <int>[]),
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });

    test('"abc"', () {
      expect(
        sha256HexOfString('abc'),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    test('56-byte multi-block message', () {
      expect(
        sha256HexOfString(
          'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        ),
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
      );
    });

    test('one million "a" characters', () {
      final million = utf8.encode('a' * 1000000);
      expect(
        sha256Hex(million),
        'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
      );
    });

    test('exactly one block (64 bytes) with padding overflow to a 2nd block',
        () {
      // 64 bytes forces the length field into a second padded block.
      final input = List<int>.filled(64, 0x61); // 64 * 'a'
      expect(
        sha256Hex(input),
        'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
      );
    });
  });

  group('Sha256Checksum adapter', () {
    test('produces lowercase 64-char hex matching sha256Hex', () {
      const checksum = Sha256Checksum();
      final bytes = utf8.encode('senvori');
      final out = checksum.compute(bytes);
      expect(out.length, 64);
      expect(out, sha256Hex(bytes));
      expect(out, matches(RegExp(r'^[a-f0-9]{64}$')));
    });
  });
}
