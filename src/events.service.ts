/**
 * @file events.service.ts
 * @module events
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Standardized app-level event system. EmbedKit components emit typed events
 * (feedback is the first) and the host application subscribes to them and
 * decides what to do with the data — nothing is ever sent over the network
 * by EmbedKit itself.
 *
 * Hosts can subscribe three ways; all receive the same event envelope:
 *
 * 1. `BoomiPlugin({ onEvent: (event) => { ... } })` — single callback at init.
 * 2. `BoomiEvents.on('feedback', handler)` — programmatic, returns unsubscribe.
 *    Use `'*'` to receive every event type.
 * 3. `window.addEventListener('boomi:event', (e) => e.detail)` — DOM
 *    CustomEvent, for CDN / plain-JS pages with no module access.
 */

import logger from './logger.service';

/** Known event types. Extend this union as new events are added. */
export type EmbedKitEventType = 'feedback';

/** The standardized envelope every EmbedKit event follows. */
export type EmbedKitEvent<T = unknown> = {
  /** Event type discriminator, e.g. 'feedback' */
  type: EmbedKitEventType;
  /** ISO-8601 timestamp of when the event was emitted */
  timestamp: string;
  /** Where in the embed the event originated */
  source: {
    agentId?: string;
    sessionId?: string;
    messageId?: string;
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
 */
export function emitEmbedKitEvent<T>(
  type: EmbedKitEventType,
  source: EmbedKitEvent<T>['source'],
  data: T
): EmbedKitEvent<T> {
  const event: EmbedKitEvent<T> = {
    type,
    timestamp: new Date().toISOString(),
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
