/**
 * @file useAgentReady.ts
 * @function useAgentReady
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Fetches a single IntegrationPackInstance
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useEnvironmentExtensionsService } from '../../service/environmentExtensions.service';
import { hasAllEnvExtValues } from '../environment-extensions/environmentExtensionsService';
import logger from '../../logger.service';

type ReadyState = {
  configured: boolean | null;
  loading: boolean;
  error: string | null;
};

type Opts = {
  /** Prevents hammering on rapid re-renders (ms). Default 0. */
  debounceMs?: number;
  /** Treat 429/503 as transient: keep last configured and set error. Default true. */
  transientOnRateLimit?: boolean;
  /** Skip fetching environment extensions and mark as configured. */
  disabled?: boolean;
};

export function useAgentReady(
  integrationPackInstanceId: string,
  environmentId: string,
  single: boolean,
  opts: Opts = {}
) {
  const {
    debounceMs = 0,
    transientOnRateLimit = true,
    disabled = false,
  } = opts;

  const { fetchEnvironmentExtensions } = useEnvironmentExtensionsService();

  // visible state
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  // lifecycle guards
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // single-flight + param keying
  const inflightRef = useRef<Promise<void> | null>(null);
  const lastKeyRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSafe = <T,>(setter: (v: T) => void, value: T) => {
    if (mountedRef.current) setter(value);
  };

  const fetchStatus = useCallback(async (force = false) => {
    if (disabled) {
      setSafe(setConfigured, true);
      setSafe(setLoading, false);
      setSafe(setErr, null);
      return;
    }
    const key = JSON.stringify({ integrationPackInstanceId, environmentId, single });

    // If same request already in-flight, coalesce
    if (!force && inflightRef.current && lastKeyRef.current === key) {
      return inflightRef.current;
    }
    lastKeyRef.current = key;

    // Optional debounce to avoid bursts from parent effects
    const exec = () => {
      const p = (async () => {
        setSafe(setLoading, true);
        setSafe(setErr, null);
        try {
          const resp = await fetchEnvironmentExtensions({
            integrationPackInstanceId,
            environmentId: environmentId || undefined,
            environmentIds: [],
            isSingleInstall: single,
          });

          const raw = resp?.result ?? (resp as any)?.result ?? [];
          const combined = resp?.combined ?? (resp as any)?.combined ?? [];

          if (!raw?.length) {
            // No extensions present → clearly not configured
            setSafe(setConfigured, false);
            return;
          }

          setSafe(setConfigured, hasAllEnvExtValues(combined));
        } catch (e: any) {
          const status = e?.status ?? e?.statusCode;
          const rateLimited = status === 429 || status === 503;

          // If transient, keep prior `configured` (don’t flip to false),
          // just surface the error message.
          if (transientOnRateLimit && rateLimited) {
            logger.warn({ status }, 'useAgentReady transient rate-limit');
          } else {
            // Hard failure → mark as not configured
            setSafe(setConfigured, false);
          }
          setSafe(setErr, e?.message ?? 'Failed to load agent status');
        } finally {
          setSafe(setLoading, false);
          inflightRef.current = null;
        }
      })();

      inflightRef.current = p;
      return p;
    };

    if (debounceMs > 0) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      return new Promise<void>((resolve) => {
        debounceTimerRef.current = setTimeout(() => {
          resolve(exec());
        }, debounceMs);
      });
    }

    return exec();
  }, [integrationPackInstanceId, environmentId, single, fetchEnvironmentExtensions, debounceMs, transientOnRateLimit, disabled]);

  useEffect(() => {
    if (!disabled) return;
    if (!mountedRef.current) return;
    setConfigured(true);
    setLoading(false);
    setErr(null);
  }, [disabled]);

  return { configured, loading, error: err, fetchStatus };
}
