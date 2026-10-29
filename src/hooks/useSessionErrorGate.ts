/**
 * @file useSessionErrorGate.ts
 * @license BSD-2-Clause
 *
 * @description
 * Used by the shared error dialog and notice. When the error is a session error it reports
 * it to the host (event, then handler) and says whether the built-in message must stay
 * hidden because the host's `sessionError` handler owns the display.
 */

import { useEffect, useRef } from 'react';
import { usePluginOptional } from '../context/pluginContext';
import type { SessionErrorOrigin } from '../types/dialog-handlers';
import {
  isSessionError,
  isSessionErrorHandled,
  reportSessionEnded,
  sessionCodeOf,
} from '../utils/sessionError';

export function useSessionErrorGate(
  error: unknown,
  message: string,
  origin: SessionErrorOrigin = 'auth',
  /** The reason, when the caller knows it and it should not be part of the displayed error. */
  codeOverride?: string
): { isSession: boolean; hidden: boolean } {
  const ctx = usePluginOptional();
  const isSession = error != null && isSessionError(error);
  const code = codeOverride ?? sessionCodeOf(error);

  // A displayed error is reported once. Without this, an error that is still on screen when a
  // new session starts would be reported again (its computed code changes when the session resets).
  const reportedFor = useRef<string | null>(null);
  const sourceRef = useRef({ hostId: ctx?.hostId, componentKey: ctx?.componentKey, tenantId: ctx?.tenantId });
  sourceRef.current = { hostId: ctx?.hostId, componentKey: ctx?.componentKey, tenantId: ctx?.tenantId };

  useEffect(() => {
    if (!isSession) return;
    const key = `${origin}|${message}`;
    if (reportedFor.current === key) return;
    reportedFor.current = key;
    reportSessionEnded({ origin, code, message, source: sourceRef.current });
  }, [isSession, code, message, origin]);

  return { isSession, hidden: isSession && isSessionErrorHandled() };
}
