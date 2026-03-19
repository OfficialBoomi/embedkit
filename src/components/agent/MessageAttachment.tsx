/**
 * @file MessageAttachment.tsx
 * @component MessageAttachment
 * @license BSD-2-Clause
 *
 * Simple renderer for a message attachment. Supports name/url/size/mime.
 */
import React from 'react';

export type Attachment = {
  url?: string;
  name?: string;
  size?: number;
  mime?: string;
};

export const MessageAttachment: React.FC<{ attachment: Attachment }> = ({ attachment }) => {
  const { url, name, size, mime } = attachment;
  const label = name || url || 'Attachment';

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 border border-[var(--boomi-card-border)] hover:bg-[var(--boomi-card-bg)] text-sm"
      >
        <span className="font-medium truncate max-w-[220px]">{label}</span>
        {size ? <span className="text-xs opacity-70">({size} bytes)</span> : null}
        {mime ? <span className="text-xs opacity-70">· {mime}</span> : null}
      </a>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-lg px-3 py-2 border border-[var(--boomi-card-border)] text-sm">
      <span className="font-medium truncate max-w-[220px]">{label}</span>
      {size ? <span className="text-xs opacity-70">({size} bytes)</span> : null}
      {mime ? <span className="text-xs opacity-70">· {mime}</span> : null}
    </div>
  );
};

export default MessageAttachment;
