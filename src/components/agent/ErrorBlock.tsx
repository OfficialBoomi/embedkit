/**
 * @file ErrorBlock.tsx
 * @component ErrorBlock
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Themed error box with collapse/expand, copy, optional stack/raw details, and action slot.
 * Uses existing design tokens (boomi-* CSS vars) and utility classes you already ship.
 */

import React, { useMemo, useState } from 'react';
import { AiOutlineCopy, AiOutlineDown, AiOutlineUp, AiOutlineWarning } from 'react-icons/ai';

type ErrorLike = {
  name?: string;
  message?: string;
  code?: string | number;
  status?: number;
  requestId?: string;
  stack?: string;
  cause?: any;
};

type ErrorBlockProps = {
  error: unknown;
  title?: string;
  /** Start expanded by default */
  defaultOpen?: boolean;
  /** Optional small action row on the right of header (Retry, Dismiss, etc.) */
  actions?: React.ReactNode;
  /** Show raw JSON payload toggle */
  showRawToggle?: boolean;
  /** Show stack trace section toggle */
  showStackToggle?: boolean;
  /** Optional compact mode (smaller paddings) */
  compact?: boolean;
  /** Optional aria label for better accessibility */
  ariaLabel?: string;
};

/**
 * Convert unknown error into a plain JS object and
 * flatten common shapes like `{ data: {...} }` and `cause.response.data`.
 */
function toPlainObject(err: ErrorBlockProps['error']) {
  if (typeof err === 'string') {
    return { message: err };
  }
  if (!err || typeof err !== 'object') {
    return { message: String(err) };
  }

  const base: Record<string, any> = {};
  const src = err as any;

  const keys = new Set<string>([
    ...Object.keys(src as object),
    'name',
    'message',
    'code',
    'status',
    'requestId',
    'stack',
    'cause',
  ]);

  keys.forEach((k) => {
    try {
      const v = src[k];
      base[k] = v;
    } catch {
      base[k] = '[unavailable]';
    }
  });

  // Flatten common nested locations without clobbering existing values
  const flattenIntoBase = (obj: any) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    Object.keys(obj).forEach((k) => {
      if (base[k] === undefined) {
        base[k] = obj[k];
      }
    });
  };

  if (base.data) flattenIntoBase(base.data);
  if (base.response && typeof base.response === 'object') {
    if ((base.response as any).data) flattenIntoBase((base.response as any).data);
  }
  if (base.cause && typeof base.cause === 'object') {
    if ((base.cause as any).data) flattenIntoBase((base.cause as any).data);
    if ((base.cause as any).response && (base.cause as any).response.data) {
      flattenIntoBase((base.cause as any).response.data);
    }
  }

  return base;
}

function safeStringify(obj: any, space = 2): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (_k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      if (v instanceof Error) {
        return {
          name: v.name,
          message: v.message,
          stack: v.stack,
          ...toPlainObject(v),
        };
      }
      return v;
    },
    space,
  );
}

