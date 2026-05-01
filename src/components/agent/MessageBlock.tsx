/**
 * @file MessageBlock.tsx
 * @component MessageBlock
 * @license BSD-2-Clause
 *
 * Renders a chat message using a single, normalized schema:
 * { role, type, content: { data }, metadata }
 *
 * The client interprets only content.data based on type.
 */
import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { CodeBlock } from './CodeBlock';
import { ErrorBlock } from './ErrorBlock';
import { HtmlBlock } from './HtmlBlock';
import logger from '../../logger.service';

type MessageBlockProps = {
  m: any;
  getMsgText: (m: any) => string;
  isBoomiDirect?: boolean;
};

// Configure marked: keep line breaks inside paragraphs, don't mangle links.
marked.setOptions({ breaks: true, gfm: true });

// Parse markdown → sanitized HTML. Passes through plain text and raw HTML safely.
// ADD_ATTR: ['target', 'rel'] — DOMPurify strips target by default (phishing mitigation),
// but agent responses may legitimately include target="_blank" links.
const markdownToHtml = (text: string): string => {
  const raw = marked.parse(text) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true }, ADD_ATTR: ['target', 'rel'] });
};

export const MessageBlock: React.FC<MessageBlockProps> = ({ m, getMsgText, isBoomiDirect = false }) => {
  const isUser = m?.role === 'user';
  // History messages arrive with content serialized as a JSON string;
  // SSE messages arrive with content already parsed as an object.
  // Normalize to an object first so .data access works in both cases.
  const normalizedContent: any = (() => {
    const raw = m?.content;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { return JSON.parse(trimmed); } catch {}
      }
    }
    return raw;
  })();
  const rawData = normalizedContent?.data ?? normalizedContent;
  let data = rawData;
  if (typeof rawData === 'string') {
    const trimmed = rawData.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        data = rawData;
      }
    }
  }
  logger.debug("recieved message: ", m);

  // USER bubble
  if (isUser) {
    return (
      <div className="w-full flex justify-end px-2">
        <div className="w-full flex justify-end">
          <div className="boomi-agent-bubble from-user">
            <div className="boomi-agent-bubble-text">{getMsgText(m)}</div>
          </div>
        </div>
      </div>
    );
  }

  const authEvent = isBoomiDirect && m?.metadata?.event === 'application_auth_required';
  if (authEvent && data && typeof data === 'object') {
    const auth = data as any;
    const authUrl = typeof auth.authorization_url === 'string' ? auth.authorization_url : '';
    const appName = typeof auth.application_name === 'string' ? auth.application_name : 'application';
    const signInMsg = typeof auth.sign_in_message === 'string' ? auth.sign_in_message : 'Authorization required';
    return (
      <div className="w-full">
        <div className="w-full max-w-[1024px] px-4 md:px-6">
          <div className="rounded-xl border border-[var(--boomi-card-border)] bg-[var(--boomi-card-bg)] shadow-[var(--boomi-card-shadow)] p-4 md:p-5">
            <div className="text-sm uppercase tracking-wide text-[var(--boomi-muted)]">Authorization required</div>
            <div className="mt-1 text-base font-semibold text-[var(--boomi-page-fg-color)]">{appName}</div>
            <div className="mt-2 text-sm text-[var(--boomi-page-fg-color)]">{signInMsg}</div>
            {authUrl ? (
              <div className="mt-4">
                <a
                  href={authUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg boomi-btn-primary px-4 py-2 text-sm font-semibold"
                >
                  Authorize {appName}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ERROR: expects content.data to be the error object
  if (m?.type === 'error') {
    const errObj = data && typeof data === 'object' ? (data as any) : {};
    const errTitle = typeof errObj.title === 'string' && errObj.title.trim() ? errObj.title : 'Agent error';
    const errMsg =
      (typeof errObj.message === 'string' && errObj.message) ||
      (typeof errObj.data === 'string' && errObj.data) ||
      undefined;
    const rawErr = errObj.raw ?? errObj;
    const errorPayload = {
      ...errObj,
      title: errTitle,
      message: errMsg,
      raw: rawErr ?? errObj,
    };

    return (
      <div className="w-full">
        <ErrorBlock
          error={errorPayload}
          title={errTitle}
          defaultOpen
          showStackToggle
          showRawToggle
        />
      </div>
    );
  }

  // Catch error-shaped payloads that arrived without type='error'
  // (e.g. { success: false, error: "Agent not found" } from the platform).
  if (data && typeof data === 'object') {
    const d = data as any;
    const errStr =
      (d.success === false && typeof d.error === 'string' && d.error.trim()) ||
      (d.success === false && typeof d.message === 'string' && d.message.trim()) ||
      '';
    if (errStr) {
      const errorPayload = { title: 'Agent error', message: errStr, raw: data };
      return (
        <div className="w-full">
          <ErrorBlock
            error={errorPayload}
            title="Agent error"
            defaultOpen
            showStackToggle={false}
            showRawToggle={false}
          />
        </div>
      );
    }
  }

  // TEXT (with optional rich html rendering)
  if (m?.type === 'text') {
    // If data carries html/title, render as rich HTML
    if (data && typeof data === 'object' && typeof (data as any).html === 'string') {
      return (
        <div className="w-full">
          <div className="w-full max-w-[1024px] px-4 md:px-6 leading-7 text-[var(--boomi-page-fg-color)]">
            <HtmlBlock
              title={(data as any).title}
              value={(data as any).html}
              treatStringAsHTML
            />
          </div>
        </div>
      );
    }

    const text = typeof data === 'string' ? data : data != null ? String(data) : '';
    return (
      <div className="w-full">
        <div className="w-full max-w-[1024px] px-4 md:px-6 leading-7 text-[var(--boomi-page-fg-color)]">
          <HtmlBlock value={markdownToHtml(text)} treatStringAsHTML />
        </div>
      </div>
    );
  }

  // JSON / CODE
  // ALL OTHER NON-ERROR MESSAGES: render HTML if present, otherwise code/json
  if (data && typeof data === 'object' && typeof (data as any).html === 'string') {
    return (
      <div className="w-full">
        <div className="w-full max-w-[1024px] px-4 md:px-6 leading-7 text-[var(--boomi-page-fg-color)]">
          <HtmlBlock
            title={(data as any).title}
            value={(data as any).html}
            treatStringAsHTML
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="w-full max-w-[1024px] px-4 md:px-6 leading-7 text-[var(--boomi-page-fg-color)]">
        <CodeBlock value={data ?? m?.content} language="json" title="Data" />
      </div>
    </div>
  );
};

export default MessageBlock;
