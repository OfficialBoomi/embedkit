/**
 * @file events.service.ts
 * @module events
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Standardized app-level event system. EmbedKit components emit typed events
 * (feedback was the first; SLTN-156 adds integration, map, schedule, AI
 * transformation and agent-session/message events) and the host application
 * subscribes to them and decides what to do with the data — nothing is ever
 * sent over the network by EmbedKit itself.
 *
 * Hosts can subscribe three ways; all receive the same event envelope:
 *
 * 1. `BoomiPlugin({ onEvent: (event) => { ... } })` — single callback at init.
 * 2. `BoomiEvents.on('feedback', handler)` — programmatic, returns unsubscribe.
 *    Use `'*'` to receive every event type.
 * 3. `window.addEventListener('boomi:event', (e) => e.detail)` — DOM
 *    CustomEvent, for CDN / plain-JS pages with no module access.
 *
 * Deliberate design constraints on every payload below (do not relax without
 * re-reviewing): payloads carry IDENTIFYING data (ids, names, counts) so a
 * host can build an audit trail — never raw connector credential values,
 * full extension/mapping blobs, or generated code. Environment/connection
 * extensions in particular may hold connector secrets (API keys, passwords,
 * OAuth tokens); events report THAT something changed and WHICH keys changed,
 * never the values.
 */

import logger from './logger.service';

/**
 * Known event types. Extend this union as new events are added. Namespaced
 * by area (`integration.*`, `connection.*`, `map.*`, `schedules.*`, `ai.*`,
 * `agent.*`) so future areas don't collide with each other or with `feedback`.
 */
export type EmbedKitEventType =
  | 'feedback'
  | 'integration.instance.created'
  | 'integration.instance.deleted'
  | 'integration.processes.run'
  | 'connection.extensions.updated'
  | 'connection.oauth.initiated'
  | 'map.defaults.seeded'
  | 'map.function.converted'
  | 'map.extensions.updated'
  | 'map.browse.executed'
  | 'schedules.updated'
  | 'ai.transformation.generated'
  | 'agent.session.created'
  | 'agent.session.deleted'
  | 'agent.message.sent'
  | 'agent.message.received';

/** The standardized envelope every EmbedKit event follows. */
export type EmbedKitEvent<T = unknown> = {
  /** Event type discriminator, e.g. 'feedback' */
  type: EmbedKitEventType;
  /** ISO-8601 timestamp of when the event was emitted */
  timestamp: string;
  /**
   * 'success' unless explicitly emitted as 'error'. Reserved for a future
   * failure-emission pass (tracked as an open question — not all mutation
   * events emit on failure yet); present now so the envelope shape is stable
   * once that lands.
   */
  outcome: 'success' | 'error';
  /** Where in the embed the event originated */
  source: {
    /** Agent-surface identifiers (chat, feedback, agent sessions/messages) */
    agentId?: string;
    sessionId?: string;
    messageId?: string;
    /** Integration-surface identifiers (iPacks, connections, maps, schedules) */
    integrationPackInstanceId?: string;
    integrationPackId?: string;
    environmentId?: string;
    /** Distinguishes multiple instances of the same component on one page */
    componentKey?: string;
  };
  /** Event-specific payload */
  data: T;
};

/** Payload for `type: 'feedback'` events. */
export type FeedbackEventData = {
  /** 'up' | 'down', or null when the user cleared their rating */
  rating: 'up' | 'down' | null;
  /** Present only when the user submitted a comment */
  comment?: string;
  /** Text of the user message that produced the response */
  prompt: string;
  /** The agent response being rated, as the user saw it */
  response: string;
};

/** Shared identity fields for an integration-pack instance. */
type IntegrationInstanceIdentity = {
  integrationPackInstanceId: string;
  integrationPackId?: string;
  integrationPackName?: string;
  environmentId?: string;
  /** 'SINGLE' | 'MULTI' */
  installationType?: string;
  isAgent?: boolean;
};

/** Payload for `integration.instance.created` and `.deleted`. */
export type IntegrationInstanceEventData = IntegrationInstanceIdentity;

/** Payload for `integration.processes.run`. */
export type IntegrationProcessesRunEventData = {
  integrationPackInstanceId: string;
  environmentId?: string;
  /** Execution record URLs returned by the run — not the process outputs themselves */
  recordUrls: string[];
};

/**
 * Payload for `connection.extensions.updated`. Reports WHICH extension field
 * keys changed, never their values — extension fields commonly carry
 * connector credentials.
 */
export type ConnectionExtensionsUpdatedEventData = {
  integrationPackInstanceId: string;
  environmentId?: string;
  installationType?: string;
  /** Field keys/paths that were changed */
  updatedFieldKeys: string[];
};

/** Payload for `connection.oauth.initiated` — the identity of the flow, not the authorize URL. */
export type ConnectionOAuthInitiatedEventData = {
  integrationPackInstanceId: string;
  environmentId?: string;
  connectionId: string;
  fieldId: string;
};

