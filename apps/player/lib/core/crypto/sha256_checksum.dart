import '../../features/asset_cache/ports.dart';
import 'sha256.dart';

/// Production [ChecksumPort]: a real SHA-256 digest (lowercase hex).
///
/// This replaces the non-cryptographic FNV-1a fallback for production wiring, so
/// a downloaded asset is only promoted to `ready` when its bytes hash to the
/// `checksumSha256` the signed plan descriptor declared. The digest format
/// (64-char lowercase hex) matches the backend contract's `sha256HexSchema`, so
/// comparison is a direct case-insensitive string match in [DownloadManager].
final class Sha256Checksum implements ChecksumPort {
  const Sha256Checksum();

  @override
  String compute(List<int> bytes) => sha256Hex(bytes);
}
