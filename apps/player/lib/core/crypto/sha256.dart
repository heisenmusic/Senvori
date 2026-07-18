/// A dependency-free, pure-Dart SHA-256 (FIPS 180-4).
///
/// The runtime deliberately avoids native plugins so it stays headless-testable,
/// and `package:crypto` is not in the dependency set. This implementation lets
/// the Player verify asset integrity against a real cryptographic digest instead
/// of the non-cryptographic FNV-1a fallback (Sprint 10B · asset integrity).
///
/// It operates on 32-bit lanes via `& 0xFFFFFFFF` masking so it is correct on
/// both native and web (JS) number semantics. It is not constant-time and is not
/// intended for secret-dependent comparisons — it is used for content integrity
/// and proof-of-possession hashing only.
library;

import 'dart:convert';
import 'dart:typed_data';

/// Round constants: first 32 bits of the fractional parts of the cube roots of
/// the first 64 primes.
const List<int> _k = <int>[
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, //
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const int _mask32 = 0xFFFFFFFF;

int _rotr(int x, int n) => ((x >> n) | (x << (32 - n))) & _mask32;

/// Computes the SHA-256 digest of [bytes] and returns it as 32 raw bytes.
Uint8List sha256Bytes(List<int> bytes) {
  // Working hash state: first 32 bits of the fractional parts of the square
  // roots of the first 8 primes.
  var h0 = 0x6a09e667,
      h1 = 0xbb67ae85,
      h2 = 0x3c6ef372,
      h3 = 0xa54ff53a,
      h4 = 0x510e527f,
      h5 = 0x9b05688c,
      h6 = 0x1f83d9ab,
      h7 = 0x5be0cd19;

  final message = _padMessage(bytes);
  final w = List<int>.filled(64, 0);

  for (var chunk = 0; chunk < message.length; chunk += 64) {
    for (var i = 0; i < 16; i++) {
      final j = chunk + i * 4;
      w[i] =
          ((message[j] << 24) |
              (message[j + 1] << 16) |
              (message[j + 2] << 8) |
              message[j + 3]) &
          _mask32;
    }
    for (var i = 16; i < 64; i++) {
      final s0 = _rotr(w[i - 15], 7) ^ _rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
      final s1 = _rotr(w[i - 2], 17) ^ _rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & _mask32;
    }

    var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (var i = 0; i < 64; i++) {
      final s1 = _rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25);
      final ch = (e & f) ^ ((~e & _mask32) & g);
      final temp1 = (h + s1 + ch + _k[i] + w[i]) & _mask32;
      final s0 = _rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22);
      final maj = (a & b) ^ (a & c) ^ (b & c);
      final temp2 = (s0 + maj) & _mask32;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) & _mask32;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) & _mask32;
    }

    h0 = (h0 + a) & _mask32;
    h1 = (h1 + b) & _mask32;
    h2 = (h2 + c) & _mask32;
    h3 = (h3 + d) & _mask32;
    h4 = (h4 + e) & _mask32;
    h5 = (h5 + f) & _mask32;
    h6 = (h6 + g) & _mask32;
    h7 = (h7 + h) & _mask32;
  }

  final out = Uint8List(32);
  final words = <int>[h0, h1, h2, h3, h4, h5, h6, h7];
  for (var i = 0; i < 8; i++) {
    out[i * 4] = (words[i] >> 24) & 0xFF;
    out[i * 4 + 1] = (words[i] >> 16) & 0xFF;
    out[i * 4 + 2] = (words[i] >> 8) & 0xFF;
    out[i * 4 + 3] = words[i] & 0xFF;
  }
  return out;
}

/// Computes the SHA-256 digest of [bytes] as a lowercase hex string (64 chars).
String sha256Hex(List<int> bytes) {
  final digest = sha256Bytes(bytes);
  final sb = StringBuffer();
  for (final b in digest) {
    sb.write(b.toRadixString(16).padLeft(2, '0'));
  }
  return sb.toString();
}

/// Convenience: SHA-256 hex of a UTF-8 string.
String sha256HexOfString(String s) => sha256Hex(utf8.encode(s));

/// Pads the message per FIPS 180-4: append 0x80, then zero bytes until the
/// length is 56 mod 64, then the 64-bit big-endian bit length.
Uint8List _padMessage(List<int> bytes) {
  final originalBits = bytes.length * 8;
  final paddingLength = ((56 - (bytes.length + 1) % 64) % 64) + 1;
  final total = bytes.length + paddingLength + 8;
  final out = Uint8List(total);
  out.setRange(0, bytes.length, bytes);
  out[bytes.length] = 0x80;
  // 64-bit big-endian length in the final 8 bytes. Dart ints are 64-bit on
  // native; on web this is limited to 53-bit safe integers, which is far beyond
  // any realistic asset size, so the high word is written as zero implicitly.
  for (var i = 0; i < 8; i++) {
    out[total - 1 - i] = (originalBits >> (8 * i)) & 0xFF;
  }
  return out;
}