/**
 * Payload for `map.extensions.updated`. `action` discriminates the four
 * distinct user actions that reach the same update call — do not collapse
 * them into one shape without the discriminator.
 */
export type MapExtensionsUpdatedEventData = {
  integrationPackInstanceId: string;
  environmentId?: string;
  mapId: string;
  action: 'mapping' | 'function-change' | 'function-delete' | 'function-edit';
  /** Present when `action` touches a single named function */
  functionId?: string;
  functionName?: string;
  /** Count of mapping/function entries touched — not the mapping data itself */
  updatedCount?: number;
};

/** Payload for `map.browse.executed`. */
export type MapBrowseExecutedEventData = {
  integrationPackInstanceId: string;
  mapId: string;
  succeededCount: number;
  failedCount: number;
};

/** Payload for `schedules.updated`. */
export type SchedulesUpdatedEventData = {
  integrationPackInstanceId: string;
  environmentId?: string;
  scheduleCount: number;
};

/** Payload for `ai.transformation.generated`. */
export type AiTransformationGeneratedEventData = {
  integrationPackInstanceId?: string;
  functionId: string;
  /** The user's prompt that produced this transformation */
  prompt: string;
};

/** Payload for `agent.session.created` and `.deleted`. */
export type AgentSessionEventData = {
  /** 'system' = auto-provisioned on first open, with no user action involved */
  trigger: 'user' | 'system';
  integrationPackId?: string;
};

/** Payload for `agent.message.sent`. */
export type AgentMessageSentEventData = {
  text: string;
  hasAttachments: boolean;
  integrationPackId?: string;
};

/** Payload for `agent.message.received`. */
export type AgentMessageReceivedEventData = {
  /** The message's `type` field (text | image | file | event | json | error) */
  messageType: string;
  role: string;
};

export type EmbedKitEventHandler = (event: EmbedKitEvent) => void;

/** DOM CustomEvent name dispatched on window for every emitted event. */
export const BOOMI_EVENT_NAME = 'boomi:event';

const handlers = new Map<string, Set<EmbedKitEventHandler>>();
const changeListeners = new Set<() => void>();

const notifyChange = () => {
  changeListeners.forEach((listener) => {
    try { listener(); } catch { /* listener errors must not break subscription bookkeeping */ }
  });
};

/**
 * Public subscription API. Exported from the package root so host apps can:
 *
 * ```ts
 * import { BoomiEvents } from '@boomi/embedkit';
 * const off = BoomiEvents.on('feedback', (event) => sendToMyBackend(event));
 * ```
 */
export const BoomiEvents = {
  /** Subscribe to an event type (or '*' for all). Returns an unsubscribe function. */
  on(type: EmbedKitEventType | '*', handler: EmbedKitEventHandler): () => void {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type)!.add(handler);
    notifyChange();
    return () => BoomiEvents.off(type, handler);
  },

  /** Remove a previously registered handler. */
  off(type: EmbedKitEventType | '*', handler: EmbedKitEventHandler): void {
    const set = handlers.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) handlers.delete(type);
    notifyChange();
  },

  /** True when at least one programmatic subscriber can receive this type. */
  hasSubscribers(type: EmbedKitEventType): boolean {
    return (handlers.get(type)?.size ?? 0) > 0 || (handlers.get('*')?.size ?? 0) > 0;
  },

  /**
   * Watch for subscriber changes (used internally with useSyncExternalStore
   * so UI that depends on subscriber presence re-renders on subscribe).
   */
  subscribeChanges(listener: () => void): () => void {
    changeListeners.add(listener);
    return () => { changeListeners.delete(listener); };
  },
};

/**
 * Emit an event to every subscriber. Called by EmbedKit components — handlers
 * are isolated so one throwing subscriber never breaks the UI or the others.
 *
 * `outcome` defaults to 'success'; pass 'error' explicitly for a failed
 * mutation once a call site is ready to report failures too.
 */
export function emitEmbedKitEvent<T>(
  type: EmbedKitEventType,
  source: EmbedKitEvent<T>['source'],
  data: T,
  outcome: 'success' | 'error' = 'success'
): EmbedKitEvent<T> {
  const event: EmbedKitEvent<T> = {
    type,
    timestamp: new Date().toISOString(),
    outcome,
    source,
    data,
  };

  const targets = [
    ...(handlers.get(type) ?? []),
    ...(handlers.get('*') ?? []),
  ];
  for (const handler of targets) {
    try {
      handler(event as EmbedKitEvent);
    } catch (err) {
      logger.error({ err }, `[events] '${type}' subscriber threw`);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(BOOMI_EVENT_NAME, { detail: event }));
    } catch (err) {
      logger.error({ err }, `[events] '${type}' DOM dispatch failed`);
    }
  }

  return event;
}
