import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Guards catalog parity (Sprint 09 · §43): pt-BR, en-US and es-ES must define
/// exactly the same keys, so no string is missing or orphaned in any locale.
void main() {
  Map<String, dynamic> load(String name) =>
      jsonDecode(File('lib/l10n/$name').readAsStringSync())
          as Map<String, dynamic>;

  Set<String> keysOf(Map<String, dynamic> arb) =>
      arb.keys.where((k) => !k.startsWith('@')).toSet();

  test('en, pt and es catalogs have identical key sets', () {
    final en = keysOf(load('app_en.arb'));
    final pt = keysOf(load('app_pt.arb'));
    final es = keysOf(load('app_es.arb'));

    expect(pt.difference(en), isEmpty, reason: 'pt has keys missing from en');
    expect(en.difference(pt), isEmpty, reason: 'en has keys missing from pt');
    expect(es.difference(en), isEmpty, reason: 'es has keys missing from en');
    expect(en.difference(es), isEmpty, reason: 'en has keys missing from es');
  });

  test('no locale has empty string values', () {
    for (final file in ['app_en.arb', 'app_pt.arb', 'app_es.arb']) {
      final arb = load(file);
      for (final entry in arb.entries) {
        if (entry.key.startsWith('@')) continue;
        expect(
          (entry.value as String).trim(),
          isNotEmpty,
          reason: '$file:${entry.key} is empty',
        );
      }
    }
  });
}
