import 'dart:io';

import 'ports.dart';

/// Real filesystem adapter (Sprint 09 · §18–§19). Promotion is atomic via a
/// temp file + rename. Path safety is enforced by callers via [isSafeChildPath];
/// this adapter also refuses to promote to a path containing `..`.
final class IoFileSystem implements FileSystemPort {
  const IoFileSystem();

  @override
  Future<void> writeTemp(String tempPath, List<int> bytes) async {
    final f = File(tempPath);
    await f.parent.create(recursive: true);
    await f.writeAsBytes(bytes, flush: true);
  }

  @override
  Future<void> promote(String tempPath, String finalPath) async {
    if (finalPath.contains('..')) {
      throw ArgumentError.value(
        finalPath,
        'finalPath',
        'path traversal rejected',
      );
    }
    final target = File(finalPath);
    await target.parent.create(recursive: true);
    await File(tempPath).rename(finalPath);
  }

  @override
  Future<void> deleteIfExists(String path) async {
    final f = File(path);
    if (await f.exists()) await f.delete();
  }

  @override
  Future<bool> exists(String path) => File(path).exists();

  @override
  Future<int> sizeOf(String path) async {
    final f = File(path);
    return await f.exists() ? f.length() : 0;
  }

  @override
  Future<DiskStats> diskStats() async {
    // Flutter/Dart has no portable disk-free API without a plugin. This adapter
    // returns a conservative placeholder; a platform channel is a future task.
    // Honesty: disk-space enforcement is exercised via the pure DiskManager in
    // tests, not via a real free-space query here.
    return const DiskStats(totalBytes: 0, availableBytes: 0);
  }
}

/// A non-cryptographic, deterministic checksum (FNV-1a) used as the default
/// [ChecksumPort]. It detects corruption/truncation reliably and is dependency
/// free. NOTE: it is NOT a security primitive — production integrity against a
/// malicious source should use SHA-256 via `package:crypto`. Documented here so
/// the limitation is explicit rather than hidden.
final class Fnv1aChecksum implements ChecksumPort {
  const Fnv1aChecksum();

  @override
  String compute(List<int> bytes) {
    var hash = 0xcbf29ce484222325;
    const prime = 0x100000001b3;
    const mask = 0xFFFFFFFFFFFFFFFF;
    for (final b in bytes) {
      hash = (hash ^ (b & 0xFF)) & mask;
      hash = (hash * prime) & mask;
    }
    return hash.toRadixString(16).padLeft(16, '0');
  }
}
