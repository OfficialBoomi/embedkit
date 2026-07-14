/**
 * @file FeedbackBar.test.tsx
 * @license BSD-2-Clause
 *
 * Unit tests for the agent response feedback controls and the
 * standardized EmbedKit event system they emit through.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackBar } from '../../components/agent/FeedbackBar';
import { BoomiEvents, BOOMI_EVENT_NAME, type EmbedKitEvent } from '../../events.service';
import type { AgentFeedbackConfig } from '../../types/agent.config';

const baseConfig: AgentFeedbackConfig = { enabled: true };

const context = {
  agentId: 'pack-1',
  sessionId: 'sess-1',
  messageId: 'msg-1',
  promptText: 'What is Boomi?',
};

describe('FeedbackBar', () => {
  const unsubscribes: Array<() => void> = [];
  const subscribe = (type: Parameters<typeof BoomiEvents.on>[0], handler: (e: EmbedKitEvent) => void) => {
    unsubscribes.push(BoomiEvents.on(type, handler));
  };

  afterEach(() => {
    unsubscribes.splice(0).forEach((off) => off());
  });

  it('renders thumbs up, thumbs down, and comment controls by default', () => {
    render(<FeedbackBar config={baseConfig} responseText="An iPaaS." context={context} />);
    expect(screen.getByLabelText('Good response')).toBeInTheDocument();
    expect(screen.getByLabelText('Bad response')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a comment')).toBeInTheDocument();
  });

  it('hides controls disabled via config and uses custom labels/icons', () => {
    render(
      <FeedbackBar
        config={{ thumbsDown: { show: false }, thumbsUp: { icon: '👍', label: 'Love it' } }}
        responseText="An iPaaS."
        context={context}
      />
    );
    expect(screen.getByLabelText('Love it')).toHaveTextContent('👍');
    expect(screen.queryByLabelText('Bad response')).not.toBeInTheDocument();
  });

  it('emits a standardized feedback event on thumbs up', async () => {
    const handler = vi.fn();
    subscribe('feedback', handler);
    const user = userEvent.setup();
    render(<FeedbackBar config={baseConfig} responseText="An iPaaS." context={context} />);

    await user.click(screen.getByLabelText('Good response'));

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as EmbedKitEvent;
    expect(event.type).toBe('feedback');
    expect(typeof event.timestamp).toBe('string');
    expect(event.source).toEqual({ agentId: 'pack-1', sessionId: 'sess-1', messageId: 'msg-1' });
    expect(event.data).toEqual({
      rating: 'up',
      prompt: 'What is Boomi?',
      response: 'An iPaaS.',
    });

    expect(await screen.findByText('Thanks for your feedback!')).toBeInTheDocument();
  });

  it('renders a custom comment placeholder from config', async () => {
    const user = userEvent.setup();
    render(
      <FeedbackBar
        config={{ comment: { placeholder: 'How did we do?' } }}
        responseText="An iPaaS."
        context={context}
      />
    );
    await user.click(screen.getByLabelText('Add a comment'));
    expect(screen.getByPlaceholderText('How did we do?')).toBeInTheDocument();
  });

  it('emits the comment together with the current rating on submit', async () => {
    const handler = vi.fn();
    subscribe('feedback', handler);
    const user = userEvent.setup();
    render(<FeedbackBar config={baseConfig} responseText="An iPaaS." context={context} />);

    await user.click(screen.getByLabelText('Bad response'));
    await user.click(screen.getByLabelText('Add a comment'));
    await user.type(screen.getByPlaceholderText('Tell us more about this response…'), 'Too vague');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(handler).toHaveBeenCalledTimes(2);
    const event = handler.mock.calls[1][0] as EmbedKitEvent;
    expect(event.data).toMatchObject({ rating: 'down', comment: 'Too vague' });
  });

  it('clears the rating when the active thumb is clicked again', async () => {
    const handler = vi.fn();
    subscribe('feedback', handler);
    const user = userEvent.setup();
    render(<FeedbackBar config={baseConfig} responseText="An iPaaS." context={context} />);

    await user.click(screen.getByLabelText('Good response'));
    await user.click(screen.getByLabelText('Good response'));

    expect(handler).toHaveBeenCalledTimes(2);
    expect((handler.mock.calls[1][0] as EmbedKitEvent).data).toMatchObject({ rating: null });
  });

  it("reaches wildcard subscribers and the 'boomi:event' DOM event", async () => {
    const wildcard = vi.fn();
    subscribe('*', wildcard);
    const domHandler = vi.fn();
    window.addEventListener(BOOMI_EVENT_NAME, domHandler as EventListener);

    const user = userEvent.setup();
    render(<FeedbackBar config={baseConfig} responseText="An iPaaS." context={context} />);
    await user.click(screen.getByLabelText('Good response'));

    expect(wildcard).toHaveBeenCalledTimes(1);
    expect(domHandler).toHaveBeenCalledTimes(1);
    const domEvent = domHandler.mock.calls[0][0] as CustomEvent<EmbedKitEvent>;
    expect(domEvent.detail.type).toBe('feedback');
    expect(domEvent.detail.data).toMatchObject({ rating: 'up' });

    window.removeEventListener(BOOMI_EVENT_NAME, domHandler as EventListener);
  });

  it('keeps emitting to healthy subscribers when one handler throws', async () => {
    const broken = vi.fn(() => { throw new Error('subscriber bug'); });
    const healthy = vi.fn();
    subscribe('feedback', broken);
    subscribe('feedback', healthy);

    const user = userEvent.setup();
    render(<FeedbackBar config={baseConfig} responseText="An iPaaS." context={context} />);
    await user.click(screen.getByLabelText('Good response'));

    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Thanks for your feedback!')).toBeInTheDocument();
  });

  it('tracks subscriber presence for UI gating', () => {
    expect(BoomiEvents.hasSubscribers('feedback')).toBe(false);
    const off = BoomiEvents.on('feedback', () => {});
    expect(BoomiEvents.hasSubscribers('feedback')).toBe(true);
    off();
    expect(BoomiEvents.hasSubscribers('feedback')).toBe(false);
  });
});
