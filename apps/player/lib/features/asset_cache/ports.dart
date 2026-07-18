/// Ports the asset subsystem depends on. Production wires real filesystem and
/// HTTP; tests wire deterministic fakes. Keeping these narrow keeps the cache
/// logic pure and headless-testable (Sprint 09 · §17–§19).
library;

/// Outcome of fetching bytes for one asset.
final class DownloadOutcome {
  const DownloadOutcome({required this.bytes, this.mimeType});
  final List<int> bytes;
  final String? mimeType;
}

/// Transport that fetches an asset's bytes from a (possibly signed) URI into a
/// temporary location. Implementations must support cancellation via the
/// [onProgress] cooperative check returning false.
abstract interface class AssetTransport {
  Future<DownloadOutcome> fetch(
    String uri, {
    void Function(int received, int? total)? onProgress,
  });
}

/// Minimal filesystem port used for atomic promotion, disk stats and cleanup.
/// Paths are validated by [FileSystemPort.isSafeChildPath] to prevent traversal.
abstract interface class FileSystemPort {
  Future<void> writeTemp(String tempPath, List<int> bytes);
  Future<void> promote(String tempPath, String finalPath);
  Future<void> deleteIfExists(String path);
  Future<bool> exists(String path);
  Future<int> sizeOf(String path);
  Future<DiskStats> diskStats();
}

final class DiskStats {
  const DiskStats({required this.totalBytes, required this.availableBytes});
  final int totalBytes;
  final int availableBytes;
}

/// Checksum computation port (e.g. sha256). Injected so tests avoid hashing.
abstract interface class ChecksumPort {
  String compute(List<int> bytes);
}

/// Guards against path traversal: a computed local path must stay within the
/// cache root and contain no `..` segments.
bool isSafeChildPath(String root, String candidate) {
  final normalizedRoot = root.endsWith('/') ? root : '$root/';
  if (candidate.contains('..')) return false;
  return candidate.startsWith(normalizedRoot);
}
