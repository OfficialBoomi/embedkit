import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthManager from '../../security/authManager';
import { DEFAULT_SESSION_MESSAGE } from '../../utils/sessionError';

type Call = { path: string; bearer: string | null };

/** Private members the tests need to reach. */
type Internals = {
  setToken: (tok: string | null) => void;
  refreshTimer: number | null;
  onLogout: () => void;
  bootstrap: (o: { serverBase: string; tenantId: string; nonce: string }) => Promise<void>;
  fetchWithJwt: (input: string, init?: RequestInit) => Promise<Response>;
  getToken: () => string | null;
  subscribeToken: (fn: (t: string | null) => void) => () => void;
};

const SESSION_ENDED = { code: 'MISSING_BEARER', message: DEFAULT_SESSION_MESSAGE };

const nowS = () => Math.floor(Date.now() / 1000);
const jwt = (exp: number) => {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'none' })}.${b64({ exp })}.sig`;
};

describe('AuthManager token handling', () => {
  let mgr: Internals;
  let calls: Call[];
  let valid: Set<string>;
  let cookieAlive: boolean;
  let exchangeDelayMs: number;
  let exchangePlan: Array<{ ok: boolean; delay: number }>;   // per-call overrides, first call first

  const serverFetch = async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace('/api/v1', '');
    const auth = new Headers(init.headers || {}).get('authorization');
    const bearer = auth ? auth.replace(/^Bearer /, '') : null;
    calls.push({ path, bearer });
    if (path === '/auth/refresh') {
      if (!cookieAlive) return new Response('{}', { status: 401 });
      const t = jwt(nowS() + 90);
      valid.add(t);
      return new Response(JSON.stringify({ accessToken: t }), { status: 200 });
    }
    if (path === '/auth/exchange') {
      const plan = exchangePlan.shift() ?? { ok: true, delay: exchangeDelayMs };
      await new Promise((r) => setTimeout(r, plan.delay));
      if (!plan.ok) return new Response('{}', { status: 401 });
      const t = jwt(nowS() + 90);
      valid.add(t);
      return new Response(JSON.stringify({ accessToken: t }), { status: 200 });
    }
    return bearer && valid.has(bearer)
      ? new Response('{}', { status: 200 })
      : new Response('Invalid or expired token', { status: 401 });
  };

  const seed = (exp: number) => {
    const t = jwt(exp);
    if (exp > nowS()) valid.add(t);   // the fake server rejects tokens that have already expired
    mgr.setToken(t);
    return t;
  };
  const listCalls = () => calls.filter((c) => c.path === '/list');
  const opts = { serverBase: '/api/v1', tenantId: 't', nonce: 'n' };

  beforeEach(() => {
    calls = [];
    valid = new Set();
    cookieAlive = false;
    exchangeDelayMs = 50;
    exchangePlan = [];
    vi.stubGlobal('fetch', vi.fn(serverFetch));
    (AuthManager as unknown as { _instance: AuthManager | null })._instance = null;
    mgr = AuthManager.get() as unknown as Internals;
  });

  afterEach(() => {
    if (mgr.refreshTimer) clearTimeout(mgr.refreshTimer);
    window.removeEventListener('boomi:logout', mgr.onLogout);
    vi.unstubAllGlobals();
  });

  it('waits for a login in progress instead of sending an expired token', async () => {
    seed(nowS() - 200);
    if (mgr.refreshTimer) clearTimeout(mgr.refreshTimer);
    calls = [];

    const boot = mgr.bootstrap(opts);
    const res = await mgr.fetchWithJwt('/api/v1/list', {});
    await boot;

    expect(res.status).toBe(200);
    expect(listCalls()).toHaveLength(1);
    expect(valid.has(listCalls()[0].bearer as string)).toBe(true);
  });

  it('refreshes once before sending when the token expired and the cookie is alive', async () => {
    cookieAlive = true;
    seed(nowS() - 200);
    if (mgr.refreshTimer) clearTimeout(mgr.refreshTimer);
    calls = [];

    const res = await mgr.fetchWithJwt('/api/v1/list', {});

    expect(res.status).toBe(200);
    expect(listCalls()).toHaveLength(1);
    expect(valid.has(listCalls()[0].bearer as string)).toBe(true);
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
  });

  it('behaves as before when the token expired, there is no cookie and no login in progress', async () => {
    const old = seed(nowS() - 200);
    if (mgr.refreshTimer) clearTimeout(mgr.refreshTimer);
    calls = [];

    const started = Date.now();
    const res = await mgr.fetchWithJwt('/api/v1/list', {});

    expect(res.status).toBe(401);                 // same error as today
    expect(listCalls()[0].bearer).toBe(old);      // the old token is still sent, as today
    expect(Date.now() - started).toBeLessThan(2000); // no wait for a login that is not coming
  });

  it('sends no extra calls for a healthy token', async () => {
    seed(nowS() + 80);
    calls = [];

    const res = await mgr.fetchWithJwt('/api/v1/list', {});

    expect(res.status).toBe(200);
    expect(calls.map((c) => c.path)).toEqual(['/list']);
  });

  it('clears the token and refresh timer on boomi:logout', async () => {
    seed(nowS() + 80);
    expect(mgr.refreshTimer).not.toBeNull();
    const seen: Array<string | null> = [];
    mgr.subscribeToken((t) => seen.push(t));

    window.dispatchEvent(new CustomEvent('boomi:logout'));

    expect(mgr.getToken()).toBeNull();
    expect(mgr.refreshTimer).toBeNull();
    expect(seen[seen.length - 1]).toBeNull();
    calls = [];
    await expect(mgr.fetchWithJwt('/api/v1/list', {})).rejects.toMatchObject(SESSION_ENDED);
    expect(calls).toHaveLength(0);
  });

  it('waits for the new login after a logout followed by a fresh bootstrap', async () => {
    seed(nowS() + 80);
    window.dispatchEvent(new CustomEvent('boomi:logout'));
    calls = [];

    const boot = mgr.bootstrap(opts);
    const res = await mgr.fetchWithJwt('/api/v1/list', {});
    await boot;

    expect(res.status).toBe(200);
    expect(valid.has(listCalls()[0].bearer as string)).toBe(true);
  });

  it('stops waiting at once when the only login in progress ends without a token', async () => {
    exchangePlan = [{ ok: false, delay: 20 }];
    calls = [];

    const started = Date.now();
    const boot = mgr.bootstrap(opts);
    await expect(mgr.fetchWithJwt('/api/v1/list', {})).rejects.toMatchObject(SESSION_ENDED);
    await boot;

    expect(Date.now() - started).toBeLessThan(2000);   // not the 10 s timeout
    expect(listCalls()).toHaveLength(0);
  });

  it('keeps waiting while another login is still running when one of them fails', async () => {
    exchangePlan = [{ ok: true, delay: 150 }, { ok: false, delay: 1 }];
    calls = [];

    const bootA = mgr.bootstrap(opts);
    const bootB = mgr.bootstrap(opts);
    const res = await mgr.fetchWithJwt('/api/v1/list', {});
    await Promise.all([bootA, bootB]);

    expect(res.status).toBe(200);
    expect(valid.has(listCalls()[0].bearer as string)).toBe(true);
  });

  it('releases callers that are waiting for a token when the host logs out', async () => {
    calls = [];

    const pending = mgr.fetchWithJwt('/api/v1/list', {});
    window.dispatchEvent(new CustomEvent('boomi:logout'));
    const started = Date.now();

    await expect(pending).rejects.toMatchObject(SESSION_ENDED);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
