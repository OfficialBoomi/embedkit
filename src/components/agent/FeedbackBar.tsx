/**
 * @file FeedbackBar.tsx
 * @component FeedbackBar
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Thumbs up / thumbs down / comment feedback controls for an agent response.
 * Posts { prompt, response, feedback, context, ...params } as JSON to the
 * configured postUrl. Icons, labels, and colors are configurable via
 * AgentFeedbackConfig and --boomi-agent-feedback-* CSS variables.
 */

import React, { useState } from 'react';
import { FiThumbsUp, FiThumbsDown, FiMessageSquare } from 'react-icons/fi';
import type { AgentFeedbackConfig } from '../../types/agent.config';
import logger from '../../logger.service';

export type FeedbackRating = 'up' | 'down';

export type FeedbackContext = {
  agentId?: string;
  sessionId?: string;
  messageId?: string;
  promptText?: string;
};

type FeedbackBarProps = {
  config: AgentFeedbackConfig;
  responseText: string;
  context: FeedbackContext;
};

export type FeedbackPayload = {
  prompt: string;
  response: string;
  feedback: { rating: FeedbackRating | null; comment?: string };
  context: {
    agentId?: string;
    sessionId?: string;
    messageId?: string;
    submittedAt: string;
  };
  [key: string]: unknown;
};

export async function postFeedback(config: AgentFeedbackConfig, payload: FeedbackPayload): Promise<void> {
  const res = await fetch(config.postUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.headers ?? {}) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Feedback POST failed with status ${res.status}`);
}

const renderIcon = (custom: string | undefined, fallback: React.ReactNode) =>
  custom ? <span aria-hidden="true">{custom}</span> : fallback;

export const FeedbackBar: React.FC<FeedbackBarProps> = ({ config, responseText, context }) => {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showUp = config.thumbsUp?.show !== false;
  const showDown = config.thumbsDown?.show !== false;
  const showComment = config.comment?.show !== false;

  const buildPayload = (nextRating: FeedbackRating | null, nextComment: string): FeedbackPayload => ({
    ...(config.params ?? {}),
    prompt: context.promptText ?? '',
    response: responseText,
    feedback: {
      rating: nextRating,
      ...(nextComment.trim() ? { comment: nextComment.trim() } : {}),
    },
    context: {
      agentId: context.agentId,
      sessionId: context.sessionId,
      messageId: context.messageId,
      submittedAt: new Date().toISOString(),
    },
  });

  const send = async (nextRating: FeedbackRating | null, nextComment: string) => {
    setSending(true);
    setError(null);
    try {
      await postFeedback(config, buildPayload(nextRating, nextComment));
      setSubmitted(true);
    } catch (e) {
      logger.error({ err: e }, '[FeedbackBar] feedback post failed');
      setError('Feedback could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const handleRate = (next: FeedbackRating) => {
    if (sending) return;
    const resolved = rating === next ? null : next;
    setRating(resolved);
    setSubmitted(false);
    void send(resolved, comment);
  };

  const handleSubmitComment = () => {
    if (sending || !comment.trim()) return;
    void send(rating, comment);
    setCommentOpen(false);
  };

  const thanksText = config.thanksText ?? 'Thanks for your feedback!';

  return (
    <div className="boomi-agent-feedback" role="group" aria-label="Response feedback">
      {showUp && (
        <button
          type="button"
          className={`boomi-agent-feedback__btn is-up ${rating === 'up' ? 'is-active' : ''}`}
          onClick={() => handleRate('up')}
          disabled={sending}
          title={config.thumbsUp?.label ?? 'Good response'}
          aria-label={config.thumbsUp?.label ?? 'Good response'}
          aria-pressed={rating === 'up'}
        >
          {renderIcon(config.thumbsUp?.icon, <FiThumbsUp />)}
        </button>
      )}
      {showDown && (
        <button
          type="button"
          className={`boomi-agent-feedback__btn is-down ${rating === 'down' ? 'is-active' : ''}`}
          onClick={() => handleRate('down')}
          disabled={sending}
          title={config.thumbsDown?.label ?? 'Bad response'}
          aria-label={config.thumbsDown?.label ?? 'Bad response'}
          aria-pressed={rating === 'down'}
        >
          {renderIcon(config.thumbsDown?.icon, <FiThumbsDown />)}
        </button>
      )}
      {showComment && (
        <button
          type="button"
          className={`boomi-agent-feedback__btn is-comment ${commentOpen ? 'is-active' : ''}`}
          onClick={() => setCommentOpen((open) => !open)}
          disabled={sending}
          title={config.comment?.label ?? 'Add a comment'}
          aria-label={config.comment?.label ?? 'Add a comment'}
          aria-expanded={commentOpen}
        >
          {renderIcon(config.comment?.icon, <FiMessageSquare />)}
        </button>
      )}
      {submitted && !commentOpen && (
        <span className="boomi-agent-feedback__thanks" role="status">{thanksText}</span>
      )}
      {error && <span className="boomi-agent-feedback__error" role="alert">{error}</span>}
      {commentOpen && (
        <div className="boomi-agent-feedback__comment">
          <textarea
            className="boomi-agent-feedback__textarea"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={config.comment?.placeholder ?? 'Tell us more about this response…'}
            rows={3}
            disabled={sending}
          />
          <button
            type="button"
            className="boomi-agent-feedback__submit"
            onClick={handleSubmitComment}
            disabled={sending || !comment.trim()}
          >
            {sending ? 'Sending…' : config.comment?.submitLabel ?? 'Submit'}
          </button>
        </div>
      )}
    </div>
  );
};

export default FeedbackBar;
