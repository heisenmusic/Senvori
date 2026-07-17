/// Player error taxonomy (Sprint 09 · §46).
///
/// Every failure the runtime surfaces carries a stable [code], a [category], a
/// [severity], whether it is [retryable], a developer-facing [message] and a
/// user-facing message *key* (resolved by the l10n layer — the runtime never
/// hardcodes localized strings). This keeps operator-facing copy translatable
/// and stack traces away from the screen.
library;

enum ErrorCategory {
  activation,
  authentication,
  plan,
  asset,
  storage,
  download,
  playback,
  connectivity,
  persistence,
  configuration,
  emergency,
  unknown,
}

enum ErrorSeverity { info, warning, error, fatal }

final class PlayerError {
  const PlayerError({
    required this.code,
    required this.category,
    required this.severity,
    required this.retryable,
    required this.message,
    required this.messageKey,
    this.context = const {},
    this.cause,
  });

  /// Stable machine code, e.g. `plan.invalid_schema`, `asset.checksum_mismatch`.
  final String code;
  final ErrorCategory category;
  final ErrorSeverity severity;

  /// Whether an automatic retry could plausibly succeed. Callers use this to
  /// decide between backoff-and-retry and entering a degraded state.
  final bool retryable;

  /// Developer-facing description. Never shown to operators.
  final String message;

  /// Key into the l10n catalog for the operator-facing message.
  final String messageKey;

  /// Structured, non-sensitive context. Must never contain secrets or tokens.
  final Map<String, Object?> context;

  /// Optional underlying cause for logs.
  final Object? cause;

  PlayerError copyWith({Map<String, Object?>? context, Object? cause}) =>
      PlayerError(
        code: code,
        category: category,
        severity: severity,
        retryable: retryable,
        message: message,
        messageKey: messageKey,
        context: context ?? this.context,
        cause: cause ?? this.cause,
      );

  @override
  String toString() =>
      'PlayerError($code, ${category.name}, ${severity.name}, retryable=$retryable)';
}

/// Canonical constructors for the common failures. Keeping them in one place
/// makes codes discoverable and prevents drift between call sites.
abstract final class PlayerErrors {
  static PlayerError planInvalid(
    String detail, {
    Map<String, Object?> ctx = const {},
  }) => PlayerError(
    code: 'plan.invalid',
    category: ErrorCategory.plan,
    severity: ErrorSeverity.error,
    retryable: false,
    message: 'Plan rejected: $detail',
    messageKey: 'error.plan.invalid',
    context: ctx,
  );

  static PlayerError planExpired({Map<String, Object?> ctx = const {}}) =>
      PlayerError(
        code: 'plan.expired',
        category: ErrorCategory.plan,
        severity: ErrorSeverity.warning,
        retryable: true,
        message: 'Active plan has expired for the local date',
        messageKey: 'error.plan.expired',
        context: ctx,
      );

  static PlayerError assetChecksumMismatch(String assetId) => PlayerError(
    code: 'asset.checksum_mismatch',
    category: ErrorCategory.asset,
    severity: ErrorSeverity.error,
    retryable: true,
    message: 'Checksum mismatch for asset $assetId',
    messageKey: 'error.asset.corrupted',
    context: {'assetId': assetId},
  );

  static PlayerError assetMissing(String assetId) => PlayerError(
    code: 'asset.missing',
    category: ErrorCategory.asset,
    severity: ErrorSeverity.warning,
    retryable: true,
    message: 'Asset $assetId not present in local cache',
    messageKey: 'error.asset.missing',
    context: {'assetId': assetId},
  );

  static PlayerError downloadFailed(
    String assetId, {
    bool retryable = true,
    Object? cause,
  }) => PlayerError(
    code: 'download.failed',
    category: ErrorCategory.download,
    severity: ErrorSeverity.warning,
    retryable: retryable,
    message: 'Download failed for asset $assetId',
    messageKey: 'error.download.failed',
    context: {'assetId': assetId},
    cause: cause,
  );

  static PlayerError storageLow({required int availableBytes}) => PlayerError(
    code: 'storage.low',
    category: ErrorCategory.storage,
    severity: ErrorSeverity.warning,
    retryable: false,
    message: 'Low disk space: $availableBytes bytes available',
    messageKey: 'error.storage.low',
    context: {'availableBytes': availableBytes},
  );

  static PlayerError playbackFailed(String itemId, {Object? cause}) =>
      PlayerError(
        code: 'playback.failed',
        category: ErrorCategory.playback,
        severity: ErrorSeverity.error,
        retryable: true,
        message: 'Playback failed for item $itemId',
        messageKey: 'error.playback.failed',
        context: {'itemId': itemId},
        cause: cause,
      );

  static PlayerError persistenceCorrupted(String store, {Object? cause}) =>
      PlayerError(
        code: 'persistence.corrupted',
        category: ErrorCategory.persistence,
        severity: ErrorSeverity.error,
        retryable: false,
        message: 'Corrupted persisted state in "$store"',
        messageKey: 'error.persistence.corrupted',
        context: {'store': store},
        cause: cause,
      );

  static PlayerError activationInvalidCode() => const PlayerError(
    code: 'activation.invalid_code',
    category: ErrorCategory.activation,
    severity: ErrorSeverity.warning,
    retryable: true,
    message: 'Activation code was rejected',
    messageKey: 'error.activation.invalid',
  );

  static PlayerError activationExpired() => const PlayerError(
    code: 'activation.expired',
    category: ErrorCategory.activation,
    severity: ErrorSeverity.warning,
    retryable: true,
    message: 'Activation code expired before pairing completed',
    messageKey: 'error.activation.expired',
  );

  static PlayerError offline() => const PlayerError(
    code: 'connectivity.offline',
    category: ErrorCategory.connectivity,
    severity: ErrorSeverity.info,
    retryable: true,
    message: 'No reachable API; operating from local state',
    messageKey: 'error.connectivity.offline',
  );
}
