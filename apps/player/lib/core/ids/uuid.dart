/// Dependency-free RFC 4122 UUID helpers.
///
/// The runtime avoids third-party packages, so this provides the small amount of
/// UUID generation the production adapters need (telemetry batch ids, device id
/// minting) without pulling in `package:uuid`.
library;

import 'dart:math';

final Random _secureRandom = Random.secure();

/// Generates a random (version 4) UUID string using a cryptographically secure
/// source. Format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` (lowercase hex).
String randomUuidV4([Random? random]) {
  final rng = random ?? _secureRandom;
  final bytes = List<int>.generate(16, (_) => rng.nextInt(256));
  // Set version (4) and variant (10xx) bits per RFC 4122 §4.4.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  String hex(int start, int end) {
    final sb = StringBuffer();
    for (var i = start; i < end; i++) {
      sb.write(bytes[i].toRadixString(16).padLeft(2, '0'));
    }
    return sb.toString();
  }

  return '${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}';
}

/// Whether [s] is a syntactically valid lowercase/any-case UUID.
bool isUuid(String s) => RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    ).hasMatch(s);
