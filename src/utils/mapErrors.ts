/**
 * Turns a failed map request (load, credential check, save) into a message for the user.
 *
 * Failures that reach the browser as "no response at all" (status 0) are ambiguous: the
 * network may be down, or the server hit its time limit while waiting on an offline runtime.
 * A failure that took a long time is treated as a timeout.
 */
import {
  DEFAULT_SESSION_MESSAGE,
  getSessionMessage,
  isSessionCode,
  MISSING_BEARER_CODE,
  TOKEN_REJECTED_CODE,
} from './sessionError';

export type MapErrorKind =
  | 'timeout'
  | 'unreachable'
  | 'unavailable'
  | 'server'
  | 'session'
  | 'request'
  | 'unknown';

export type ClassifiedMapError = {
  kind: MapErrorKind;
  message: string;
  /** Set for `session` errors: the machine-readable reason (see `utils/sessionError`). */
  code?: string;
};


/** A request with no response that took at least this long is shown as a timeout, not a network problem. */
export const SLOW_NO_RESPONSE_MS = 25_000;

export const MAP_ERROR_MESSAGES = {
  timeout: 'The request timed out. The runtime may be offline or busy. Try again.',
  unreachable: 'Could not reach the server. Check your connection and try again.',
  unavailable: 'The service or runtime is unavailable right now. Try again in a few minutes.',
  server: 'Something went wrong on the server. Try again.',
  /** The default. The text actually shown comes from `getSessionMessage()`, which a host can override. */
  session: DEFAULT_SESSION_MESSAGE,
  generic: 'Something went wrong. Try again.',
} as const;

const statusOf = (err: unknown): number | undefined => {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
};

const messageOf = (err: unknown): string => {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message.trim() : '';
};

/**
 * @param err The error thrown by the request.
 * @param elapsedMs How long the request ran before it failed (0 if unknown).
 */
export function classifyMapError(err: unknown, elapsedMs = 0): ClassifiedMapError {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return { kind: 'timeout', message: MAP_ERROR_MESSAGES.timeout };
  }

  const status = statusOf(err);

  if (status === 0) {
    return elapsedMs >= SLOW_NO_RESPONSE_MS
      ? { kind: 'timeout', message: MAP_ERROR_MESSAGES.timeout }
      : { kind: 'unreachable', message: MAP_ERROR_MESSAGES.unreachable };
  }

  if (status === 502 || status === 503 || status === 504) {
    return { kind: 'unavailable', message: MAP_ERROR_MESSAGES.unavailable };
  }
  if (status === 401 || status === 403) {
    const own = (err as { code?: unknown } | null | undefined)?.code;
    return { kind: 'session', message: getSessionMessage(), code: isSessionCode(own) ? own : TOKEN_REJECTED_CODE };
  }
  if (status !== undefined && status >= 500) {
    return { kind: 'server', message: MAP_ERROR_MESSAGES.server };
  }
  if (status !== undefined) {
    return { kind: 'request', message: messageOf(err) || MAP_ERROR_MESSAGES.generic };
  }

  // No status: not an HTTP failure from our client. Keep any message it already has.
  const message = messageOf(err);
  const code = (err as { code?: unknown } | null | undefined)?.code;
  if (code === MISSING_BEARER_CODE || message === MISSING_BEARER_CODE) {
    return { kind: 'session', message: getSessionMessage(), code: MISSING_BEARER_CODE };
  }
  return { kind: 'unknown', message: message || MAP_ERROR_MESSAGES.generic };
}

type FailedCandidateLike = {
  connectionName?: string | null;
  /** Set by newer servers when they know why a check failed. */
  failureReason?: 'timeout' | 'unavailable' | 'rejected' | null;
};

/**
 * Banner text for a credential check that came back with failed fields.
 * A server-reported timeout or outage wins; otherwise we can only say the value was not verified.
 */
export function describeFailedCandidates(failed: FailedCandidateLike[]): ClassifiedMapError {
  if (failed.some((c) => c?.failureReason === 'timeout')) {
    return { kind: 'timeout', message: MAP_ERROR_MESSAGES.timeout };
  }
  if (failed.some((c) => c?.failureReason === 'unavailable')) {
    return { kind: 'unavailable', message: MAP_ERROR_MESSAGES.unavailable };
  }

  const names = Array.from(
    new Set(failed.map((c) => c?.connectionName?.trim()).filter((n): n is string => !!n))
  );
  const subject = names.length ? `the value for ${names.join(', ')}` : 'the value';
  return {
    kind: 'request',
    message: `We could not verify ${subject}. Check it and try again. If it is correct, the runtime may be offline.`,
  };
}
