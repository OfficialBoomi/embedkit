/**
 * @file agent-chat.d.ts
 * @typedef AgentChat
 * @license Apache 2.0
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Client/Server shared types for agent chat messages following the
 * canonical content model: content = { title?, html?, data? }.
 */

export type MessageRole = 'user' | 'agent' | 'system';
export type MessageType = 'text' | 'image' | 'file' | 'event' | 'json' | 'error';
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'error';

/** ISO 8601 etc. */
export interface MessageMetadata {
  timestamp?: string;
  platform?: string;
  language?: string;
  agentVersion?: string;
  [key: string]: unknown;
}

/** Canonical content carried by every message. 
 * - `title` and `html` are for the human-friendly response header/body.
 * - `data` carries the actual payload for the message type (any JSON-serializable value).
 *   Examples:
 *     - type: 'text'  => data: string
 *     - type: 'json'  => data: object | array | string
 *     - type: 'image' => data: { url: string; alt?: string; width?: number; height?: number; size?: number; [k: string]: unknown }
 *     - type: 'file'  => data: { url: string; name: string; size?: number; mime?: string; [k: string]: unknown }
 *     - type: 'event' => data: { event: ChatEventName; [k: string]: unknown }
 *     - type: 'error' => data: { title?: string; message: string; source?: 'boomi-agent'|'embedkit-server'|'openai'|'unknown'; status?: number; code?: string; details?: Record<string, unknown>; raw?: unknown }
 */
export interface RichPayload {
  title?: string;
  html?: string;
  data?: unknown;
}

/** Common fields shared by all messages */
export interface BaseMessage {
  id: string;
  sessionId: string;
  /** Boomi integration/instance id (server guarantees presence; client may omit on send) */
  integrationPackId?: string;
  /** Server may also track agentCommand/prev ids in a different contract; keep the client surface minimal here */
  role: MessageRole;
  type: MessageType;
  status?: DeliveryStatus;
  metadata?: MessageMetadata;
  /** Canonical content */
  content: RichPayload;
}

/** Concrete message is just BaseMessage now (content is unified) */
export type ChatMessage = BaseMessage;

/** Conversation thread */
export interface ConversationResponse {
  sessionId: string;
  messages: ChatMessage[];
}

/** Event name space (client may send/receive custom) */
export type ChatEventName =
  | 'typing_start'
  | 'typing_stop'
  | 'agent_initialized'
  | 'agent_installed'
  | 'agent_configured'
  | 'info'
  | string;

/** Minimal payload for sending a new message client → server.
 * IMPORTANT: Put user text in content.data when type === 'text'.
 * The server renders title/html and uses data for the editor/inspector.
 */
export interface SendMessageRequest {
  sessionId: string;
  integrationPackId?: string;
  agentCommand: string;
  previousResponseId?: string;
  parentAccountId?: string;
  childAccountId?: string;

  message: {
    role: Exclude<MessageRole, 'agent'>; // 'user' | 'system'
    type: MessageType;
    content: RichPayload;                // e.g., { data: "hello" } for text
    metadata?: MessageMetadata;
  };
}

/** Server response after send; includes normalized/persisted message */
export interface SendMessageResponse {
  message: ChatMessage;
}

/** Optional typing indicator envelope (realtime/WS) */
export interface TypingIndicator {
  sessionId: string;
  componentKey: string;
  role: MessageRole;
  typing: boolean;
  context?: string;
}

/** Type guards (narrow by `type`) */
export declare function isTextMessage(m: ChatMessage): m is ChatMessage & { type: 'text' };
export declare function isImageMessage(m: ChatMessage): m is ChatMessage & { type: 'image' };
export declare function isFileMessage(m: ChatMessage): m is ChatMessage & { type: 'file' };
export declare function isEventMessage(m: ChatMessage): m is ChatMessage & { type: 'event' };
export declare function isJsonMessage(m: ChatMessage): m is ChatMessage & { type: 'json' };
export declare function isErrorMessage(m: ChatMessage): m is ChatMessage & { type: 'error' };
