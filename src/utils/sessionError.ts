/**
 * @file sessionError.ts
 * @license BSD-2-Clause
 *
 * @description
 * One place for the "session ended or timed out" message. It owns the default text, the
 * optional host override (`boomiConfig.messages.sessionEnded`), how a session error is
 * recognised, and what happens when a part of the UI shows one:
 *
 * 1. The `auth.session.ended` event is emitted, once per part of the UI per episode.
 * 2. The host's `dialogHandlers.sessionError` handler is called, once per episode.
 *
 * An episode ends when a new session starts (`resetSessionEpisode`). When a `sessionError`
 * handler is registered the built-in message is hidden (`isSessionErrorHandled`).
 */

import { emitEmbedKitEvent } from '../events.service';
import type { AuthSessionEndedEventData } from '../events.service';
import { hasHandler, requestSessionError } from '../dialogs.service';
import type { DialogSource, SessionErrorOrigin } from '../types/dialog-handlers';

export const DEFAULT_SESSION_MESSAGE =
  'Your connection to this section has timed out. Reload the page to continue.';

/** There is no session at all (never started, ended, or logged out). Kept for hosts that match on it. */
export const MISSING_BEARER_CODE = 'MISSING_BEARER';
/** The server answered 401 because the token is invalid or has expired. */
export const TOKEN_REJECTED_CODE = 'TOKEN_REJECTED';
/** The agent chat found the token expired before it connected. */
export const TOKEN_EXPIRED_CODE = 'TOKEN_EXPIRED';
/**
 * The agent chat keeps its own text: it comes from the chat's client-side check of the token's expiry,
 * and the chat shows it for a failed send too.
 */
export const CHAT_SESSION_EXPIRED_MESSAGE = 'Session expired. Please refresh or re-authenticate.';

/** Used when a message is recognised by its text and no code came with it. */
const UNKNOWN_SESSION_CODE = 'SESSION_ENDED';

const SESSION_CODES = new Set([MISSING_BEARER_CODE, TOKEN_REJECTED_CODE, TOKEN_EXPIRED_CODE]);

/** Server texts for a rejected token (`requireAuth`). Matched only on a 401. */
const SERVER_TOKEN_REJECTIONS = new Set(['Invalid or expired token', 'Missing bearer token']);

let configuredMessage: string | null = null;

/** Sets the host's text for the session-ended message. Empty or non-string values restore the default. */
export function setSessionMessage(text: unknown): void {
  configuredMessage = typeof text === 'string' && text.trim() ? text.trim() : null;
}

/** The text to show: the host's override, or the default. */
export function getSessionMessage(): string {
  return configuredMessage ?? DEFAULT_SESSION_MESSAGE;
}

export function isSessionCode(code: unknown): code is string {
  return typeof code === 'string' && SESSION_CODES.has(code);
}

/** True when a 401 response carries one of the server's token-rejection texts. */
export function isServerTokenRejection(status: number, text: string): boolean {
  return status === 401 && SERVER_TOKEN_REJECTIONS.has(text.trim());
}

/**
 * True for a session error. The error `code` (or `sessionCode`, for errors whose `code` would be shown
 * to the user, such as the agent chat's) decides when there is one. A bare message
 * counts only when it is exactly the text EmbedKit shows for a session error, which is how
 * string-only display sites (pages that keep just `error.message`) are recognised.
 */
export function isSessionError(err: unknown): boolean {
  if (typeof err === 'string') return err === getSessionMessage();
  const e = err as { code?: unknown; sessionCode?: unknown; message?: unknown } | null | undefined;
  if (isSessionCode(e?.code) || isSessionCode(e?.sessionCode)) return true;
  return typeof e?.message === 'string' && e.message === getSessionMessage();
}

/** The code of the most recent session error, for display sites that only kept the message text. */
let lastSessionCode: string | null = null;

/** Records the reason of a session error where it is created (the auth manager, the HTTP client). */
export function noteSessionCode(code: string): void {
  lastSessionCode = code;
}

/**
 * The code to report for an error. An error that carries a code uses it. A page that kept only
 * the message text gets the code of the most recent session error, or a generic one.
 */
export function sessionCodeOf(err: unknown): string {
  const e = err as { code?: unknown; sessionCode?: unknown } | null | undefined;
  if (isSessionCode(e?.code)) return e.code;
  if (isSessionCode(e?.sessionCode)) return e.sessionCode;
  return lastSessionCode ?? UNKNOWN_SESSION_CODE;
}

const reportedOrigins = new Set<SessionErrorOrigin>();
let handlerCalled = false;

/** Starts a new episode. Called when a session token is issued. */
export function resetSessionEpisode(): void {
  reportedOrigins.clear();
  handlerCalled = false;
  lastSessionCode = null;
}

export type SessionEndedReport = {
  origin: SessionErrorOrigin;
  code: string;
  message: string;
  source?: Partial<DialogSource>;
};

/** True when the host's `sessionError` handler owns the display, so the built-in message must stay hidden. */
export function isSessionErrorHandled(): boolean {
  return hasHandler('sessionError');
}

/**
 * Tells the host that a part of the UI is showing a session error: emits the event and
 * calls the handler. Safe to call repeatedly and from render effects.
 */
export function reportSessionEnded(report: SessionEndedReport): void {
  const { origin, code, message, source } = report;

  if (!reportedOrigins.has(origin)) {
    reportedOrigins.add(origin);
    emitEmbedKitEvent<AuthSessionEndedEventData>(
      'auth.session.ended',
      { componentKey: source?.componentKey || undefined },
      { origin, code, message },
      'error'
    );
  }

  if (!handlerCalled && hasHandler('sessionError')) {
    handlerCalled = true;
    void requestSessionError({
      intent: 'error',
      title: 'Connection timed out',
      description: message,
      confirmLabel: 'OK',
      dismissible: { outsideClick: true, escapeKey: true },
      origin,
      code,
      source: {
        hostId: source?.hostId ?? '',
        componentKey: source?.componentKey ?? '',
        tenantId: source?.tenantId,
        componentName: source?.componentName,
      },
    });
  }
}
