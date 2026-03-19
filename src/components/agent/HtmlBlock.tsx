/**
 * Minimal HTML/Text renderer for agent responses.
 * Renders optional title, and either raw HTML (dangerously) or escaped text.
 */

import React, { useMemo } from 'react';

type HtmlBlockProps = {
  value: unknown;                  // object | string
  title?: string;                  // header label
  /** If value is a string and you want to dangerously set it as innerHTML */
  treatStringAsHTML?: boolean;
};

function safeStringify(obj: any, space = 2): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (_k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    },
    space,
  );
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const HtmlBlock: React.FC<HtmlBlockProps> = ({
  value,
  title,
  treatStringAsHTML = false,
}) => {
  const { display } = useMemo(() => {
    if (typeof value === 'string') {
      return { display: value };
    }
    return { display: safeStringify(value, 2) };
  }, [value]);

  return (
    <div className="w-full">
      {title ? <div className="text-xl font-semibold mb-2">{title}</div> : null}
      {typeof value === 'string' && treatStringAsHTML ? (
        <div
          className="agent-prose"
          style={{ color: 'var(--boomi-page-fg-color)', background: 'transparent' }}
          dangerouslySetInnerHTML={{ __html: display }}
        />
      ) : typeof value === 'string' ? (
        <div
          className="agent-prose whitespace-pre-wrap"
          style={{ color: 'var(--boomi-page-fg-color)' }}
          dangerouslySetInnerHTML={{ __html: escapeHtml(display) }}
        />
      ) : (
        <pre className="m-0 text-sm whitespace-pre-wrap break-words">{display}</pre>
      )}
    </div>
  );
};

export default HtmlBlock;
