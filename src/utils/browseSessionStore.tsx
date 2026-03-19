/**
 * @file browseSessionStore.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Lightweight, in-memory TTL store for temporary "browse" sessions used by
 * Environment Map Extension updates. Entries are kept for 28 minutes and
 * automatically pruned every minute. Designed to live for the SPA lifetime
 * (cleared on page reload).
 */
import {
  BrowseSession,
  EnvironmentMapExtensionCandidate
} from '@boomi/embedkit-sdk';
import logger from '../logger.service';

/**
 * @constant TTL_MS
 * @description Default time-to-live for a session entry (28 minutes).
 */
export const TTL_MS = 28 * 60 * 1000; // 28 minutes

/**
 * @constant store
 * @description Internal in-memory Map backing the session cache.
 */
const store = new Map<string, BrowseSession>();

/**
 * @internal
 * @constant cleanupStarted
 * @description Guard to ensure we only start one cleanup interval.
 */
let cleanupStarted = false;

/**
 * @internal
 * @constant cleanupTimer
 * @description Timer for the cleanup. 
 */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * @function startCleanup
 * @description
 * Starts a single global interval that prunes expired entries every minute.
 * No-op if already started.
 *
 * @returns {void}
 */
function startCleanup(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store.entries()) {
      if (v.expiresAt && v.expiresAt <= now) store.delete(k);
    }
  }, 60 * 1000);
}

/**
 * @function makeKey
 * @description Creates the composite key used by the store.
 *
 * @param {string} containerId - Atom/Container/Runtime ID.
 * @param {string} connectionId - Connection ID.
 * @param {string} paramName - Parameter name.
 * @returns {string} Composite key string.
 *
 * @example
 * const key = makeKey("atom-123", "conn-456", "CustomerId");
 */
function makeKey(containerId: string, connectionId: string, paramName: string): string {
  return `${containerId}|${connectionId}|${paramName}`;
}

/**
 * @namespace BrowseSessionStore
 * @description
 * Public API for managing browse session entries with TTL semantics.
 */