function copy(text: string) {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

const Chip: React.FC<{
  variant?: 'error' | 'warning' | 'success' | 'default';
  children: React.ReactNode;
  title?: string;
}> = ({ variant = 'error', children, title }) => {
  const cls =
    variant === 'error'
      ? 'boomi-chip boomi-chip--error'
      : variant === 'warning'
      ? 'boomi-chip boomi-chip--warning'
      : variant === 'success'
      ? 'boomi-chip boomi-chip--success'
      : 'boomi-chip';
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
};

export const ErrorBlock: React.FC<ErrorBlockProps> = ({
  error,
  title,
  defaultOpen = true,
  actions,
  showRawToggle = true,
  showStackToggle = true,
  compact = false,
  ariaLabel,
}) => {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [showRaw, setShowRaw] = useState<boolean>(false);
  const [showStack, setShowStack] = useState<boolean>(false);

  const data = useMemo(() => toPlainObject(error), [error]);

  // Prefer rich error details coming from the server:
  const reason =
    (typeof data.reason === 'string' && data.reason.trim()) ||
    (typeof data.errorDescription === 'string' && data.errorDescription.trim()) ||
    undefined;

  const primaryMessage =
    (typeof data.message === 'string' && data.message.trim()) ||
    reason ||
    (typeof data.error === 'string' && data.error.trim()) ||
    (typeof data.title === 'string' && data.title.trim()) ||
    'An unexpected error occurred.';

  const code = data?.code ?? data?.status;
  const requestId = data?.requestId ?? data?.traceId ?? data?.correlationId;
  const name = data?.name || data?.title || 'Error';
  const stack = typeof data?.stack === 'string' ? data.stack : undefined;

  const issues: any[] = Array.isArray(data?.issues) ? data.issues : [];
  const hasIssues = issues.length > 0;

  const headerTitle = title || data?.title || 'Something went wrong';

  const headerPadding = compact ? 'py-2 px-2' : 'py-2.5 px-3';
  const bodyPadding = compact ? 'p-2' : 'p-3';

  return (
    <section
      className="boomi-card rounded-lg"
      aria-label={ariaLabel ?? 'Error block'}
      role="alert"
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between border-b border-[var(--boomi-card-border)] ${headerPadding}`}
        style={{ background: 'var(--boomi-notice-bg)', color: 'var(--boomi-notice-fg)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AiOutlineWarning className="boomi-notice__icon" aria-hidden />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="boomi-update-title m-0 truncate">{headerTitle}</h3>
              {code != null && (
                <Chip variant="error" title="Error code / status">
                  {String(code)}
                </Chip>
              )}
              {requestId && (
                <Chip variant="warning" title="Request ID">
                  {String(requestId)}
                </Chip>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy primary message */}
          <button
            type="button"
            className="boomi-btn-secondary px-2 py-1 rounded inline-flex items-center gap-1"
            onClick={() => copy(primaryMessage)}
            aria-label="Copy error message"
            title="Copy error message"
          >
            <AiOutlineCopy />
            <span className="text-xs font-semibold">Copy</span>
          </button>

          {/* Raw toggle */}
          {showRawToggle && (
            <button
              type="button"
              className="boomi-btn-secondary px-2 py-1 rounded text-xs font-semibold"
              onClick={() => setShowRaw((v) => !v)}
              aria-pressed={showRaw}
              aria-label="Toggle raw payload"
              title="Toggle raw payload"
            >
              Raw
            </button>
          )}

          {/* Stack toggle */}
          {showStackToggle && stack && (
            <button
              type="button"
              className="boomi-btn-secondary px-2 py-1 rounded text-xs font-semibold"
              onClick={() => setShowStack((v) => !v)}
              aria-pressed={showStack}
              aria-label="Toggle stack trace"
              title="Toggle stack trace"
            >
              Stack
            </button>
          )}

          {/* Custom actions (Retry, Dismiss, etc.) */}
          {actions}

          {/* Collapse */}
          <button
            type="button"
            className="boomi-btn-secondary px-2 py-1 rounded inline-flex items-center gap-1"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="error-block-body"
            title={open ? 'Collapse' : 'Expand'}
          >
            {open ? <AiOutlineUp /> : <AiOutlineDown />}
            <span className="text-xs font-semibold">{open ? 'Hide' : 'Show'}</span>
          </button>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div id="error-block-body" className={`boomi-update-content ${bodyPadding}`}>
          {/* Primary message */}
          <div
            className="boomi-notice boomi-connector-inner mb-3"
            style={{ background: 'var(--boomi-update-content-bg)' }}
          >
            <div className="boomi-notice__text break-words">
              {primaryMessage}
            </div>
          </div>

          {/* Helpful key facts row */}
          <div className="grid gap-2 sm:grid-cols-2 mb-2">
            {code != null && (
              <div className="boomi-kv-row">
                <div className="boomi-kv-key">Status / Code</div>
                <div className="boomi-kv-val">{String(code)}</div>
              </div>
            )}
            {requestId && (
              <div className="boomi-kv-row">
                <div className="boomi-kv-key">Request ID</div>
                <div className="boomi-kv-val break-words">{String(requestId)}</div>
              </div>
            )}
            {reason && reason !== primaryMessage && (
              <div className="boomi-kv-row sm:col-span-2">
                <div className="boomi-kv-key">Reason</div>
                <div className="boomi-kv-val break-words">{reason}</div>
              </div>
            )}
          </div>

          {/* Issues list (for Zod / validation style errors) */}
          {hasIssues && (
            <div className="mt-2">
              <div className="boomi-connector-inner mb-1">
                <div className="boomi-connector-heading">Details</div>
              </div>
              <ul className="list-disc pl-5 text-[13px] space-y-1">
                {issues.map((iss, idx) => {
                  const msg =
                    iss?.message ||
                    iss?.detail ||
                    iss?.error ||
                    JSON.stringify(iss);
                  const path =
                    Array.isArray(iss?.path) && iss.path.length
                      ? ` (${iss.path.join('.')})`
                      : '';
                  return (
                    <li key={idx} className="break-words">
                      {msg}
                      {path}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Stack (optional) */}
          {showStack && stack && (
            <div className="mt-3">
              <div className="boomi-connector-inner mb-1">
                <div className="boomi-connector-heading">Stack Trace</div>
              </div>
              <pre
                className="m-0 p-2 text-[13px] leading-6 whitespace-pre-wrap break-words border rounded"
                style={{
                  borderColor: 'var(--boomi-card-border)',
                  background: 'var(--boomi-update-content-bg)',
                }}
              >
                {stack}
              </pre>
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  className="boomi-btn-secondary px-2 py-1 rounded text-xs font-semibold"
                  onClick={() => copy(stack)}
                  aria-label="Copy stack trace"
                >
                  Copy Stack
                </button>
              </div>
            </div>
          )}

          {/* Raw JSON (optional) */}
          {showRaw && (
            <div className="mt-3">
              <div className="boomi-connector-inner mb-1">
                <div className="boomi-connector-heading">Raw Payload</div>
              </div>
              <pre
                className="m-0 p-2 text-[13px] leading-6 whitespace-pre overflow-auto boomi-scroll border rounded"
                style={{
                  borderColor: 'var(--boomi-card-border)',
                  background: 'var(--boomi-update-content-bg)',
                  maxHeight: 260,
                }}
              >
                {safeStringify(data, 2)}
              </pre>
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  className="boomi-btn-secondary px-2 py-1 rounded text-xs font-semibold"
                  onClick={() => copy(safeStringify(data, 2))}
                  aria-label="Copy raw payload"
                >
                  Copy Raw
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default ErrorBlock;

/* ----------------------------------------------------------------
   Optional: keep a simple PlainTextBlock using same visual language
----------------------------------------------------------------- */

export const PlainTextBlock: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="boomi-card border rounded-lg overflow-hidden">
      <div className="flex items-center justify-end px-2 py-1 border-b border-[var(--boomi-card-border)]">
        <button
          className="boomi-btn-secondary px-2 py-1 rounded text-xs font-semibold"
          onClick={() => copy(text)}
          aria-label="Copy text"
        >
          Copy
        </button>
      </div>
      <pre
        className="m-0 p-2 text-[13px] leading-6 whitespace-pre-wrap break-words"
        style={{ background: 'var(--boomi-update-content-bg)' }}
      >
        {text}
      </pre>
    </div>
  );
};
