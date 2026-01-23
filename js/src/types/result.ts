/**
 * AO-Core Result Types
 */

/** Error information */
export interface ErrorInfo {
  status: number;
  message: string;
  details?: unknown;
}

/** Result type for operations - success or failure */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ErrorInfo };

/** Special return values for device resolution */
export type ResolveResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ErrorInfo }
  | { pass: true };

/** Helper to create success result */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Helper to create error result */
export function err<T>(status: number, message: string, details?: unknown): Result<T> {
  return { ok: false, error: { status, message, details } };
}

/** Helper to create pass-through result */
export function pass(): ResolveResult<never> {
  return { pass: true };
}

/** Check if result is ok */
export function isOk<T>(result: Result<T>): result is { ok: true; value: T } {
  return result.ok;
}

/** Check if result is error */
export function isErr<T>(result: Result<T>): result is { ok: false; error: ErrorInfo } {
  return !result.ok;
}

/** Check if resolve result is pass-through */
export function isPass<T>(result: ResolveResult<T>): result is { pass: true } {
  return 'pass' in result && result.pass === true;
}

/** Unwrap result or throw */
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`[${result.error.status}] ${result.error.message}`);
}

/** Map over result value */
export function mapResult<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
  if (result.ok) {
    return { ok: true, value: fn(result.value) };
  }
  return result;
}

/** Chain results */
export async function andThen<T, U>(
  result: Result<T>,
  fn: (value: T) => Promise<Result<U>>
): Promise<Result<U>> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}
