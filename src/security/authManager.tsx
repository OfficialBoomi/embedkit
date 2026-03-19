/**
 * @file authManager.tsx
 * @license BSD-2-Clause
 *
 * Provides a singleton AuthManager that handles JWT token management,
 * including storage, refresh, and subscription to token changes.
 */

type BootstrapOpts = {
  serverBase: string;   // e.g. "https://api.../api/v1"
  tenantId?: string;
  nonce?: string;       // host-provided nonce (optional if relying on RT cookie)
};

type TokenListener   = (tok: string | null) => void;

class AuthManager {
  private static _instance: AuthManager | null = null;
  static get(): AuthManager {
    return (this._instance ??= new AuthManager());
  }

  private serverBase = '/api/v1';
  private tenantId = '';
  private accessToken: string | null = null;

  /** 'idle' | 'refreshing' | 'exchanging' | 'ready' | 'blocked' */
  private phase: string = 'idle';

  private refreshTimer: number | null = null;
  private inflight: Promise<string | null> | null = null;
  private tokenSubs = new Set<TokenListener>();
  private customRefresher: (() => Promise<string | null>) | null = null;

  private waiters: Array<(v: string | null) => void> = [];
  private authRequiredWaiters: Array<() => void> = [];

  // ---------- Public API ----------

  bootstrap = async ({ serverBase, tenantId, nonce }: BootstrapOpts) => {
    this.serverBase = (serverBase || '/api/v1').replace(/\/$/, '');
    this.tenantId = tenantId?.trim() || '';

    // if host pre-set a token (e.g., server-side render hydration)
    const initial = (window as any).__BoomiAccessToken as string | undefined;
    if (initial) {
      this.setToken(initial);
      this.phase = 'ready';
      this.resolveWaiters(initial);
      return;
    }

    // 1) try refresh first (RT cookie path)
    const refreshed = await this.tryRefreshFirst();
    if (refreshed) {
      this.setToken(refreshed);
      this.phase = 'ready';
      this.resolveWaiters(refreshed);
      return;
    }

    // 2) then nonce exchange if provided
    if (nonce && this.tenantId) {
      const exchanged = await this.exchangeWithNonce(nonce);
      if (exchanged) {
        this.setToken(exchanged);
        this.phase = 'ready';
        this.resolveWaiters(exchanged);
        return;
      }
    }

    // 3) we’re blocked (no RT cookie, bad/expired nonce, or no nonce)
    this.phase = 'blocked';
    this.rejectWaiters();
    this.fireAuthRequired();
  };

  /** Ensures auth is ready (returns when token exists, or resolves immediately if blocked). */
  ensureReady = async () => {
    if (this.accessToken) return;
    if (this.phase === 'blocked') return;
    await this.waitForToken(10_000).catch(() => undefined);
  };

