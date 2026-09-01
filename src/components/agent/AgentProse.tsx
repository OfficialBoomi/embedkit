/**
 * @file AgentProse.tsx
 * @component AgentProse
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders an agent response's Markdown as contained, copyable prose.
 *
 * Agent responses are Markdown containing tables, fenced code, and long
 * unbreakable tokens (component ids, XML attributes, file paths). Rendered as
 * bare HTML those overflow the chat pane horizontally, because a `<table>` does
 * not shrink to its container and `word-break: normal` cannot break a long
 * token. This component is the containment boundary:
 *
 * - every table is wrapped in its own horizontal scroll container
 * - every fenced code block scrolls inside itself and gets a copy button
 * - the whole response gets a copy button that yields the original Markdown,
 *   not the rendered text, so pasting it elsewhere keeps its formatting
 *
 * Presentation lives in `.agent-prose` in main.css, entirely behind
 * `--boomi-agent-prose-*` custom properties so a host can restyle it. Copy
 * affordances are configurable per agent through `ui.copy`.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { FiCopy, FiCheck } from 'react-icons/fi';
import type { AgentCopyConfig } from '../../types/agent.config';

type AgentProseProps = {
  /** Raw Markdown from the agent. */
  markdown: string;
  /** Per-agent copy affordance configuration (`ui.copy`). */
  copy?: AgentCopyConfig;
};

marked.setOptions({ breaks: true, gfm: true });

/** Marker attribute used to find code-copy buttons during event delegation. */
const COPY_ATTR = 'data-boomi-copy-code';

/**
 * Convert Markdown to sanitized, contained HTML.
 *
 * Post-processing runs *after* DOMPurify so the wrapper and button elements —
 * which this module constructs itself and are therefore known-safe — are not
 * stripped by the sanitizer's attribute filtering.
 */
function buildProseHtml(markdown: string, showCodeCopy: boolean, copyLabel: string): string {
  const raw = marked.parse(markdown ?? '') as string;
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  });

  // jsdom-less environments (SSR, tests) have no DOMParser; fall back to the
  // sanitized HTML unwrapped rather than throwing.
  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return clean;
  }

  const doc = new window.DOMParser().parseFromString(`<div id="root">${clean}</div>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return clean;

  // A table cannot be made to shrink to its container, so give each one a
  // scroll container of its own. Without this the table pushes the whole
  // message wider than the pane.
  root.querySelectorAll('table').forEach((table) => {
    const wrap = doc.createElement('div');
    wrap.className = 'agent-prose__scroll';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Table');
    wrap.setAttribute('tabindex', '0');
    table.parentNode?.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

  // Fenced code: a header strip carrying the language and a copy button, so the
  // button never overlaps the code the way an absolutely positioned one does.
  root.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    const langClass = [...(code?.classList ?? [])].find((c) => c.startsWith('language-'));
    const lang = langClass ? langClass.slice('language-'.length) : '';

    const figure = doc.createElement('div');
    figure.className = 'agent-prose__code';

    const head = doc.createElement('div');
    head.className = 'agent-prose__code-head';

    const label = doc.createElement('span');
    label.className = 'agent-prose__code-lang';
    label.textContent = lang || 'code';
    head.appendChild(label);

    if (showCodeCopy) {
      const btn = doc.createElement('button');
      btn.setAttribute('type', 'button');
      btn.setAttribute(COPY_ATTR, '1');
      btn.className = 'agent-prose__code-copy';
      btn.setAttribute('aria-label', copyLabel);
      btn.title = copyLabel;
      btn.textContent = copyLabel;
      head.appendChild(btn);
    }

    pre.parentNode?.insertBefore(figure, pre);
    figure.appendChild(head);
    figure.appendChild(pre);
  });

  return root.innerHTML;
}

function writeClipboard(text: string): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { clipboard?: { writeText?: (s: string) => Promise<void> } };
    if (nav.clipboard?.writeText) {
      return nav.clipboard.writeText(text).then(() => true).catch(() => false);
    }
  } catch {
    /* fall through */
  }
  return Promise.resolve(false);
}

export const AgentProse: React.FC<AgentProseProps> = ({ markdown, copy }) => {
  const showMessageCopy = copy?.showMessageCopy !== false;
  const showCodeCopy = copy?.showCodeCopy !== false;
  const copyLabel = copy?.label ?? 'Copy';
  const copiedLabel = copy?.copiedLabel ?? 'Copied';

  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const html = useMemo(
    () => buildProseHtml(markdown, showCodeCopy, copyLabel),
    [markdown, showCodeCopy, copyLabel]
  );

  const handleMessageCopy = useCallback(() => {
    // Copy the Markdown source rather than the rendered text: it survives a
    // paste into a doc, an editor, or another chat with its structure intact.
    void writeClipboard(markdown).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }, [markdown]);

  // One delegated handler for every code-block copy button, since the buttons
  // live inside HTML set via innerHTML and cannot carry React props.
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.(`[${COPY_ATTR}]`) as HTMLElement | null;
      if (!btn) return;
      const codeText = btn.closest('.agent-prose__code')?.querySelector('code')?.textContent ?? '';
      if (!codeText) return;
      void writeClipboard(codeText).then((ok) => {
        if (!ok) return;
        btn.textContent = copiedLabel;
        btn.classList.add('is-copied');
        setTimeout(() => {
          btn.textContent = copyLabel;
          btn.classList.remove('is-copied');
        }, 1400);
      });
    },
    [copyLabel, copiedLabel]
  );

  return (
    <div className="agent-prose-wrap">
      {showMessageCopy && (
        <button
          type="button"
          className={`agent-prose-copy ${copied ? 'is-copied' : ''}`}
          onClick={handleMessageCopy}
          title={copied ? copiedLabel : copyLabel}
          aria-label={copied ? copiedLabel : `${copyLabel} response`}
        >
          {copied ? <FiCheck aria-hidden /> : <FiCopy aria-hidden />}
          <span className="agent-prose-copy__label">{copied ? copiedLabel : copyLabel}</span>
        </button>
      )}
      <div
        ref={containerRef}
        className="agent-prose"
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};

export default AgentProse;
