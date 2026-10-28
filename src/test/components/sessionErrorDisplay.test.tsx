import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const ctx = vi.hoisted(() => ({
  value: { hostId: 'host-1', componentKey: 'key-1', tenantId: 'tenant-1' } as Record<string, unknown>,
}));

vi.mock('../../context/pluginContext', () => ({
  usePluginOptional: () => ctx.value,
  usePlugin: () => ctx.value,
}));
vi.mock('../../logger.service', () => ({
  default: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import Dialog from '../../components/ui/Dialog';
import Notification from '../../components/ui/Notification';
import { BoomiEvents, type EmbedKitEvent } from '../../events.service';
import { DialogHandlerRegistry } from '../../dialogs.service';
import {
  DEFAULT_SESSION_MESSAGE,
  noteSessionCode,
  resetSessionEpisode,
  setSessionMessage,
} from '../../utils/sessionError';

const sessionError = (extra: Record<string, unknown> = {}) => ({
  header: 'Error',
  message: DEFAULT_SESSION_MESSAGE,
  errorType: 'error' as const,
  ...extra,
});

describe('session error display', () => {
  const events: EmbedKitEvent[] = [];
  let off: () => void;

  beforeEach(() => {
    events.length = 0;
    off = BoomiEvents.on('auth.session.ended', (e) => events.push(e));
    DialogHandlerRegistry.clear();
    setSessionMessage(undefined);
    resetSessionEpisode();
  });
  afterEach(() => {
    off();
    DialogHandlerRegistry.clear();
    setSessionMessage(undefined);
  });

  it('shows the default text in the built-in dialog and emits the event with origin auth', () => {
    render(<Dialog error={sessionError()} />);
    expect(screen.getByText(DEFAULT_SESSION_MESSAGE)).toBeTruthy();
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({ origin: 'auth', message: DEFAULT_SESSION_MESSAGE });
  });

  it('shows the host text from boomiConfig.messages.sessionEnded', () => {
    setSessionMessage('This panel needs a refresh.');
    render(<Dialog error={sessionError({ message: 'This panel needs a refresh.' })} />);
    expect(screen.getByText('This panel needs a refresh.')).toBeTruthy();
    expect(events[0].data).toMatchObject({ message: 'This panel needs a refresh.' });
  });

  it('reports the origin the caller gives and prefers the error code', () => {
    render(<Dialog error={sessionError({ code: 'TOKEN_REJECTED' })} origin="maps" />);
    expect(events[0].data).toMatchObject({ origin: 'maps', code: 'TOKEN_REJECTED' });
  });

  it('does not report again when the session resets while the error is still on screen', () => {
    const handler = vi.fn();
    DialogHandlerRegistry.set({ alert: vi.fn() });
    noteSessionCode('MISSING_BEARER');
    const { rerender } = render(<Notification type="Error" message={DEFAULT_SESSION_MESSAGE} />);
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({ code: 'MISSING_BEARER' });

    // A new session starts: the episode resets and the remembered code is cleared.
    resetSessionEpisode();
    DialogHandlerRegistry.set({ sessionError: handler });
    rerender(<Notification type="Error" message={DEFAULT_SESSION_MESSAGE} />);
    expect(events).toHaveLength(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('reports a sessionCode without showing it to the user', () => {
    const { container } = render(<Dialog error={sessionError()} origin="maps" sessionCode="TOKEN_REJECTED" />);
    expect(events[0].data).toMatchObject({ origin: 'maps', code: 'TOKEN_REJECTED' });
    expect(container.textContent).not.toContain('TOKEN_REJECTED');
  });

  it('hides the built-in dialog and calls the handler when a sessionError handler is registered', () => {
    const handler = vi.fn();
    DialogHandlerRegistry.set({ sessionError: handler });
    const { container } = render(<Dialog error={sessionError()} />);
    expect(container.textContent).toBe('');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ origin: 'auth', description: DEFAULT_SESSION_MESSAGE });
    expect(events).toHaveLength(1);
  });

  it('leaves a handler without sessionError alone: the built-in dialog still shows', () => {
    DialogHandlerRegistry.set({ alert: vi.fn() });
    render(<Dialog error={sessionError()} />);
    expect(screen.getByText(DEFAULT_SESSION_MESSAGE)).toBeTruthy();
  });

  it('does not touch other errors', () => {
    DialogHandlerRegistry.set({ sessionError: vi.fn() });
    render(<Dialog error={{ header: 'Error', message: 'Could not save the schedule.', errorType: 'error' }} />);
    expect(screen.getByText('Could not save the schedule.')).toBeTruthy();
    expect(events).toHaveLength(0);
  });

  it('applies the same rules to the notification', () => {
    const handler = vi.fn();
    const { container, rerender } = render(<Notification type="Error" message={DEFAULT_SESSION_MESSAGE} origin="maps" />);
    expect(container.textContent).toContain(DEFAULT_SESSION_MESSAGE);
    expect(events[0].data).toMatchObject({ origin: 'maps' });

    resetSessionEpisode();
    DialogHandlerRegistry.set({ sessionError: handler });
    rerender(<Notification type="Error" message={DEFAULT_SESSION_MESSAGE} origin="maps" />);
    expect(container.textContent).toBe('');
  });

  it('never treats a warning notice as a session error', () => {
    DialogHandlerRegistry.set({ sessionError: vi.fn() });
    const { container } = render(<Notification type="Warning" message={DEFAULT_SESSION_MESSAGE} />);
    expect(container.textContent).toContain(DEFAULT_SESSION_MESSAGE);
    expect(events).toHaveLength(0);
  });
});
