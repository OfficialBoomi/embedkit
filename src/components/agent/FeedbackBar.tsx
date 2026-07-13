/**
 * @file FeedbackBar.tsx
 * @component FeedbackBar
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Thumbs up / thumbs down / comment feedback controls for an agent response.
 * Emits a standardized 'feedback' event through the EmbedKit event system —
 * the host application subscribes (BoomiPlugin onEvent, BoomiEvents.on, or the
 * 'boomi:event' DOM event) and decides where the data goes. Nothing is sent
 * over the network by EmbedKit. Icons, labels, and colors are configurable via
 * AgentFeedbackConfig and --boomi-agent-feedback-* CSS variables.
 */

import React, { useState } from 'react';
import { FiThumbsUp, FiThumbsDown, FiMessageSquare } from 'react-icons/fi';
import type { AgentFeedbackConfig } from '../../types/agent.config';
import { emitEmbedKitEvent, type FeedbackEventData } from '../../events.service';

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

const renderIcon = (custom: string | undefined, fallback: React.ReactNode) =>
  custom ? <span aria-hidden="true">{custom}</span> : fallback;

export const FeedbackBar: React.FC<FeedbackBarProps> = ({ config, responseText, context }) => {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const showUp = config.thumbsUp?.show !== false;
  const showDown = config.thumbsDown?.show !== false;
  const showComment = config.comment?.show !== false;

  const emit = (nextRating: FeedbackRating | null, nextComment: string) => {
    const data: FeedbackEventData = {
      rating: nextRating,
      ...(nextComment.trim() ? { comment: nextComment.trim() } : {}),
      prompt: context.promptText ?? '',
      response: responseText,
    };
    emitEmbedKitEvent('feedback', {
      agentId: context.agentId,
      sessionId: context.sessionId,
      messageId: context.messageId,
    }, data);
    setSubmitted(true);
  };

  const handleRate = (next: FeedbackRating) => {
    const resolved = rating === next ? null : next;
    setRating(resolved);
    emit(resolved, comment);
  };

  const handleSubmitComment = () => {
    if (!comment.trim()) return;
    emit(rating, comment);
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
      {commentOpen && (
        <div className="boomi-agent-feedback__comment">
          <textarea
            className="boomi-agent-feedback__textarea"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={config.comment?.placeholder ?? 'Tell us more about this response…'}
            rows={3}
          />
          <button
            type="button"
            className="boomi-agent-feedback__submit"
            onClick={handleSubmitComment}
            disabled={!comment.trim()}
          >
            {config.comment?.submitLabel ?? 'Submit'}
          </button>
        </div>
      )}
    </div>
  );
};

export default FeedbackBar;
