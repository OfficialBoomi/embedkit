import { useHttp } from './http';
import logger from '../logger.service';
import type {
  ChatMessage,
  ConversationResponse,
  SendMessageRequest,
  SendMessageResponse,
  MessageMetadata,
} from '../types/agent-chat';
import type { ChatStatus } from '@boomi/embedkit-sdk';
import { get } from 'http';

/* -------------------- Types (client-side args) -------------------- */

export type ListSessionsArgs = {
  limit?: number;
  cursor?: number;
  signal?: AbortSignal;
};

export type SessionSummary = {
  sessionId: string;
  integrationPackId?: string;
  lastAt: string;
  lastRole?: 'user' | 'agent' | 'system';
  lastPreview?: string;
  messageCount?: number;
  metadata?: Record<string, unknown>;
};

export type ListSessionsResponse = {
  items: SessionSummary[];
  nextCursor?: number;
};

export type GetConversationArgs = {
  sessionId: string;
  offset?: number;
  limit?: number;
  signal?: AbortSignal;
};

export type AppendAgentMessageArgs = {
  sessionId: string;
  type: ChatMessage['type'];
  content: ChatMessage['content'];
  metadata?: MessageMetadata;
  signal?: AbortSignal;
};

export type CreateSessionArgs = {
  integrationPackId?: string;
  title?: string;
  sessionId?: string;
  signal?: AbortSignal;
};

export type CreateSessionResponse = {
  sessionId: string;
  created: boolean;
};

export type DeleteSessionArgs = {
  sessionId: string;
  signal?: AbortSignal;
};

export type SendMultipartArgs = {
  formData: FormData;
  signal?: AbortSignal;
};

export type SendBoomiAgentSessionArgs = {
  sessionId: string;
  agent_id: string;
  message: string;
  preview_mode?: boolean;
  session_id?: string;
  signal?: AbortSignal;
};

/**
 * Args for the Boomi Companion agent. Intentionally the same shape as
 * SendBoomiAgentSessionArgs so the two hosted transports are interchangeable at
 * the call site.
 */
export type SendCompanionSessionArgs = SendBoomiAgentSessionArgs;

/* -------------------- Endpoints (single source of truth) -------------------- */

const endpoints = {
  listSessions: '/agents/chat/sessions',
  conversation: (sessionId: string) => `/agents/chat/sessions/${encodeURIComponent(sessionId)}`,
  sendMessage: '/agents/chat/send',
  sendMessageMulti: '/agents/chat/sendMultiPart',
  boomiAgentSession: '/boomi-agent/session',
  companionSession: '/companion/session',
  companionDeleteSession: (sessionId: string) =>
    `/companion/sessions/${encodeURIComponent(sessionId)}`,
  companionStop: (sessionId: string) =>
    `/companion/sessions/${encodeURIComponent(sessionId)}/stop`,
  appendAgent: (sessionId: string) => `/agents/chat/sessions/${encodeURIComponent(sessionId)}/agent-reply`,
  createSession: '/agents/chat/sessions',
  deleteSession: (sessionId: string) => `/agents/chat/sessions/${encodeURIComponent(sessionId)}`,
};

/* -------------------- Service Hook -------------------- */

export function useAgentService() {
  const http = useHttp();

  /** create a new session */
  async function createSession(args: CreateSessionArgs): Promise<CreateSessionResponse> {
    const { signal, ...body } = args;
    logger.debug('Creating/upserting chat session', body);
    return http.post(endpoints.createSession, body, { signal });
  }

  /** List chat sessions (most recent first) */
  async function listSessions(args: ListSessionsArgs = {}): Promise<ListSessionsResponse> {
    const { limit, cursor, signal } = args;
    logger.debug('Listing agent chat sessions', args);

    return http.get(endpoints.listSessions, {
      signal,
      params: {
        ...(typeof limit === 'number' ? { limit } : {}),
        ...(typeof cursor === 'number' ? { cursor } : {}),
      },
    });
  }

  /** Fetch a single conversation thread */
  async function getConversation(args: GetConversationArgs): Promise<ConversationResponse> {
    const { sessionId, offset, limit, signal } = args;
    logger.debug('Fetching agent conversation', { sessionId, offset, limit });

    return http.get(endpoints.conversation(sessionId), {
      signal,
      params: {
        ...(typeof offset === 'number' ? { offset } : {}),
        ...(typeof limit === 'number' ? { limit } : {}),
      },
    });
  }

  /** Send a message from the client (usually role 'user' | 'system') */
  async function sendMessage(req: SendMessageRequest & { signal?: AbortSignal }): Promise<SendMessageResponse> {
    const { signal, ...body } = req;
    logger.debug('Sending agent message via service', { integrationPackId: body.integrationPackId, sessionId: body.sessionId, type: body.message?.type });
    return http.post(endpoints.sendMessage, body, { signal });
  }

  /** Delete a chat session */
  async function deleteSession(args: DeleteSessionArgs): Promise<{ ok: true }> {
    const { sessionId, signal } = args;
    logger.debug('Deleting chat session', { sessionId });
    await http.del(endpoints.deleteSession(sessionId), { signal });
    return { ok: true };
  }

  /** Send a message with optional file attachments (multipart/form-data) */
  async function sendMultipart(args: SendMultipartArgs): Promise<SendMessageResponse> {
    const { formData, signal } = args;
    return http.post(endpoints.sendMessageMulti, formData, { signal });
  }

  /** Send a message to Boomi direct session endpoint */
  async function sendBoomiAgentSession(args: SendBoomiAgentSessionArgs): Promise<SendMessageResponse> {
    const { signal, ...body } = args;
    return http.post(endpoints.boomiAgentSession, body, { signal });
  }

  /**
   * Send a message to the Boomi Companion agent (Claude Agent SDK loop in
   * embedkit-server). Returns as soon as the turn is queued; the reply streams
   * in over the session's SSE channel.
   */
  async function sendCompanionSession(args: SendCompanionSessionArgs): Promise<SendMessageResponse> {
    const { signal, ...body } = args;
    logger.debug('Sending Companion agent message', { sessionId: body.sessionId, agent_id: body.agent_id });
    return http.post(endpoints.companionSession, body, { signal });
  }

  /**
   * Halt the Companion turn currently running for a session.
   *
   * `stopped: false` means nothing was running — the turn had already finished
   * by the time the request landed, which is a normal race, not an error.
   */
  async function stopCompanionSession(
    args: DeleteSessionArgs
  ): Promise<{ stopped: boolean; wasRunning: boolean }> {
    const { sessionId, signal } = args;
    logger.debug('Stopping Companion turn', { sessionId });
    return http.post(endpoints.companionStop(sessionId), undefined, { signal });
  }

  /**
   * Delete a Companion chat session. Routed separately from deleteSession so the
   * server can also discard the session's agent workspace, which holds a
   * generated credential file.
   */
  async function deleteCompanionSession(args: DeleteSessionArgs): Promise<{ ok: true }> {
    const { sessionId, signal } = args;
    logger.debug('Deleting Companion chat session', { sessionId });
    await http.del(endpoints.companionDeleteSession(sessionId), { signal });
    return { ok: true };
  }

  return {
    createSession,
    listSessions,
    getConversation,
    sendMessage,
    deleteSession,
    sendMultipart,
    sendBoomiAgentSession,
    sendCompanionSession,
    deleteCompanionSession,
    stopCompanionSession,
  };
}
