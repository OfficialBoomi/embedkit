/**
 * @file MainChat.tsx
 * @component MainChat
 * @license BSD-2-Clause
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePlugin } from '../../context/pluginContext';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import AjaxLoader from '../ui/AjaxLoader';
import { MessageBlock } from './MessageBlock';
import { getMsgText } from './utils/message';
import StatusRowChip from './StatusRowChip';
import { ErrorBlock } from './ErrorBlock';

type MainChatProps = {
  integration: IntegrationPackInstance;
  sessionId: string;
  messages: Array<any>;
  busy: boolean;
  status?: { state: 'idle'|'working'|'progress'|'error'; note?: string };
  onSend: (text: string) => void | Promise<void>;
  onSendRich?: (args: { text: string; files?: File[] }) => void | Promise<void>;
  emptyState: boolean;
  loading?: boolean;
  error?: unknown;
};

function humanBytes(n: number) {
  if (!Number.isFinite(n)) return `${n}`;
  const units = ['B','KB','MB','GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// inline icons to avoid extra deps
const PaperclipIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <path d="M21.44 11.05 12 20.5a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.88 17.96a2 2 0 1 1-2.83-2.83l8.13-8.13"/>
  </svg>
);
const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export default function MainChat({
  integration,
  sessionId,
  messages,
  busy,
  status,
  onSend,
  onSendRich,
  emptyState,
  loading = false,
  error,
}: MainChatProps) {
  const { boomiConfig } = usePlugin();

  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const forceScrollRef = useRef(false);
  const [composerPad, setComposerPad] = useState(120);

  const isThinking = status?.state === 'working' || status?.state === 'progress';
  const canSend = !busy && !isThinking;

  const packId = integration.integrationPackId;
  const uiCfg = packId ? (boomiConfig?.agents?.[packId]?.ui as any) ?? undefined : undefined;
  const isBoomiDirect = packId ? boomiConfig?.agents?.[packId]?.transport === 'boomi-direct' : false;

  const allowFreeTextPrompt: boolean = uiCfg?.allowFreeTextPrompt !== false;
  const promptDefs: Array<{ title: string; prompt: string }> = Array.isArray(uiCfg?.prompts) ? uiCfg.prompts : [];
  const promptsAlign: 'left' | 'center' | 'right' = uiCfg?.promptsAlign ?? 'center';
  const promptsLocation: 'input' | 'welcome' = uiCfg?.promptsLocation ?? 'input';
  const promptAlignClass = promptsAlign === 'left' ? 'justify-start' : promptsAlign === 'right' ? 'justify-end' : 'justify-center';

  const fileAttachmentSupported: boolean = !!uiCfg?.fileAttachmentSupported;
  const fileAttachmentRequired: boolean = !!uiCfg?.fileAttachmentRequired;
  const allowedFileExtensions: string[] = Array.isArray(uiCfg?.allowedFileExtensions)
    ? uiCfg.allowedFileExtensions.map((e: string) => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`))
    : [];
  const needsAttachment =
    fileAttachmentSupported && fileAttachmentRequired && attachments.length === 0;
  const maxFiles: number = Number.isFinite(uiCfg?.maxFiles) ? uiCfg.maxFiles : 5;
  const maxTotalBytes: number = Number.isFinite(uiCfg?.maxTotalBytes) ? uiCfg.maxTotalBytes : 25 * 1024 * 1024; // 25MB

  const agentWelcome = uiCfg?.welcome ?? undefined;
  const title = agentWelcome?.title ?? 'Welcome to your Agent Chat';
  const subtitle = agentWelcome?.subtitle ?? 'Ask me anything about your integrations.';

  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const firstRenderRef = useRef(true);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const list = listRef.current;
    if (!list) return;
    const end = endRef.current;
    const composerH = composerRef.current?.offsetHeight ?? 0;
    const buffer = 32; // small breathing room above composer
    const endOffset = end ? end.offsetTop : list.scrollHeight;
    const target = Math.max(0, endOffset - (list.clientHeight - composerH - buffer));
    list.scrollTo({ top: target, behavior });
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    setAtBottom(near);
    atBottomRef.current = near;
  };

  useEffect(() => {
    const behavior: ScrollBehavior = firstRenderRef.current ? 'auto' : 'smooth';
    scrollToBottom(behavior);
    firstRenderRef.current = false;
  }, [messages.length, status?.note, busy, isThinking, loading, attachments.length]);

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.offsetHeight || 0;
      // Provide breathing room so the latest status/message stays above the composer
      setComposerPad(Math.max(120, h + 48));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    scrollToBottom('auto');
  }, [composerPad]);

  // Force scroll when session changes or when we explicitly request it
  useEffect(() => {
    forceScrollRef.current = true;
  }, [sessionId]);

  useEffect(() => {
    if (forceScrollRef.current || loading || busy || isThinking) {
      scrollToBottom(loading ? 'auto' : 'smooth');
      forceScrollRef.current = false;
      return;
    }
  }, [messages.length, loading, busy, isThinking, status?.note]);

  const rendered = useMemo(
    () => {
      const blocks: React.ReactNode[] = [];
      messages.forEach((m: any, idx: number) => {
        const key = m?.id ?? String(idx);
        blocks.push(
          <div key={key} className="w-full">
            <div className="w-full max-w-[1024px] px-4 md:px-6">
              <MessageBlock m={m} getMsgText={getMsgText} isBoomiDirect={isBoomiDirect} />
            </div>
          </div>
        );
        const next = messages[idx + 1];
        const shouldSeparate =
          next &&
          ((m?.role === 'user' && next?.role === 'assistant') ||
            (m?.role === 'assistant' && next?.role === 'user'));
        if (shouldSeparate) {
          blocks.push(<div key={`${key}-sep`} className="boomi-agent-thread-separator" />);
        }
      });
      return blocks;
    },
    [messages]
  );

  // ---- file helpers ----
  const extOf = (f: File) => {
    const name = (f.name || '').toLowerCase();
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.slice(idx) : '';
  };

  const isAllowed = (f: File) => {
    if (!allowedFileExtensions.length) return true; 
    const ext = extOf(f);
    return !!ext && allowedFileExtensions.includes(ext);
  };

  const acceptList = allowedFileExtensions.length ? allowedFileExtensions.join(',') : undefined;

  const acceptFiles = (files: FileList | File[]) => {
    const next: File[] = [];
    const current = [...attachments];
    const curTotal = current.reduce((a, b) => a + (b?.size || 0), 0);

    for (const f of Array.from(files)) {
      if (!isAllowed(f)) {
        continue;
      }
      if (current.length + next.length >= maxFiles) break;
      const projected = curTotal + next.reduce((a, b) => a + b.size, 0) + f.size;
      if (projected > maxTotalBytes) break;
      next.push(f);
    }

    if (next.length) setAttachments([...current, ...next]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((arr) => arr.filter((_, i) => i !== idx));
  };

  const autoSizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 720)}px`;
  };

  useEffect(() => {
    autoSizeTextarea();
  }, [draft]);

  // drag & drop on the composer container
  const onDragOver = (e: React.DragEvent) => {
    if (!fileAttachmentSupported) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!fileAttachmentSupported) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!fileAttachmentSupported) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) acceptFiles(e.dataTransfer.files);
  };

  const handleSubmit = async () => {
    if (!canSend) return;
    const text = draft.trim();
    if (!text && attachments.length === 0) return;
    forceScrollRef.current = true;
    scrollToBottom('smooth');

    // Prefer rich send if files are present and the handler exists
    if (attachments.length && typeof onSendRich === 'function') {
      await onSendRich({ text, files: attachments });
      setDraft('');
      setAttachments([]);
      return;
    }

    // fallback to plain send
    if (text) {
      await onSend(text);
      setDraft('');
    }
    // if files exist but onSendRich is not provided, we ignore them by design
    if (attachments.length) setAttachments([]);
  };

  const handlePromptClick = async (p: string) => {
    if (!canSend) return;
    forceScrollRef.current = true;
    scrollToBottom('smooth');
    // If you want prompts to attach current files too, use onSendRich when available.
    if (attachments.length && onSendRich) {
      await onSendRich({ text: p, files: attachments });
      setAttachments([]);
    } else {
      await onSend(p);
    }
  };

  return (
    <main className="boomi-agent-pane flex flex-col relative h-full min-h-0">
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {/* Messages */}
        <div
          ref={listRef}
          onScroll={onScroll}
          className="h-full overflow-auto boomi-scroll bg-[var(--boomi-agent-pane-bg)] text-[var(--boomi-agent-pane-fg)]"
          style={{ paddingBottom: composerPad }}
        >
        {!!error && (
          <div className="mx-auto w-full max-w-[1024px] px-4 md:px-6 pt-4">
            <ErrorBlock
              error={error}
              title="Chat error"
              compact
              defaultOpen={false}
            />
          </div>
        )}
        {loading ? (
          <div className="mt-6"><AjaxLoader message="Loading conversation…" /></div>
        ) : emptyState ? (
          <div className="h-full w-full flex items-center justify-center">
            <div className="text-center max-w-[720px] px-6 py-10">
              <div className="text-3xl font-extrabold mb-3" dangerouslySetInnerHTML={{ __html: title }} />
              <p className="opacity-70" dangerouslySetInnerHTML={{ __html: subtitle }} />
              {promptsLocation === 'welcome' && promptDefs.length > 0 && (
                <div className={`flex flex-wrap gap-2 mt-6 ${promptAlignClass}`}>
                  {promptDefs.map((p, i) => (
                    <button
                      key={`${p.title}-${i}`}
                      type="button"
                      disabled={!canSend}
                      onClick={() => void handlePromptClick(p.prompt)}
                      className={[
                        "group relative overflow-hidden",
                        "rounded-2xl px-3 py-2",
                        "border border-[var(--boomi-card-border)]",
                        "bg-[var(--boomi-card-bg)]/70 backdrop-blur-[1px]",
                        "hover:shadow hover:-translate-y-[1px] transition-all",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      ].join(' ')}
                      title={p.prompt}
                    >
                      <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-0 transition will-change-transform [background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent)]" />
                      <span className="text-sm font-medium">{p.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className="mx-auto w-full max-w-[1140px] py-6 space-y-4 px-4 md:px-8"
            style={{ paddingBottom: composerPad }}
          >
            {rendered}
            {(isThinking || (status?.note?.trim()?.length ?? 0) > 0) && (
              <StatusRowChip note={status?.note} />
            )}
            <div ref={endRef} />
          </div>
        )}
        </div>

        {/* Floating composer */}
        <div className="boomi-agent-composer pointer-events-none" aria-live="polite" ref={composerRef}>
          <form
            className={[
              "pointer-events-auto w-full relative z-10",
              fileAttachmentSupported && isDragging ? "outline outline-2 outline-[var(--boomi-accent,#6366f1)]" : ""
            ].join(" ")}
            onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div className="mx-auto max-w-[1024px] w-full px-4 md:px-6 py-3 space-y-2">

              {/* Attachments preview chips */}
              {fileAttachmentSupported && attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              {attachments.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm border
                             border-[var(--boomi-agent-compose-secondary-border,var(--boomi-card-border))] bg-[var(--boomi-agent-compose-secondary-bg,var(--boomi-card-bg))]"
                  title={`${f.name} • ${humanBytes(f.size)}`}
                >
                  <span className="truncate max-w-[260px]">{f.name}</span>
                  <span className="opacity-60 text-xs">{humanBytes(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-black/5"
                    aria-label={`Remove ${f.name}`}
                  >
                    <XIcon />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Input row */}
          <div className="flex items-end gap-2 rounded-2xl bg-[var(--boomi-agent-compose-bg,var(--boomi-card-bg))] border border-[var(--boomi-agent-compose-input-border,var(--boomi-card-border))] p-2 shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
            {/* Attach button (left) */}
            {fileAttachmentSupported && (
              <>
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={() => fileRef.current?.click()}
                  className="shrink-0 inline-flex items-center justify-center rounded-lg p-2 border border-[var(--boomi-agent-compose-secondary-border,var(--boomi-card-border))] bg-[var(--boomi-agent-compose-secondary-bg,var(--boomi-card-bg))] hover:bg-[color-mix(in_srgb,var(--boomi-agent-compose-secondary-bg,var(--boomi-card-bg)) 85%,var(--boomi-agent-compose-bg,var(--boomi-card-bg)))] disabled:opacity-50"
                  title={
                    allowedFileExtensions.length
                      ? `Attach file (${allowedFileExtensions.join(', ')})`
                      : 'Attach file'
                  }
                >
                  <PaperclipIcon />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={acceptList}
                  className="hidden"
                  onChange={(e) => {
                    const files = e.currentTarget.files;
                    if (files?.length) acceptFiles(files);
                    e.currentTarget.value = '';
                  }}
                />
              </>
            )}

            {/* Text area */}
            {allowFreeTextPrompt && (
              <div className="flex-1 min-w-0">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    autoSizeTextarea();
                  }}
                  rows={1}
                  placeholder={
                    fileAttachmentSupported
                      ? (fileAttachmentRequired && needsAttachment
                          ? `Attachment Required — drop a file here or click the paperclip (supported: ${acceptList})`
                          : `Message...`)
                      : "Message…"
                  }
                  className={[
                    "w-full resize-none bg-transparent focus:outline-none",
                    needsAttachment ? "placeholder-[var(--boomi-error-soft,var(--boomi-error-fg,#b91c1c))]/90" : ""
                  ].join(" ")}
                  aria-invalid={needsAttachment || undefined}
                  aria-describedby={needsAttachment ? "attachRequiredHint" : undefined}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (needsAttachment) return;
                      void handleSubmit();
                    }
                  }}
                />
              </div>
            )}

            {/* Send */}
            <button
              type="submit"
              disabled={!canSend || needsAttachment || (!draft.trim() && attachments.length === 0)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 bg-[var(--boomi-btn-primary-bg)] text-[var(--boomi-btn-primary-fg)] disabled:opacity-50 cursor-pointer"
            >
              Send
            </button>
          </div>

          {/* Prompts row */}
          {Array.isArray(promptDefs) && promptDefs.length > 0 && promptsLocation === 'input' && (
            <>
              <div className={`flex flex-wrap items-center ${promptAlignClass} gap-2 pt-1`}>
                {promptDefs.map((p, i) => (
                  <button
                    key={`${p.title}-${i}`}
                    type="button"
                    disabled={!canSend}
                    onClick={() => void handlePromptClick(p.prompt)}
                    className={[
                      "group relative overflow-hidden",
                      "rounded-2xl px-3 py-2",
                      "border border-[var(--boomi-card-border)]",
                      "bg-[var(--boomi-card-bg)]/70 backdrop-blur-[1px]",
                      "hover:shadow hover:-translate-y-[1px] transition-all",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    ].join(' ')}
                    title={p.prompt}
                  >
                    <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-0 transition will-change-transform [background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent)]" />
                    <span className="text-sm font-medium">{p.title}</span>
                  </button>
                ))}
              </div>
              {allowFreeTextPrompt && (
                <div className={`flex flex-wrap items-center ${promptAlignClass} gap-2 pt-1`}>
                  <div className="text-[11px] opacity-60">
                    Press Enter to send • Shift + Enter for new line
                  </div>
                </div>
              )}
            </>
          )}
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
