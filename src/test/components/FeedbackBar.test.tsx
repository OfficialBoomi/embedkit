/**
 * @file FeedbackBar.test.tsx
 * @license BSD-2-Clause
 *
 * Unit tests for the agent response feedback controls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackBar } from '../../components/agent/FeedbackBar';
import type { AgentFeedbackConfig } from '../../types/agent.config';

const baseConfig: AgentFeedbackConfig = {
  enabled: true,
  postUrl: 'https://feedback.example.com/collect',
  params: { environment: 'test', appName: 'unit' },
};

const context = {
  agentId: 'pack-1',
  sessionId: 'sess-1',
  messageId: 'msg-1',
  promptText: 'What is Boomi?',
};

describe('FeedbackBar', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
        config={{
          ...baseConfig,
          thumbsDown: { show: false },
          thumbsUp: { icon: '👍', label: 'Love it' },
        }}
        responseText="An iPaaS."
        context={context}
      />
    );
    expect(screen.getByLabelText('Love it')).toHaveTextContent('👍');
    expect(screen.queryByLabelText('Bad response')).not.toBeInTheDocument();
  });

  it('posts prompt, response, rating, and custom params on thumbs up', async () => {
    const user = userEvent.setup();
    render(<FeedbackBar config={baseConfig} responseText="An iPaaS." context={context} />);

    await user.click(screen.getByLabelText('Good response'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(baseConfig.postUrl);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body.prompt).toBe('What is Boomi?');
    expect(body.response).toBe('An iPaaS.');
    expect(body.feedback).toEqual({ rating: 'up' });
    expect(body.environment).toBe('test');
    expect(body.appName).toBe('unit');
    expect(body.context).toMatchObject({
      agentId: 'pack-1',
      sessionId: 'sess-1',
      messageId: 'msg-1',
    });

    expect(await screen.findByText('Thanks for your feedback!')).toBeInTheDocument();
  });

  it('posts the comment together with the current rating on submit', async () => {
    const user = userEvent.setup();
    render(<FeedbackBar config={baseConfig} responseText="An iPaaS." context={context} />);

    await user.click(screen.getByLabelText('Bad response'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByLabelText('Add a comment'));
    await user.type(screen.getByPlaceholderText('Tell us more about this response…'), 'Too vague');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.feedback).toEqual({ rating: 'down', comment: 'Too vague' });
  });

  it('sends extra configured headers', async () => {
    const user = userEvent.setup();
    render(
      <FeedbackBar
        config={{ ...baseConfig, headers: { 'X-Api-Key': 'k123' } }}
        responseText="An iPaaS."
        context={context}
      />
    );

    await user.click(screen.getByLabelText('Good response'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].headers['X-Api-Key']).toBe('k123');
  });

  it('shows an error when the POST fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const user = userEvent.setup();
    render(<FeedbackBar config={baseConfig} responseText="An iPaaS." context={context} />);

    await user.click(screen.getByLabelText('Good response'));
    expect(await screen.findByText('Feedback could not be sent.')).toBeInTheDocument();
  });
});