export const BrowseSessionStore = {
  /**
   * @function upsert
   * @memberof BrowseSessionStore
   *
   * @description
   * Creates or updates a browse session entry. When updating an existing entry,
   * the `inputValue` is preserved unless explicitly provided. TTL is refreshed
   * on each upsert (unless a custom `ttlMs` is provided).
   *
   * @param {Object} opts - Upsert options.
   * @param {string} opts.containerId - Atom/Container/Runtime ID.
   * @param {string} opts.connectionId - Connection ID.
   * @param {string} opts.connectionName - Connection Name.
   * @param {string} opts.paramName - Parameter name to bind.
   * @param {string} opts.sessionId - Session ID returned by browse.

   * @param {number} [opts.ttlMs=TTL_MS] - Optional custom TTL in ms.
   *
   * @returns {BrowseSession} The stored session.
   *
   * @example
   * BrowseSessionStore.upsert({
   *   containerId: "atom-123",
   *   connectionId: "conn-456",
   *   paramName: "CustomerId",
   *   sessionId: "abc123",
   * });
   */
  upsert(opts: {
    containerId: string;
    connectionId: string;
    connectionName: string;
    paramName: string;
    sessionId?: string;
    ttlMs?: number;
    mapId: string;
    processId: string;
    environmentId: string;
    candidateSource: string;
  }): BrowseSession {
    startCleanup();
    const {
      containerId,
      connectionId,
      connectionName,
      paramName,
      sessionId,
      ttlMs = TTL_MS,
      mapId,
      environmentId,
      processId,
      candidateSource } = opts;
    const key = makeKey(containerId, connectionId, paramName);
    const expiresAt = Date.now() + ttlMs;

    const existing = store.get(key);
    store.set(key, {
      key,
      containerId,
      connectionId,
      connectionName,
      paramName,
      sessionId,
      expiresAt,
      mapId,
      environmentId,
      processId,
      candidateSource
    });
    return store.get(key)!;
  },

  /**
   * @function setInputValue
   * @memberof BrowseSessionStore
   *
   * @description
   * Sets or replaces the `sessionId` for an existing entry without extending
   * the TTL. Returns the updated entry or `null` if no entry exists for the key.
   *
   * @param {string} containerId - Atom/Container/Runtime ID.
   * @param {string} connectionId - Connection ID.
   * @param {string} paramName - Parameter name.
   * @param {string} sessionId - New sessionId.
   *
   * @returns {BrowseSession|null} Updated entry or null if not found.
   *
   * @example
   * BrowseSessionStore.setInputValue("atom-123", "conn-456", "field-123", "CustomerId", "C-001");
   */
  setSessionId(
    containerId: string,
    connectionId: string,
    paramName: string,
    sessionid: string,
  ): BrowseSession | null {
    startCleanup();
    const key = makeKey(containerId, connectionId, paramName);
    const existing = store.get(key);
    if (!existing) return null;

    // Keep same expiry; do not extend lifetime on value change
    const updated = { ...existing, sessionId: sessionid };
    store.set(key, updated);
    return updated;
  },

  /**
   * @function get
   * @memberof BrowseSessionStore
   *
   * @description
   * Retrieves a non-expired entry by composite key. If the entry is expired,
   * it is removed and `null` is returned.
   *
   * @param {string} containerId - Atom/Container/Runtime ID.
   * @param {string} connectionId - Connection ID.
   * @param {string} paramName - Parameter name.
   *
   * @returns {BrowseSession|null} The entry or null if missing/expired.
   *
   * @example
   * const session = BrowseSessionStore.get("atom-123", "conn-456", "CustomerId");
   */
  get(
    containerId: string,
    connectionId: string,
    paramName: string
  ): BrowseSession | null {
    startCleanup();
    const key = makeKey(containerId, connectionId, paramName);
    const item = store.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return item;
  },

  /**
   * @function listValid
   * @memberof BrowseSessionStore
   *
   * @description
   * Returns a snapshot array of all non-expired entries at call time.
   *
   * @returns {BrowseSession[]} Array of valid, non-expired sessions.
   *
   * @example
   * const active = BrowseSessionStore.listValid();
   */
  listValid(): BrowseSession[] {
    startCleanup();
    const now = Date.now();
    return Array.from(store.values()).filter(
      (v): v is BrowseSession & { expiresAt: number } =>
        v.expiresAt != null && v.expiresAt > now
    );
  },

  /**
   * @function clearExpired
   * @memberof BrowseSessionStore
   *
   * @description
   * Immediately removes any expired entries. Usually not necessary to call
   * because a minute-based pruning interval runs in the background.
   *
   * @returns {void}
   *
   * @example
   * BrowseSessionStore.clearExpired();
   */
  clearExpired(): void {
    startCleanup();
    const now = Date.now();
    for (const [k, v] of store.entries()) {
      if (v.expiresAt && v.expiresAt <= now) store.delete(k);
    }
  },

  /**
   * @function destroy
   * @memberof BrowseSessionStore
   *
   * @description
   * Teardown for logout: clears all entries, stops the cleanup interval,
   * and resets internal flags so the store can be re-initialized on next login.
   */
  destroy(): void {
    store.clear();
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    cleanupStarted = false;
  },

  /**
   * @function listByConnection
   * @memberof BrowseSessionStore
   *
   * @description
   * Return all non-expired sessions for a given connection (optionally scoped to a container)
   *
   * @returns {BrowseSession[]} Array of valid, non-expired sessions.
   *
   * @example
   * BrowseSessionStore.listByConnection('conn-123', 'atom-123');
   */
  listByConnection(connectionId: string, containerId?: string): BrowseSession[] {
    startCleanup();
    const now = Date.now();
    const out: BrowseSession[] = [];
    for (const s of store.values()) {
      if (s.expiresAt && s.expiresAt <= now) continue;
      if (s.connectionId !== connectionId) continue;
      if (containerId && s.containerId !== containerId) continue;
      out.push(s);
    }
    return out;
  },

  /**
   * @function listByMap
   * @memberof BrowseSessionStore
   *
   * @description
   * Return all non-expired sessions for a given mapId
   *
   * @returns {BrowseSession[]} Array of valid, non-expired sessions.
   *
   * @example
   * BrowseSessionStore.listByConnection('conn-123', 'atom-123');
   */
  listByMap(mapId: string): BrowseSession[] {
    startCleanup();
    const now = Date.now();
    const out: BrowseSession[] = [];
    for (const s of store.values()) {
      if (s.expiresAt && s.expiresAt <= now) continue;
      if (s.mapId !== mapId) continue;
      out.push(s);
    }
    return out;
  },

  /**
   * @function hasForConnection
   * @memberof BrowseSessionStore
   *
   * @description
   * True if there is at least one non-expired candidate for this connection
   *
   * @returns {void}
   *
   * @example
   * BrowseSessionStore.hasForConnection('conn-123', 'atom-123');
   */
  hasForConnection(connectionId: string, containerId?: string): boolean {
    return this.listByConnection(connectionId, containerId).length > 0;
  },

  /**
   * @function paramNamesByConnection
   * @memberof BrowseSessionStore
   *
   * @description
   * Convenience: just the parameter names for this connection
   *
   * @returns {void}
   *
   * @example
   * BrowseSessionStore.paramNamesByConnection('conn-123', 'atom-123');
   */
  paramNamesByConnection(connectionId: string, containerId?: string): string[] {
    return this.listByConnection(connectionId, containerId).map(s => s.paramName);
  },

  /**
   * Return the freshest non-expired sessionId per side for a map.
   * If containerId is provided, restrict to that container.
   */
  getSessionIdsByMapId(
    mapId: string,
  ): { source?: string; target?: string; containerId?: string } {
    startCleanup();
    logger.debug('getSessionIdsByMapId searching by mapId:', mapId)
    const now = Date.now();
    let freshestSource: { id: string; exp: number; cid: string } | undefined;
    let freshestTarget: { id: string; exp: number; cid: string } | undefined;

    for (const s of store.values()) {
      logger.debug('getSessionIdsByMapId searching BrowseSessions:', s.mapId);
      if (!s?.sessionId) continue;
      if (!s?.mapId || s.mapId !== mapId) continue;
      const exp = s.expiresAt ?? 0;
      if (exp <= now) continue;

      if (s.candidateSource === 'source') {
        if (!freshestSource || exp > freshestSource.exp) {
          freshestSource = { id: s.sessionId, exp, cid: s.containerId };
        }
      } else if (s.candidateSource === 'target') {
        if (!freshestTarget || exp > freshestTarget.exp) {
          freshestTarget = { id: s.sessionId, exp, cid: s.containerId };
        }
      }
    }

    logger.debug('getSessionIdByMapId:', freshestSource?.id, freshestTarget?.id)
    return {
      source: freshestSource?.id,
      target: freshestTarget?.id,
    };
  },

  /**
   * Produce a **new** EnvironmentMapExtension with BrowseSettings patched
   * from sessions in the store (both SourceBrowse & DestinationBrowse).
   *
   * - Does not mutate the original object.
   * - Sets/keeps Map.BrowseSettings.containerId.
   * - Adds SourceBrowse / DestinationBrowse sessionId if available.
   */
  patchExtensionWithSessions<T extends { id?: string; mapId?: string; Map?: any }>(
    ext: T,
  ): T {
    const mapId = (ext as any).id;
    if (!mapId) return ext;

    const out: any = {
      ...ext,
      Map: {
        ...(ext as any).Map,
        BrowseSettings: {
          ...((ext as any).Map?.BrowseSettings ?? {}),
        },
      },
    };
    const { source, target } = this.getSessionIdsByMapId(mapId);
    if (source) {
      out.Map.BrowseSettings.SourceBrowse = {
        sessionId: source!,
      };
    }

    if (target) {
      out.Map.BrowseSettings.DestinationBrowse = {
        sessionId: target!,
      };
    }

    return out as T;
  },


  /**
   * Utility: given a list of map candidates, patch each map with any cached sessions
   * and prune candidates whose map already has a sessionId.
   *
   * - Pure (does not mutate the input array or items).
   * - Recomputes `requiresBrowseSession` per item based on remaining candidates.
   */
  attachSessionsAndPrune(
    items: ReadonlyArray<EnvironmentMapExtensionCandidate>
  ): EnvironmentMapExtensionCandidate[] {
    return items.map((item) => {
      const patchedMap = this.patchExtensionWithSessions(item.map);

      // does the patched map now have any session?
      const bs = patchedMap?.Map?.BrowseSettings;
      const hasSession =
        !!bs?.SourceBrowse?.sessionId || !!bs?.DestinationBrowse?.sessionId;

      let prunedCandidates = item.candidates ?? [];
      if (hasSession && prunedCandidates.length) {
        prunedCandidates = prunedCandidates.filter((c) => c.mapId !== patchedMap.id);
      }

      return {
        ...item,
        map: patchedMap,
        candidates: prunedCandidates,
        requiresBrowseSession: prunedCandidates.length > 0,
      };
    });
  },

  /**
   * Optional in-place variant if you *want* to mutate the provided array.
   * (Same logic as `attachSessionsAndPrune`, but mutates.)
   */
  attachSessionsAndPruneInPlace(
    items: EnvironmentMapExtensionCandidate[]
  ): void {
    for (const m of items) {
      const patched = this.patchExtensionWithSessions(m.map);
      m.map = patched;

      const bs = patched?.Map?.BrowseSettings;
      const hasSession =
        !!bs?.SourceBrowse?.sessionId || !!bs?.DestinationBrowse?.sessionId;

      if (hasSession && Array.isArray(m.candidates) && m.candidates.length) {
        m.candidates = m.candidates.filter((c) => c.mapId !== patched.id);
      }
      m.requiresBrowseSession = (m.candidates?.length ?? 0) > 0;
    }
  },
};
