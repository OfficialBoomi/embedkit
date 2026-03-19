/**
 * @file TextBlock.tsx
 * @component TextBlock
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Themed text block with copy, optional header, and linkified URLs.
 */

import React, { useMemo, useState } from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';

type TextBlockProps = {
  text: string;
  maxHeight?: number;  
  monospace?: boolean;
};

function linkify(text: string): (string | React.ReactElement)[] {
  const urlRe = /(https?:\/\/[^\s)]+)|(\bwww\.[^\s)]+)/gi;
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = urlRe.exec(text))) {
    const [match] = m;
    const start = m.index;
    if (start > lastIndex) parts.push(text.slice(lastIndex, start));
    const url = match.startsWith('http') ? match : `http://${match}`;
    parts.push(
      <a
        key={`${start}-${match}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        {match}
      </a>
    );
    lastIndex = start + match.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function copyToClipboard(s: string) {
  try { navigator.clipboard.writeText(s); } catch {}
}

export const TextBlock: React.FC<TextBlockProps> = ({
  text,
  maxHeight,
  monospace = true,
}) => {
  const [copied, setCopied] = useState(false);

  const content = useMemo(() => linkify(text), [text]);

  const handleCopy = () => {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const contentClass = [
    'boomi-agent-text-block__content text-sm',
    monospace ? 'is-mono' : '',
    maxHeight ? 'is-scrollable boomi-scroll' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="boomi-agent-text-block" aria-live="polite">
      <button
        type="button"
        className={`boomi-agent-text-block__copy ${copied ? 'is-copied' : ''}`}
        onClick={handleCopy}
        title={copied ? 'Copied' : 'Copy'}
        aria-label={copied ? 'Copied' : 'Copy agent response'}
      >
        {copied ? <FiCheck /> : <FiCopy />}
      </button>
      {copied && <span className="boomi-agent-text-block__copy-toast">Copied</span>}
      <div className={contentClass} style={maxHeight ? { maxHeight } : undefined}>
        {content}
      </div>
    </section>
  );
};

export default TextBlock;
