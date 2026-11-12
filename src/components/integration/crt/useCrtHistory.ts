/**
 * @file useCrtHistory.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Loads the history of the cross reference tables for the screen: who last saved in the environment,
 * and the last save of each table made through the plugin. The history is a nicety, so it must never
 * delay or break the screen: it loads only when asked to (`enabled`), every failure is swallowed (a
 * server without the route, a network error, a strange answer all give no history and no message),
 * and a request still running when the screen goes away, or when a newer one starts, is cancelled.
 *
 * `refresh` asks again without waiting for the answer. The screen calls it after a table is saved or
 * restored, so the lines follow the change. If that request fails the old lines are dropped rather
 * than left saying something that is no longer true.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useCrossReferenceTablesService,
  type CrossReferenceHistoryResponse,
} from '../../../service/crossReferenceTables.service';
import { readHistory } from '../../../utils/crt/crtHistory';

export interface UseCrtHistoryArgs {
  /** Load at all. False means no request is made and no history is returned. */
  enabled: boolean;
  /** The environment the history is about. Without one, nothing is loaded. */
  environmentId?: string;
  packInstanceId?: string;
}

export interface CrtHistoryApi {
  /** What was loaded for this environment, or null (not loaded yet, switched off, or it failed). */
  history: CrossReferenceHistoryResponse | null;
  /** Asks again. Fire and forget: it never throws and nothing waits for it. */
  refresh: () => void;
}

/** What a load was for, so an answer for another environment is never shown. */
interface Loaded {
  scope: string;
  data: CrossReferenceHistoryResponse;
}

export function useCrtHistory({ enabled, environmentId, packInstanceId }: UseCrtHistoryArgs): CrtHistoryApi {
  // The service hook hands back new functions on every render; the load must not depend on them.
  const service = useCrossReferenceTablesService();
  const scope = enabled && environmentId ? `${environmentId}|${packInstanceId ?? ''}` : null;
  const latest = useRef({ service, scope, environmentId, packInstanceId });
  useEffect(() => {
    latest.current = { service, scope, environmentId, packInstanceId };
  });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const running = useRef<AbortController | null>(null);

  const load = useCallback(async (): Promise<void> => {
    running.current?.abort();
    const { service: svc, scope: forScope, environmentId: env, packInstanceId: pack } = latest.current;
    if (!forScope || !env) return;
    const controller = new AbortController();
    running.current = controller;
    let data: CrossReferenceHistoryResponse | null = null;
    try {
      data = readHistory(
        await svc.fetchCrossReferenceHistory({
          environmentId: env,
          ...(pack ? { integrationPackInstanceId: pack } : {}),
          signal: controller.signal,
        })
      );
    } catch {
      // No history is not an error: an older server, a network failure or a refusal all end here.
    }
    if (controller.signal.aborted) return;
    setLoaded(data ? { scope: forScope, data } : null);
  }, []);

  // Runs after the screen has rendered the tables, and again when the environment changes.
  useEffect(() => {
    if (!scope) return;
    void load();
    return () => running.current?.abort();
  }, [scope, load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { history: scope && loaded?.scope === scope ? loaded.data : null, refresh };
}
