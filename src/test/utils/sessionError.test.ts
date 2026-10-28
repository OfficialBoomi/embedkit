import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../logger.service', () => ({
  default: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  DEFAULT_SESSION_MESSAGE,
  getSessionMessage,
  isServerTokenRejection,
  isSessionError,
  isSessionErrorHandled,
  noteSessionCode,
  reportSessionEnded,
  resetSessionEpisode,
  sessionCodeOf,
  setSessionMessage,
} from '../../utils/sessionError';
import { BoomiEvents, type EmbedKitEvent } from '../../events.service';
import { DialogHandlerRegistry } from '../../dialogs.service';
import type { SessionErrorRequest } from '../../types/dialog-handlers';

const source = { hostId: 'host-1', componentKey: 'key-1', tenantId: 'tenant-1' };

describe('session message', () => {
  afterEach(() => setSessionMessage(undefined));

  it('defaults to the neutral text and never asks the user to sign in', () => {
    expect(getSessionMessage()).toBe(DEFAULT_SESSION_MESSAGE);
    expect(DEFAULT_SESSION_MESSAGE).toBe(
      'Your connection to this section has timed out. Reload the page to continue.'
    );
    expect(DEFAULT_SESSION_MESSAGE).not.toMatch(/sign in|log in|login/i);
  });

  it('uses the host text when set, trimmed', () => {
    setSessionMessage('  Please refresh this panel.  ');
    expect(getSessionMessage()).toBe('Please refresh this panel.');
  });

  it.each([undefined, null, '', '   ', 42])('restores the default for %s', (value) => {
    setSessionMessage('custom');
    setSessionMessage(value);
    expect(getSessionMessage()).toBe(DEFAULT_SESSION_MESSAGE);
  });
});

describe('isSessionError', () => {
  afterEach(() => setSessionMessage(undefined));

  it.each(['MISSING_BEARER', 'TOKEN_REJECTED', 'TOKEN_EXPIRED'])('recognises code %s', (code) => {
    expect(isSessionError(Object.assign(new Error('anything'), { code }))).toBe(true);
    expect(sessionCodeOf({ code })).toBe(code);
  });

  it('recognises sessionCode, which is not shown to the user, like code', () => {
    expect(isSessionError({ message: 'Session expired. Please refresh or re-authenticate.', sessionCode: 'TOKEN_EXPIRED' })).toBe(true);
    expect(sessionCodeOf({ sessionCode: 'TOKEN_EXPIRED' })).toBe('TOKEN_EXPIRED');
    expect(isSessionError({ message: 'x', sessionCode: 'SOMETHING_ELSE' })).toBe(false);
  });

  it('recognises a bare message only when it is exactly the session text', () => {
    expect(isSessionError(DEFAULT_SESSION_MESSAGE)).toBe(true);
    expect(isSessionError({ message: DEFAULT_SESSION_MESSAGE })).toBe(true);
    expect(isSessionError('Something else went wrong')).toBe(false);
    expect(isSessionError({ message: 'Invalid or expired token' })).toBe(false);
  });

  it('follows the host text', () => {
    setSessionMessage('Custom session text');
    expect(isSessionError('Custom session text')).toBe(true);
    expect(isSessionError(DEFAULT_SESSION_MESSAGE)).toBe(false);
  });

  it('gives a message-only error the code of the most recent session error, until a new episode starts', () => {
    resetSessionEpisode();
    expect(sessionCodeOf('text only')).toBe('SESSION_ENDED');
    noteSessionCode('TOKEN_REJECTED');
    expect(sessionCodeOf('text only')).toBe('TOKEN_REJECTED');
    expect(sessionCodeOf({ code: 'MISSING_BEARER' })).toBe('MISSING_BEARER');
    resetSessionEpisode();
    expect(sessionCodeOf('text only')).toBe('SESSION_ENDED');
  });

  it('ignores other codes and non-errors', () => {
    expect(isSessionError({ code: 'MAP_DEFAULTS_PENDING', message: 'x' })).toBe(false);
    expect(isSessionError(null)).toBe(false);
    expect(isSessionError(undefined)).toBe(false);
    expect(sessionCodeOf('text only')).toBe('SESSION_ENDED');
  });
});

describe('isServerTokenRejection', () => {
  it('matches the two server texts on a 401 only', () => {
    expect(isServerTokenRejection(401, 'Invalid or expired token')).toBe(true);
    expect(isServerTokenRejection(401, ' Missing bearer token ')).toBe(true);
    expect(isServerTokenRejection(403, 'Invalid or expired token')).toBe(false);
    expect(isServerTokenRejection(401, 'Missing Boomi API credentials in tenant store')).toBe(false);
  });
});

describe('reportSessionEnded', () => {
  const events: EmbedKitEvent[] = [];
  let off: () => void;

  beforeEach(() => {
    events.length = 0;
    off = BoomiEvents.on('auth.session.ended', (e) => events.push(e));
    DialogHandlerRegistry.clear();
    resetSessionEpisode();
  });
  afterEach(() => {
    off();
    DialogHandlerRegistry.clear();
  });

  const report = (origin: 'auth' | 'maps' | 'agent-chat' = 'auth') =>
    reportSessionEnded({ origin, code: 'MISSING_BEARER', message: DEFAULT_SESSION_MESSAGE, source });

  it('emits the event with origin, code and message, as an error', () => {
    report('maps');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'auth.session.ended',
      outcome: 'error',
      source: { componentKey: 'key-1' },
      data: { origin: 'maps', code: 'MISSING_BEARER', message: DEFAULT_SESSION_MESSAGE },
    });
  });

  it('emits once per origin per episode', () => {
    report('auth');
    report('auth');
    report('maps');
    report('maps');
    report('agent-chat');
    expect(events.map((e) => (e.data as { origin: string }).origin)).toEqual(['auth', 'maps', 'agent-chat']);
  });

  it('emits again after a new session starts', () => {
    report('auth');
    resetSessionEpisode();
    report('auth');
    expect(events).toHaveLength(2);
  });

  it('calls the sessionError handler once per episode with the resolved request', async () => {
    const handler = vi.fn(async (req: SessionErrorRequest) => { void req; });
    DialogHandlerRegistry.set({ sessionError: handler });
    expect(isSessionErrorHandled()).toBe(true);

    report('maps');
    report('auth');
    expect(handler).toHaveBeenCalledTimes(1);
    const req = handler.mock.calls[0][0];
    expect(req).toMatchObject({
      intent: 'error',
      description: DEFAULT_SESSION_MESSAGE,
      confirmLabel: 'OK',
      origin: 'maps',
      code: 'MISSING_BEARER',
      source: { hostId: 'host-1', componentKey: 'key-1', tenantId: 'tenant-1' },
    });
    expect(typeof req.id).toBe('string');
    expect(req.signal.aborted).toBe(false);

    resetSessionEpisode();
    report('auth');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('does nothing extra when no handler is registered', () => {
    expect(isSessionErrorHandled()).toBe(false);
    expect(() => report()).not.toThrow();
  });

  it('survives a handler that throws or rejects', () => {
    DialogHandlerRegistry.set({
      sessionError: () => {
        throw new Error('host bug');
      },
    });
    expect(() => report()).not.toThrow();
    resetSessionEpisode();
    DialogHandlerRegistry.set({ sessionError: () => Promise.reject(new Error('host bug')) });
    expect(() => report()).not.toThrow();
  });

  it('survives a subscriber that throws', () => {
    const bad = BoomiEvents.on('auth.session.ended', () => {
      throw new Error('subscriber bug');
    });
    expect(() => report()).not.toThrow();
    bad();
  });
});
