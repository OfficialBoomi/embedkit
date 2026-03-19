import { useMemo } from 'react';
import { usePlugin } from '../context/pluginContext';
import AuthManager from '../security/authManager';
import logger from '../logger.service';

const auth = AuthManager.get();

export type HttpOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | null | undefined>;
};

export type HttpClient = {
  get:  <T = unknown>(path: string, opts?: HttpOptions) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown, opts?: HttpOptions) => Promise<T>;
  put:  <T = unknown>(path: string, body?: unknown, opts?: HttpOptions) => Promise<T>;
  del:  <T = unknown>(path: string, opts?: HttpOptions) => Promise<T>;
};

export function useHttp(): HttpClient {
  const { serverApi } = usePlugin();

  async function readJsonOrThrow(res: Response) {
    const txt = await res.text().catch(() => '');
    if (!res.ok) {
      let msg = txt || `HTTP ${res.status}`;
      try {
        const data = JSON.parse(txt);
        if (typeof data?.error === 'string') {
          msg = data.error;
        }
        if (Array.isArray(data?.issues) && data.issues.length > 0) {
          const issueMsg = data.issues.map((i: any) => i.message).filter(Boolean).join('; ');
          if (issueMsg) msg = issueMsg;
        }
      } catch {} // not JSON — use raw text as-is
      throw new Error(msg);
    }
    try { return txt ? JSON.parse(txt) : null; }
    catch { throw new Error('Malformed JSON'); }
  }

  function buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | null | undefined>
  ) {
    const u = new URL(path, 'http://x');
    const merged = new URLSearchParams(u.search);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        merged.set(k, String(v));
      }
    }
    const q = merged.toString();
    const final = `${u.pathname}${q ? `?${q}` : ''}`;
    logger.debug(`[useHttp.buildUrl] ${path} +`, params, '→', final);
    return final;
  }

  async function ensureAuth() {
    await AuthManager.get().ensureReady();
  }

  return useMemo(
    () => ({
      get: async <T>(path: string, opts?: HttpOptions) => {
        await ensureAuth();
        return readJsonOrThrow(
          await serverApi.get(buildUrl(path, opts?.params), {
            signal: opts?.signal,
            headers: opts?.headers,
          })
        );
      },

      post: async <T>(path: string, body?: unknown, opts?: HttpOptions) => {
        await ensureAuth();
        return readJsonOrThrow(
          await serverApi.post(buildUrl(path, opts?.params), body, {
            signal: opts?.signal,
            headers: opts?.headers,
          })
        );
      },

      put: async <T>(path: string, body?: unknown, opts?: HttpOptions) => {
        await ensureAuth();
        return readJsonOrThrow(
          await serverApi.put(buildUrl(path, opts?.params), body, {
            signal: opts?.signal,
            headers: opts?.headers,
          })
        );
      },

      del: async <T>(path: string, opts?: HttpOptions) => {
        await ensureAuth();
        return readJsonOrThrow(
          await serverApi.del(buildUrl(path, opts?.params), {
            signal: opts?.signal,
            headers: opts?.headers,
          })
        );
      },
    }),
    [serverApi]
  );
}
