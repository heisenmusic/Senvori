/// A minimal, allocation-cheap `Result` type used across the runtime so that
/// expected failures (invalid plan, checksum mismatch, download error) are
/// values, not thrown exceptions. Exceptions are reserved for programmer errors.
library;

import '../errors/player_error.dart';

sealed class Result<T> {
  const Result();

  bool get isOk => this is Ok<T>;
  bool get isErr => this is Err<T>;

  /// The value, or throws [StateError] if this is an [Err]. Prefer pattern
  /// matching; this is a convenience for tests and known-ok paths.
  T get value => switch (this) {
    Ok<T>(:final value) => value,
    Err<T>(:final error) => throw StateError('Result is Err: ${error.code}'),
  };

  /// The error, or `null` when ok.
  PlayerError? get errorOrNull => switch (this) {
    Ok<T>() => null,
    Err<T>(:final error) => error,
  };

  Result<R> map<R>(R Function(T) f) => switch (this) {
    Ok<T>(:final value) => Ok(f(value)),
    Err<T>(:final error) => Err(error),
  };

  R fold<R>(R Function(T) onOk, R Function(PlayerError) onErr) =>
      switch (this) {
        Ok<T>(:final value) => onOk(value),
        Err<T>(:final error) => onErr(error),
      };
}

final class Ok<T> extends Result<T> {
  const Ok(this.value);
  @override
  final T value;
}

final class Err<T> extends Result<T> {
  const Err(this.error);
  final PlayerError error;
}
