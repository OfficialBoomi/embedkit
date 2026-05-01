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
  // Persist session list so sessions appear instantly on re-mount (close/reopen).
  // Scoped per agent so different agents don't share lists.
  const sessionsListKey = `boomi:sesslist:${integration.integrationPackId ?? integration.id ?? 'default'}`;
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
  // Initialize from localStorage cache so sessions appear instantly on re-mount.
  // sessLoading stays true so auto-create and other guards still wait for the
  // server response before acting.
  const [sessions, setSessions] = useState<SessionItem[]>(() => {
    try {
      const raw = localStorage.getItem(sessionsListKey);
      if (raw) {
        const parsed = JSON.parse(raw) as SessionItem[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  // Start as true so effects that guard on !sessionsLoading don't fire before
  // the first server load completes (avoids auto-create race on initial render).
  const [sessLoading, setSessLoading] = useState(true);
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
  // Tracks sessions that have been optimistically removed locally but may still
  // appear in stale server responses.
  const deletedSessionIdsRef = useRef<Set<string>>(new Set());

  // ===== sessions loader =====
  const reloadSessions = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastListAtRef.current < LIST_TTL_MS) return;
    if (listInflightRef.current) {
      // Non-forced: skip if already loading.
      // Forced: wait for the current request to finish, then run a fresh one so
      // we never miss a create/delete that happened while a request was in flight.
      if (!force) return;
      await listInflightRef.current;
    }

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
          // Include sessions without integrationPackId: they were created before
          // the pack was set (or stored with an empty value on the server).
          // Strict mismatch is the only reason to exclude.
          if (!item.integrationPackId) return true;
          return item.integrationPackId === integration.integrationPackId;
        });

        // Once the server confirms a session is gone, clear it from our deleted set.
        for (const sid of Array.from(deletedSessionIdsRef.current)) {
          if (!filtered.some(s => s.sessionId === sid)) deletedSessionIdsRef.current.delete(sid);
        }

        // Exclude any sessions we've already optimistically removed.
        const visible = filtered.filter(s => !deletedSessionIdsRef.current.has(s.sessionId));

        setSessions((prev) => {
          // Never drop a session the client already knows about unless it was
          // explicitly deleted. Server list races (just-created, stale read)
          // can cause sessions to be temporarily absent from the response.
          const visibleIds = new Set(visible.map((s) => s.sessionId));
          const preserved = prev.filter(
            (s) => !visibleIds.has(s.sessionId) && !deletedSessionIdsRef.current.has(s.sessionId)
          );
          // Merge server list with any client-only sessions not yet confirmed by server,
          // then sort by lastAt descending so order is stable across reloads.
          const list = [...visible, ...preserved].sort((a, b) => {
            const ta = new Date(a.lastAt).getTime() || 0;
            const tb = new Date(b.lastAt).getTime() || 0;
            return tb - ta;
          });
          if (sessionsShallowEqual(prev, list)) return prev;
          // Persist the confirmed list so sessions appear instantly on next mount.
          try { localStorage.setItem(sessionsListKey, JSON.stringify(list)); } catch {}
          return list;
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
      // Guard against stale responses: if the user switched sessions while this
      // fetch was in-flight, discard the result — don't overwrite the new
      // session's (blank) view with the previous session's messages.
      if (list.length > 0 && activeSessionIdRef.current === sid) {
        dispatch({ type: 'reset', list });
      }
    } catch (e) {
      logger.warn({ e }, 'fetchConversation failed');
      if (activeSessionIdRef.current === sid) setChatError(e);
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
        // Optimistically insert so the session appears in the sidebar immediately.
        // Must happen before reloadSessions so the active-session guard in
        // setSessions can preserve it when the server response arrives.
        setSessions(prev => {
          if (prev.some(s => s.sessionId === sid)) return prev;
          const now = new Date().toISOString();
          const next = [
            { sessionId: sid, integrationPackId: integration.integrationPackId, lastAt: now, createdAt: now, messageCount: 0 },
            ...prev,
          ];
          try { localStorage.setItem(sessionsListKey, JSON.stringify(next)); } catch {}
          return next;
        });
        // Set selection and update the ref directly so reloadSessions sees the
        // new active session even if React hasn't re-rendered yet.
        setUncontrolledSid(sid);
        activeSessionIdRef.current = sid;
        skipAutoSelectRef.current = false;
        void reloadSessions(true);
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

    // Optimistically remove from the sidebar immediately so the UI updates
    // without waiting for a server round-trip or reload.
    deletedSessionIdsRef.current.add(sid);
    setSessions(prev => {
      const next = prev.filter(s => s.sessionId !== sid);
      try { localStorage.setItem(sessionsListKey, JSON.stringify(next)); } catch {}
      return next;
    });

    if (!isControlled) {
      if (wasActive) {
        skipAutoSelectRef.current = true;
        // Update ref immediately so the active-session guard in reloadSessions
        // doesn't try to re-add this session before the next render.
        activeSessionIdRef.current = null;
      }
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
      // Fire-and-forget: optimistic removal already updated the UI.
      // This just keeps the list in sync with the server.
      void reloadSessions(true);
    }
  }, [isControlled, shouldPersist, storageKey, reloadSessions, activeSessionId, dispatch, setAgentStatus, setAgentNote]);

  const selectSession = useCallback((sid: string) => {
    if (isControlled) return; // parent owns selection
    skipAutoSelectRef.current = false;
    activeSessionIdRef.current = sid; // update ref immediately so stale fetches are discarded
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
    if (uncontrolledSid && sessions.some(s => s.sessionId === uncontrolledSid)) return;
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
