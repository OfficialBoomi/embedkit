/**
 * @file useSseConversation.ts
 * @function useSseConversation
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Polls for new messages in an agent conversation session
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ChatMessage } from '../../types/agent-chat';
import { usePlugin } from '../../context/pluginContext';
import logger from '../../logger.service';

type StatusEvent = {
  event: 'status';
  state: 'working' | 'idle' | 'error' | 'progress';
  note?: string;
  previousMessageId?: string;
};

function safeJSON(s: string) { try { return JSON.parse(s); } catch { return null; } }

function getJwtExp(token?: string | null): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return typeof json?.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token?: string | null, skewSec = 10): boolean {
  const exp = getJwtExp(token);
  if (!exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec >= exp - skewSec;
}

function toStatusFromProgress(data: any): StatusEvent | null {
  const t = String(data?.type ?? '').toUpperCase();
  const note = typeof data?.content === 'string' ? data.content : undefined;

  if (t === 'THINKING' || t === 'GENERATING_TITLE' || t === 'ACTION') {
    return { event: 'status', state: 'working', note: note || (t === 'ACTION' ? 'Running action…' : 'Thinking…') };
  }
  if (t === 'ERROR') {
    return { event: 'status', state: 'error', note: note || 'Error' };
  }
  return { event: 'status', state: 'progress', note };
}

type Args = {
  sessionId: string;
  onMessage: (m: ChatMessage) => void;
  onStatus?: (s: StatusEvent) => void;
  onError?: (err: { message: string; raw?: unknown }) => void;
  onOpen?: () => void;
  enabled?: boolean;
};

export function useSseConversation({ sessionId, onMessage, onStatus, onError, onOpen, enabled = true }: Args) {
  const { serverBase, accessToken } = usePlugin();

  // stable latest handlers
  const onMessageRef = useRef(onMessage);
  const onStatusRef  = useRef(onStatus);
  const onErrorRef   = useRef(onError);
  const onOpenRef    = useRef(onOpen);
  useLayoutEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useLayoutEffect(() => { onStatusRef.current  = onStatus;  }, [onStatus]);
  useLayoutEffect(() => { onErrorRef.current   = onError;   }, [onError]);
  useLayoutEffect(() => { onOpenRef.current    = onOpen;    }, [onOpen]);

  // de-dupe for messages and status
  const seenRef = useRef<Set<string>>(new Set());
  const lastStatusSigRef = useRef<string>('');  
  const lastErrorSigRef = useRef<string>('');  

  // connection refs
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; attempt: number }>({
    timer: null,
    attempt: 0,
  });

  useEffect(() => {
    if (!enabled || !sessionId || !accessToken) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (retryRef.current.timer) {
        clearTimeout(retryRef.current.timer);
        retryRef.current.timer = null;
      }
      lastErrorSigRef.current = '';
      return;
    }
    if (isTokenExpired(accessToken)) {
      lastErrorSigRef.current = '';
      onErrorRef.current?.({ message: 'Session expired. Please refresh or re-authenticate.' });
      return;
    }

    // new session / creds should reset dedupe signature
    seenRef.current = new Set();
    lastStatusSigRef.current = '';
    lastErrorSigRef.current = '';

    const pushStatus = (s: StatusEvent) => {
      const sig = `${s.state}|${s.note ?? ''}`;
      if (sig === lastStatusSigRef.current) return;
      lastStatusSigRef.current = sig;
      onStatusRef.current?.(s);
    };

    const pushError = (message: string, raw?: unknown) => {
      const sig = message.trim();
      if (!sig || sig === lastErrorSigRef.current) return;
      lastErrorSigRef.current = sig;
      onErrorRef.current?.({ message: sig, raw });
    };

    const qs  = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : '';
    const url = `${serverBase}/agents/chat/sse/${encodeURIComponent(sessionId)}${qs}`;

    let stopped = false;

    const clearRetry = () => {
      if (retryRef.current.timer) {
        clearTimeout(retryRef.current.timer);
        retryRef.current.timer = null;
      }
    };

    const scheduleReconnect = (delayOverride?: number) => {
      if (stopped) return;
      if (isTokenExpired(accessToken)) {
        pushError('Session expired. Please refresh or re-authenticate.');
        return;
      }
      if (retryRef.current.timer) return;
      const attempt = delayOverride === 0 ? 0 : retryRef.current.attempt + 1;
      retryRef.current.attempt = attempt;
      const baseDelay = attempt === 0 ? 0 : Math.min(1000 * 2 ** (attempt - 1), 30_000);
      const delay = delayOverride ?? baseDelay;
      retryRef.current.timer = setTimeout(() => {
        retryRef.current.timer = null;
        if (!stopped) connect();
      }, delay);
    };

    const connect = () => {
      if (stopped) return;
      if (isTokenExpired(accessToken)) {
        pushError('Session expired. Please refresh or re-authenticate.');
        return;
      }

      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      clearRetry();

      const es = new EventSource(url);
      esRef.current = es;
      retryRef.current.attempt = 0;

      es.onopen = () => {
        logger.debug('SSE connected');
        retryRef.current.attempt = 0;
        lastErrorSigRef.current = '';
        onOpenRef.current?.();
      };
      es.addEventListener('hello', (e) => logger.debug('SSE hello', e));
      es.addEventListener('ping',  () => {});
      es.addEventListener('progress_notification', (evt: MessageEvent) => {
        const frame = safeJSON(evt.data);
        const s = toStatusFromProgress(frame);
        if (s) pushStatus(s);
      });
      es.addEventListener('start', () => {
        pushStatus({ event: 'status', state: 'working', note: 'Starting…' });
      });
      es.addEventListener('message', (evt: MessageEvent) => {
        try {
          if (evt.data === '[DONE]' || evt.data === 'null') {
            pushStatus({ event: 'status', state: 'idle' });
            return;
          }

          const frame = JSON.parse(evt.data);
          if (frame?.type === 'event' && frame?.content?.event === 'status') {
            pushStatus({
              event: 'status',
              state: frame.content.state === 'working' ? 'working'
                   : frame.content.state === 'error'   ? 'error'
                   : frame.content.state === 'progress'? 'progress'
                   : 'idle',
              note: frame.content.note,
              previousMessageId: frame.content.previousMessageId,
            });
            return;
          }

          if (!frame?.id) return;
          if (seenRef.current.has(frame.id)) return;
          seenRef.current.add(frame.id);
          onMessageRef.current(frame as ChatMessage);
        } catch {
          /* ignore bad frames */
        }
      });

      es.onerror = (err) => {
        logger.warn('SSE error (auto-retrying)', err);
        if (stopped) return;
        if (es.readyState === EventSource.CONNECTING) return; // browser retry in-flight
        es.close();
        esRef.current = null;
        pushError('Realtime connection lost. Retrying…', err);
        scheduleReconnect();
      };
    };

    connect();

    const hasWindow = typeof window !== 'undefined';
    const hasDocument = typeof document !== 'undefined';
    const handleOnline = () => {
      retryRef.current.attempt = 0;
      scheduleReconnect(0);
    };
    const handleVisibility = () => {
      if (!hasDocument || document.visibilityState !== 'visible') return;
      retryRef.current.attempt = 0;
      scheduleReconnect(0);
    };
    if (hasWindow) window.addEventListener('online', handleOnline);
    if (hasDocument) document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopped = true;
      if (hasWindow) window.removeEventListener('online', handleOnline);
      if (hasDocument) document.removeEventListener('visibilitychange', handleVisibility);
      clearRetry();
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [enabled, sessionId, serverBase, accessToken]);
}
