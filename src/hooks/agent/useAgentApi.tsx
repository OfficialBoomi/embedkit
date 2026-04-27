/**
 * @file useAgentApi.ts
 * @function useAgentApi
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Hooks for Agent API interactions
 */
/**
 * @file useAgentApi.ts
 * @function useAgentApi
 * @license BSD-2-Clause
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { useAgentService } from '../../service/agent.service';
import { usePlugin } from '../../context/pluginContext';
import type { ChatMessage } from '../../types/agent-chat';
import { useSseConversation } from './useSseConversation';
import logger from '../../logger.service';
import { extractErrorMessage } from '../../utils/ui-utils';

/** Helpers */
const toIso = (v?: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))) {
    const n = Number(v);
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  return undefined;
};

type SessionItem = {
  sessionId: string;
  integrationPackId?: string;
  lastAt: string;
  createdAt?: string;
  updatedAt?: string;
  lastRole?: 'user' | 'agent' | 'system';
  lastPreview?: string;
  messageCount?: number;
  metadata?: Record<string, unknown>;
};
type TextMsg = ChatMessage & { type: 'text'; content: { data?: unknown } };
type MessagesState = { byId: Record<string, ChatMessage>; order: string[] };
type MsgAction =
  | { type: 'reset'; list: ChatMessage[] }
  | { type: 'appendOptimistic'; msg: ChatMessage }
  | { type: 'mergeFromServer'; list: ChatMessage[] }
  | { type: 'reconcileUserEcho'; server: ChatMessage };
type AgentState = 'idle' | 'working' | 'progress' | 'error';

function isTextMessage(x: ChatMessage | undefined | null): x is TextMsg {
  return !!x && x.type === 'text';
}

function msgsReducer(state: MessagesState, action: MsgAction): MessagesState {
  switch (action.type) {
    case 'reset': {
      const byId: Record<string, ChatMessage> = {};
      const order: string[] = [];
      for (const m of action.list) {
        if (!byId[m.id]) order.push(m.id);
        byId[m.id] = m;
      }
      return { byId, order };
    }
    case 'appendOptimistic': {
      if (state.byId[action.msg.id]) return state;
      return {
        byId: { ...state.byId, [action.msg.id]: action.msg },
        order: [...state.order, action.msg.id],
      };
    }
    case 'mergeFromServer': {
      const byId = { ...state.byId };
      const order = [...state.order];
      for (const m of action.list) {
        if (!byId[m.id]) order.push(m.id);
        byId[m.id] = m;
      }
      return { byId, order };
    }
    case 'reconcileUserEcho': {
      const server = action.server;
      if (!server?.id || server.role !== 'user' || !isTextMessage(server)) return state;

      const serverText = getUserTextData(server);
      const order = [...state.order];
      const byId = { ...state.byId };

      for (let i = order.length - 1; i >= 0; i--) {
        const id = order[i];
        const m = byId[id];
        if (
          m &&
          m.sessionId === server.sessionId &&
          m.role === 'user' &&
          (m as any).status === 'pending' &&
          isTextMessage(m) &&
          getUserTextData(m) === serverText
        ) {
          delete byId[id];
          byId[server.id] = { ...server, status: 'sent' as any };
          order[i] = server.id;
          return { byId, order };
        }
      }

      if (!byId[server.id]) {
        byId[server.id] = server;
        order.push(server.id);
      }
      return { byId, order };
    }
    default:
      return state;
  }
}

function sessionsShallowEqual(a: SessionItem[], b: SessionItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (
      x.sessionId !== y.sessionId ||
      x.lastAt !== y.lastAt ||
      x.lastPreview !== y.lastPreview ||
      x.messageCount !== y.messageCount
    ) return false;
  }
  return true;
}

function getUserTextData(m: ChatMessage | undefined | null): string | undefined {
  if (!m || m.type !== 'text') return undefined;
  const d = (m.content as any)?.data;
  return typeof d === 'string' ? d : undefined;
}

