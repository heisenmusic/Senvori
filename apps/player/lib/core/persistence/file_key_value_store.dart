import 'dart:io';

import 'key_value_store.dart';

/// A durable [KeyValueStore] backed by one JSON file per key under a directory.
/// Writes are atomic: content goes to a temp file which is then renamed over
/// the target, so a crash mid-write never corrupts the previous value
/// (Sprint 09 · §16). Keys are sanitized to safe filenames.
final class FileKeyValueStore implements KeyValueStore {
  FileKeyValueStore(this.directory);

  final Directory directory;

  File _fileFor(String key) {
    final safe = key.replaceAll(RegExp(r'[^A-Za-z0-9_.-]'), '_');
    return File('${directory.path}/$safe.json');
  }

  @override
  Future<String?> readRaw(String key) async {
    final f = _fileFor(key);
    if (!await f.exists()) return null;
    return f.readAsString();
  }

  @override
  Future<void> writeRaw(String key, String value) async {
    if (!await directory.exists()) await directory.create(recursive: true);
    final target = _fileFor(key);
    final tmp = File('${target.path}.tmp');
    await tmp.writeAsString(value, flush: true);
    await tmp.rename(target.path);
  }

  @override
  Future<void> delete(String key) async {
    final f = _fileFor(key);
    if (await f.exists()) await f.delete();
  }

  @override
  Future<List<String>> keys() async {
    if (!await directory.exists()) return const [];
    return directory
        .listSync()
        .whereType<File>()
        .where((f) => f.path.endsWith('.json'))
        .map((f) => f.uri.pathSegments.last.replaceAll('.json', ''))
        .toList();
  }
}