  waitForToken = (timeoutMs = 10_000): Promise<string> => {
    if (this.accessToken) return Promise.resolve(this.accessToken);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(fn => fn !== onToken);
        reject(new Error('AUTH_TIMEOUT'));
      }, timeoutMs);
      const onToken = (tok: string | null) => {
        if (tok) {
          clearTimeout(timer);
          this.waiters = this.waiters.filter(fn => fn !== onToken);
          resolve(tok);
        }
      };
      this.waiters.push(onToken);
    });
  };

  subscribeToken = (fn: TokenListener) => {
    this.tokenSubs.add(fn);
    fn(this.accessToken);
    return () => this.tokenSubs.delete(fn);
  };

  getToken = () => this.accessToken;

  setCustomRefresher = (fn: () => Promise<string | null>) => {
    this.customRefresher = fn;
  };

  /** Fetch with Authorization (one 401 retry) */
  fetchWithJwt = async (input: RequestInfo | URL, init: RequestInit = {}, allowAnonymous = false) => {
    if (!allowAnonymous) await this.ensureReady();

    const tried = await this.tryOnce(input, init, this.accessToken, allowAnonymous);
    if (tried.status !== 401 || allowAnonymous) return tried;

    // one retry after forced refresh
    const tok = await this.refreshAccessToken(true);
    if (!tok) return tried;
    return this.tryOnce(input, init, tok, allowAnonymous);
  };

  // ---------- Internals ----------

  private tryOnce = (input: RequestInfo | URL, init: RequestInit, tok: string | null, allowAnonymous: boolean) => {
    const headers = new Headers(init.headers || {});
    if (this.tenantId) headers.set('X-Tenant-Id', this.tenantId);
    if (tok) headers.set('Authorization', `Bearer ${tok}`);
    if (!tok && !allowAnonymous) throw new Error('MISSING_BEARER');
    return fetch(input, { ...init, headers, credentials: 'include' as const, cache: 'no-store' });
  };

  private async tryRefreshFirst(): Promise<string | null> {
    try {
      this.phase = 'refreshing';
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (this.tenantId) headers.set('X-Tenant-Id', this.tenantId);
      const r = await fetch(`${this.serverBase}/auth/refresh`, {
        method: 'POST', credentials: 'include', headers, cache: 'no-store'
      });
      if (!r.ok) return null;
      const j = await r.json().catch(() => ({}));
      const tok = typeof j?.accessToken === 'string' ? j.accessToken : null;
      return tok;
    } catch { return null; }
  }

  private async exchangeWithNonce(nonce: string): Promise<string | null> {
    try {
      this.phase = 'exchanging';
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (this.tenantId) headers.set('X-Tenant-Id', this.tenantId);
      const r = await fetch(`${this.serverBase}/auth/exchange`, {
        method: 'POST', credentials: 'include', headers, body: JSON.stringify({ nonce })
      });
      if (!r.ok) return null;
      const j = await r.json().catch(() => ({}));
      const tok = typeof j?.accessToken === 'string' ? j.accessToken : null;
      return tok;
    } catch { return null; }
  }

  private refreshAccessToken = async (force = false): Promise<string | null> => {
    if (!force && this.inflight) return this.inflight;

    const run = (async () => {
      try {
        this.phase = 'refreshing';
        const headers = new Headers({ 'Content-Type': 'application/json' });
        if (this.tenantId) headers.set('X-Tenant-Id', this.tenantId);
        const r = await fetch(`${this.serverBase}/auth/refresh`, {
          method: 'POST', credentials: 'include', headers, cache: 'no-store'
        });
        let tok: string | null = null;
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          tok = typeof j?.accessToken === 'string' ? j.accessToken : null;
        }
        if (!tok && this.customRefresher) {
          tok = await this.customRefresher().catch(() => null);
        }
        if (tok) this.setToken(tok);
        return tok;
      } finally {
        this.inflight = null;
        if (this.accessToken) this.phase = 'ready';
      }
    })();

    this.inflight = run;
    return run;
  };

  private setToken = (tok: string | null) => {
    this.accessToken = tok;
    if (tok) this.scheduleProactiveRefresh(tok);
    this.tokenSubs.forEach(fn => fn(tok));
    if (tok) this.resolveWaiters(tok);
  };

  private parseJwtExp(token?: string | null): number | null {
    if (!token) return null;
    try {
      const [, payload = ''] = token.split('.');
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '==='.slice((b64.length + 3) % 4);
      const json = JSON.parse(atob(padded));
      return typeof json?.exp === 'number' ? json.exp : null;
    } catch { return null; }
  }

  private scheduleProactiveRefresh(token: string) {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = null; }
    const exp = this.parseJwtExp(token);
    if (!exp) return;
    const now = Math.floor(Date.now() / 1000);
    const ms = Math.max(0, (exp - now - 60) * 1000);
    this.refreshTimer = window.setTimeout(() => { void this.refreshAccessToken(true); }, ms);
  }

  private resolveWaiters(tok: string) {
    const fns = this.waiters.slice();
    this.waiters.length = 0;
    fns.forEach(fn => fn(tok));
  }
  private rejectWaiters() {
    const fns = this.waiters.slice();
    this.waiters.length = 0;
    fns.forEach(fn => fn(null));
  }
  private fireAuthRequired() {
    const fns = this.authRequiredWaiters.slice();
    this.authRequiredWaiters.length = 0;
    fns.forEach(fn => fn());
    window.dispatchEvent(new CustomEvent('boomi:auth-required'));
  }
}

export default AuthManager;
