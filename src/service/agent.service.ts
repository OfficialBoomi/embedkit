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

/* -------------------- Endpoints (single source of truth) -------------------- */

const endpoints = {
  listSessions: '/agents/chat/sessions',
  conversation: (sessionId: string) => `/agents/chat/sessions/${encodeURIComponent(sessionId)}`,
  sendMessage: '/agents/chat/send',
  sendMessageMulti: '/agents/chat/sendMultiPart',
  boomiAgentSession: '/boomi-agent/session',
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

  return {
    createSession,
    listSessions,
    getConversation,
    sendMessage,
    deleteSession,
    sendMultipart,
    sendBoomiAgentSession,
  };
}