function normalizeAgentError(err: any, fallback: string) {
  const message = extractErrorMessage(err) || fallback;
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  const code = err?.code ?? err?.response?.code ?? err?.response?.data?.code;
  const details = err?.details ?? err?.issues ?? err?.response?.data ?? err?.data;
  return {
    title: 'Agent error',
    message,
    status,
    code,
    details,
    source: 'embedkit-server',
    raw: err,
  };
}

export function useAgentApi(args: {
  integration: IntegrationPackInstance;
  /** optional controlled session id from parent (e.g., sidebar selection) */
  sessionId?: string;
  /** when a session is created while controlled, notify parent */
  onNewSessionId?: (sid: string) => void;
  /** only persist for modal agents; defaults to 'none' to avoid stomping selection */
  persistMode?: 'none' | 'modal';
  /** ensure a controlled session exists on mount before fetching history */
  ensureSession?: boolean;
  storageKey?: string; // optional custom key
}) {
  const {
    integration,
    sessionId: controlledSid,
    onNewSessionId,
    persistMode = 'none',
  } = args;

  const { boomiConfig } = usePlugin();
  const isControlled = controlledSid != null;
  const storageKey = useMemo(() => {
    const base = args.storageKey ?? `agent:sess:${integration.id ?? 'unknown'}`;
    return base;
  }, [args.storageKey, integration.id]);

  const shouldPersist = !isControlled && persistMode === 'modal';
  const agentCfg = integration.integrationPackId
    ? boomiConfig?.agents?.[integration.integrationPackId]
    : undefined;
  const boomiAgentId =
    (agentCfg as any)?.boomiAgentId ||
    (agentCfg as any)?.boomi_agent_id ||
    integration.integrationPackId ||
    '';
  const forceMultipart =
    !!(agentCfg?.sendMultipartData || (agentCfg as any)?.sendMultiPartOnly);
  const useBoomiDirect = agentCfg?.transport === 'boomi-direct';
  // ---- stable service refs
  const svc = useAgentService();
  const listRef   = useRef(svc.listSessions);
  const convoRef  = useRef(svc.getConversation);
  const createRef = useRef(svc.createSession);
  const sendRef   = useRef<(args: any) => Promise<any>>(svc.sendMessage as any);
  const delRef    = useRef(svc.deleteSession);
  useEffect(() => {
    listRef.current   = svc.listSessions;
    convoRef.current  = svc.getConversation;
    createRef.current = svc.createSession;
    sendRef.current   = (useBoomiDirect ? svc.sendBoomiAgentSession : svc.sendMessage) as any;
    delRef.current    = svc.deleteSession;
  }, [svc, useBoomiDirect]);

  // ---- sessions & selection
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessLoading, setSessLoading] = useState(false);
  const [sessErr, setSessErr] = useState<unknown>(null);

  // Uncontrolled local selection
  const [uncontrolledSid, setUncontrolledSid] = useState<string | null>(null);
  const skipAutoSelectRef = useRef(false);
  // Effective session used everywhere
  const activeSessionId = isControlled ? (controlledSid ?? null) : uncontrolledSid;
  // Stable ref so reloadSessions can check the active session without a dep
  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);

  // ---- conversation state
  const [fetchingConvo, setFetchingConvo] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<unknown>(null);
  const [messages, dispatch] = useReducer(msgsReducer, { byId: {}, order: [] });
  const orderedMessages = useMemo(
    () => messages.order.map((id) => messages.byId[id]).filter(Boolean),
    [messages]
  );

  // ---- status (typing/thinking)
  const [agentStatus, setAgentStatus] = useState<AgentState>('idle');
  const [agentNote, setAgentNote] = useState<string | undefined>(undefined);
  const sseErrorRef = useRef(false);
  const busy = sending || agentStatus === 'working';

  // ---- single-flight guards
  const createInflightRef = useRef(false);
  const convoInflightRef  = useRef<string | null>(null);
  const listInflightRef   = useRef<Promise<void> | null>(null);
  const lastListAtRef     = useRef<number>(0);
  const LIST_TTL_MS       = 1500;
  const ensuredSessionsRef = useRef<Set<string>>(new Set());

  // ===== sessions loader =====
  const reloadSessions = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastListAtRef.current < LIST_TTL_MS) return;
    if (listInflightRef.current) return;

    const p = (async () => {
      setSessLoading(true);
      setSessErr(null);
      try {
        const resp = await listRef.current({ limit: 50 });
        const adapted: SessionItem[] = (resp.items ?? []).map((r: any) => {
          const lastAt =
            toIso(r.lastActivity) ??
            toIso(r.updatedAt) ??
            toIso(r.lastActivityMs) ??
            toIso(r.createdAt) ??
            new Date().toISOString();
          return {
            sessionId: r.sessionId,
            integrationPackId: r.integrationPackId,
            lastAt,
            createdAt: toIso(r.createdAt),
            updatedAt: toIso(r.updatedAt),
            lastRole: r.lastRole ?? undefined,
            lastPreview: r.lastPreview ?? undefined,
            messageCount: r.messageCount ?? undefined,
            metadata: r.metadata ?? undefined,
          };
        });
        const filtered = adapted.filter((item) => {
          if (!integration.integrationPackId) return true;
          const byPack = item.integrationPackId && item.integrationPackId === integration.integrationPackId;
          return byPack;
        });
        // If the currently-active session was dropped by the server (e.g. its
        // integrationPackId hasn't propagated yet after the first message),
        // keep the previous entry rather than silently removing it from the
        // sidebar. This prevents the session from disappearing mid-conversation.
        setSessions((prev) => {
          const activeSid = activeSessionIdRef.current;
          const list =
            activeSid && !filtered.some((s) => s.sessionId === activeSid)
              ? [
                  ...(prev.find((s) => s.sessionId === activeSid)
                    ? [prev.find((s) => s.sessionId === activeSid)!]
                    : []),
                  ...filtered,
                ]
              : filtered;
          return sessionsShallowEqual(prev, list) ? prev : list;
        });
        lastListAtRef.current = Date.now();
      } catch (e) {
        setSessErr(e);
      } finally {
        setSessLoading(false);
        listInflightRef.current = null;
      }
    })();

    listInflightRef.current = p;
    return p;
  }, [integration.integrationPackId]);

  // ===== fetch one conversation =====
  const fetchConversationOnce = useCallback(async (sid: string) => {
    if (!sid) return;
    if (convoInflightRef.current === sid) return;
    convoInflightRef.current = sid;

    setFetchingConvo(true);
    setChatError(null);
    try {
      const convo = await convoRef.current({ sessionId: sid, limit: 200 });
      // IMPORTANT: do not include 'status' frames in history
      const list = (convo.messages ?? []).filter((m: any) => m?.type !== 'status') as ChatMessage[];
      // Only overwrite state when the server returned real history. If the
      // session is empty (new session), skip the reset — E3 already cleared
      // messages synchronously, and resetting here would wipe any optimistic
      // message the user dispatched while this fetch was in-flight.
      if (list.length > 0) {
        dispatch({ type: 'reset', list });
      }
    } catch (e) {
      logger.warn({ e }, 'fetchConversation failed');
      setChatError(e);
    } finally {
      setFetchingConvo(false);
      if (convoInflightRef.current === sid) convoInflightRef.current = null;
    }
  }, []);

  // ===== CRUD =====
  const createSession = useCallback(async (overrideSessionId?: string): Promise<string | null> => {
    if (createInflightRef.current) return null;
    createInflightRef.current = true;
    try {
      const desiredSessionId =
        overrideSessionId ??
        (isControlled ? (activeSessionId ?? undefined) : undefined);
      const created = await createRef.current({
        integrationPackId: integration.integrationPackId,
        ...(desiredSessionId ? { sessionId: desiredSessionId } : {}),
      });
      const sid = created.sessionId;

      if (isControlled) {
        onNewSessionId?.(sid);
      } else {
        if (shouldPersist) { try { localStorage.setItem(storageKey, sid); } catch {} }
        await reloadSessions(true);
        setUncontrolledSid(sid);
        skipAutoSelectRef.current = false;
      }
      return sid;
    } catch (e) {
      logger.warn({ e }, 'createSession failed');
      setChatError(e);
      return null;
    } finally {
      createInflightRef.current = false;
    }
  }, [
    integration.integrationPackId,
    isControlled,
    onNewSessionId,
    shouldPersist,
    storageKey,
    reloadSessions,
    activeSessionId,
  ]);

  const deleteSession = useCallback(async (sid: string) => {
    const wasActive = activeSessionId === sid;

    if (!isControlled) {
      if (wasActive) skipAutoSelectRef.current = true;
      setUncontrolledSid((cur) => (cur === sid ? null : cur));
      if (shouldPersist) {
        try {
          const persisted = localStorage.getItem(storageKey) || '';
          if (persisted === sid) localStorage.removeItem(storageKey);
        } catch {}
      }
    }

    if (wasActive) {
      dispatch({ type: 'reset', list: [] });
      setAgentStatus('idle');
      setAgentNote(undefined);
    }

    try {
      await delRef.current({ sessionId: sid });
    } finally {
      await reloadSessions(true);
    }
  }, [isControlled, shouldPersist, storageKey, reloadSessions, activeSessionId, dispatch, setAgentStatus, setAgentNote]);

  const selectSession = useCallback((sid: string) => {
    if (isControlled) return; // parent owns selection
    skipAutoSelectRef.current = false;
    setUncontrolledSid(sid);
    if (shouldPersist) { try { localStorage.setItem(storageKey, sid); } catch {} }
  }, [isControlled, shouldPersist, storageKey]);

  const sendMessageRich = useCallback(async (payload: { data: string; files?: File[] }) => {
    let sid = activeSessionId;
    if (!sid) sid = await createSession();
    if (!sid) return;

    const userText = payload.data?.trim() ?? '';

    // Optimistic bubble (only if there is text)
    if (userText) {
      const optimistic: ChatMessage = {
        id: crypto.randomUUID(),
        sessionId: sid,
        integrationPackId: integration.integrationPackId,
        agentCommand: 'sendMessage',
        role: 'user',
        type: 'text',
        status: 'pending',
        metadata: { timestamp: new Date().toISOString(), platform: 'client' },
        content: { data: userText },
      } as ChatMessage;
      dispatch({ type: 'appendOptimistic', msg: optimistic });
    }

    setSending(true);
    try {
      const hasFiles = (payload.files?.length ?? 0) > 0;

      if (hasFiles || forceMultipart) {
        if (useBoomiDirect) {
          logger.warn('Boomi direct transport does not support file attachments yet; sending text only.');
        }
        if (useBoomiDirect) {
          await sendRef.current({
            sessionId: sid,
            agent_id: boomiAgentId,
            message: userText,
            preview_mode: false,
          });
          return;
        }
        const fd = new FormData();
        fd.append('sessionId', sid);
        fd.append('integrationPackId', integration.integrationPackId ?? '');
        fd.append('agentCommand', 'sendMessage');

        // Pass the user message in canonical form (content.data)
        fd.append(
          'message',
          JSON.stringify({
            role: 'user',
            type: 'text',
            content: { data: userText },
          })
        );

        const files = payload.files ?? [];
        if (forceMultipart && files.length === 0) {
          const emptyFile = new File([''], 'empty.txt', { type: 'text/plain' });
          fd.append('files', emptyFile);
        }
        for (const f of files) {
          fd.append('files', f as any);
        }

        await svc.sendMultipart({ formData: fd });
      } else if (useBoomiDirect) {
        await sendRef.current({
          sessionId: sid,
          agent_id: boomiAgentId,
          message: userText,
          preview_mode: false,
        });
      } else {
        await sendRef.current({
          sessionId: sid,
          integrationPackId: integration.integrationPackId,
          agentCommand: 'sendMessage',
          message: { role: 'user', type: 'text', content: { data: userText } },
        });
      }
    } catch (e) {
      logger.error({ e }, 'sendMessageRich failed');
      const errorPayload = normalizeAgentError(e, 'Failed to send message');
      dispatch({
        type: 'mergeFromServer',
        list: [{
          id: crypto.randomUUID(),
          sessionId: sid,
          integrationPackId: integration.integrationPackId,
          agentCommand: 'agentError',
          role: 'agent',
          type: 'error',
          status: 'error',
          metadata: { timestamp: new Date().toISOString(), platform: 'client' },
          content: { data: errorPayload },
        } as ChatMessage],
      });
      setAgentStatus('error');
      setAgentNote(errorPayload.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [activeSessionId, integration.integrationPackId, createSession, svc, sendRef, dispatch, forceMultipart, useBoomiDirect]);

  const sendMessage = useCallback(async (data: string) => {
    if (forceMultipart) {
      await sendMessageRich({ data, files: [] });
      return;
    }
    let sid = activeSessionId;
    if (!sid) sid = await createSession();
    if (!sid) return;

    const userText = data ?? '';

    const optimistic: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: sid,
      integrationPackId: integration.integrationPackId,
      agentCommand: 'sendMessage',
      role: 'user',
      type: 'text',
      status: 'pending',
      metadata: { timestamp: new Date().toISOString(), platform: 'client' },
      content: { data: userText },
    } as ChatMessage;

    dispatch({ type: 'appendOptimistic', msg: optimistic });
    setSending(true);
    try {
      const resp = await sendRef.current(
        useBoomiDirect
          ? {
              sessionId: sid,
              agent_id: boomiAgentId,
              message: userText,
              preview_mode: false,
            }
            : {
                sessionId: sid,
                integrationPackId: integration.integrationPackId,
                agentCommand: 'sendMessage',
                message: { role: 'user', type: 'text', content: { data: userText } },
              }
        );

      if (resp?.message?.role === 'user' && isTextMessage(resp.message)) {
        dispatch({ type: 'reconcileUserEcho', server: resp.message });
      } else if (resp?.message) {
        dispatch({ type: 'mergeFromServer', list: [resp.message] });
      }
    } catch (e) {
      logger.error({ e }, 'sendMessage failed');
      const errorPayload = normalizeAgentError(e, 'Failed to send message');
      dispatch({
        type: 'mergeFromServer',
        list: [{
          id: crypto.randomUUID(),
          sessionId: sid,
          integrationPackId: integration.integrationPackId,
          agentCommand: 'agentError',
          role: 'agent',
          type: 'error',
          status: 'error',
          metadata: { timestamp: new Date().toISOString(), platform: 'client' },
          content: { data: errorPayload },
        } as ChatMessage],
      });
      setAgentStatus('error');
      setAgentNote(errorPayload.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [activeSessionId, integration.integrationPackId, createSession, sendMessageRich, forceMultipart, useBoomiDirect]);

  // ===== Effects =====

  // E1: initial sessions load
  useEffect(() => { void reloadSessions(true); }, [reloadSessions]);

  // E2: uncontrolled only — derive initial selection ONCE
  useEffect(() => {
    if (isControlled) return;
    if (skipAutoSelectRef.current) return;
    if (uncontrolledSid) return;
    if (shouldPersist) {
      try {
        const sid = localStorage.getItem(storageKey) || '';
        if (sid && sessions.some(s => s.sessionId === sid)) {
          skipAutoSelectRef.current = false;
          setUncontrolledSid(sid);
          return;
        }
      } catch {}
    }

    // else pick newest
    if (sessions.length > 0) {
      skipAutoSelectRef.current = false;
      setUncontrolledSid(sessions[0].sessionId);
      if (shouldPersist) { try { localStorage.setItem(storageKey, sessions[0].sessionId); } catch {} }
    }
  }, [isControlled, shouldPersist, storageKey, sessions, uncontrolledSid]);

  // Keep a stable ref to createSession so E3 doesn't re-fire when createSession
  // gets a new reference (createSession depends on activeSessionId, which would
  // cause E3 to fire twice on every session change — second firing wipes messages
  // while the first fetch is still in-flight, leaving a blank conversation).
  const createSessionRef = useRef(createSession);
  useEffect(() => { createSessionRef.current = createSession; }, [createSession]);

  // E3: when effective session changes, reset and fetch
  useEffect(() => {
    dispatch({ type: 'reset', list: [] });
    setChatError(null);
    if (!activeSessionId) return;

    if (args.ensureSession) {
      if (!ensuredSessionsRef.current.has(activeSessionId)) {
        ensuredSessionsRef.current.add(activeSessionId);
        void (async () => {
          try {
            await createSessionRef.current(activeSessionId);
          } catch (e) {
            ensuredSessionsRef.current.delete(activeSessionId);
            logger.warn({ e }, 'ensureSession failed');
          } finally {
            void fetchConversationOnce(activeSessionId);
          }
        })();
        return;
      }
    }

    void fetchConversationOnce(activeSessionId);
  }, [activeSessionId, fetchConversationOnce, args.ensureSession]);

  // E4: SSE merge + status (no status in messages)
  const lastSidebarRefreshRef = useRef(0);

  const handleSseMessage = useCallback((m: any) => {
    if (m?.type === 'status') {
      const next = String(m.status || 'working') as 'idle' | 'working';
      const note = typeof m.note === 'string' ? m.note : undefined;
      setAgentStatus(next);
      setAgentNote(note);
      return;
    }

    if (m.role === 'user') {
      dispatch({ type: 'reconcileUserEcho', server: m });
    } else {
      dispatch({ type: 'mergeFromServer', list: [m] });
    }

    const now = Date.now();
    if (now - lastSidebarRefreshRef.current > 5000) {
      lastSidebarRefreshRef.current = now;
      void reloadSessions();
    }
  }, [dispatch, reloadSessions]);

  const handleSseStatus = useCallback((s: any) => {
    const note = s.note;
    let mapped: AgentState = s.state;

    if (note && /progress/i.test(note)) mapped = 'progress';
    if (note && /error|timeout|failed/i.test(note)) mapped = 'error';

    setAgentStatus(mapped);
    setAgentNote(note);
  }, []);

  useSseConversation({
    sessionId: activeSessionId || '',
    enabled: !!activeSessionId,
    onMessage: handleSseMessage,
    onStatus: handleSseStatus,
    onError: (err) => {
      sseErrorRef.current = true;
      setChatError(err);
      setAgentStatus('error');
      setAgentNote(err?.message || 'Realtime connection lost. Retrying…');
    },
    onOpen: () => {
      if (!sseErrorRef.current) return;
      sseErrorRef.current = false;
      setChatError(null);
      if (agentStatus === 'error') setAgentStatus('idle');
      if (agentNote && /realtime connection/i.test(agentNote)) setAgentNote(undefined);
    },
  });

  return {
    // sessions
    sessions,
    sessionsLoading: sessLoading,
    sessionsError: sessErr,

    // selection
    activeSessionId,    
    selectSession,           
    createSession,
    deleteSession,

    // conversation
    messages: orderedMessages,
    loading: fetchingConvo,
    busy,
    agentStatus,
    agentNote,
    sendMessage,
    sendMessageRich,
    chatError,

    // utils
    reloadSessions,
  };
}
