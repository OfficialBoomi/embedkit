// =========================================================================
// index.example.js
// Copy to index.js (git-ignored) for local Vite dev.
// Drives the local harness: requests a nonce from embedkit-server,
// boots BoomiPlugin, and wires the side-nav actions.
// See docs at ../embedkit-server/docs/embedkit-local-harness.md
// =========================================================================

import uiConfig from './boomi.config';
import BoomiPlugin, { RenderComponent, DestroyPlugin } from './src/main';

const env = import.meta.env || {};

const tenantId   = env.VITE_API_ACCOUNT_ID || 'local-dev-user';
const serverBase = env.VITE_EMBEDKIT_SERVER_BASE || '/api/v1';

// Body sent to POST {serverBase}/auth/admin/login
const LOGIN_BODY = {
  url:              env.VITE_API_URL || 'https://api.boomi.com/partner/api/rest/v1',
  parentAccountId:  env.VITE_API_ACCOUNT_ID || 'local-dev-user',
  childAccountId:   env.VITE_API_AUTH_USER || '',
  accountGroup:     env.VITE_API_ACCOUNT_GROUP || '',
  apiUserName:      env.VITE_API_USERNAME || '',
  apiToken:         env.VITE_API_TOKEN || '',

  // Optional AI block. Set enableAi:false in boomi.config.js if you don't have a key.
  ai: {
    enabled: true,
    model: 'gpt-4o-2024-08-06',
    apiKey: env.VITE_OPENAI_API_KEY || '',
  },

  // Optional per-connection OAuth2 client credentials
  oauth2: { connections: {} },
};

async function requestNonce() {
  const base = (serverBase || '/api/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/auth/admin/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
    },
    body: JSON.stringify(LOGIN_BODY),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Nonce request failed: ${res.status} ${msg}`);
  }

  const data = await res.json().catch(() => ({}));
  if (data.alreadyAuthenticated) {
    console.info('[Harness] Already authenticated, reusing session.');
    return null;
  }
  const nonce = data.nonce;
  if (!nonce) throw new Error('Server did not return a nonce');
  return nonce;
}

export async function login() {
  try {
    const nonce = await requestNonce();
    BoomiPlugin({
      tenantId,
      serverBase,
      nonce,
      boomiConfig: uiConfig,
      // EmbedKit event subscription — feedback (and future event types)
      // arrive here as { type, timestamp, source, data }. Registering this
      // also makes the feedback bar appear under agent responses.
      // Alternative (zero-import): window.addEventListener('boomi:event', (e) => e.detail)
      onEvent: (event) => {
        console.info(`[Harness] EmbedKit event (${event.type}):`, event);
      },
    });
    console.info('[Harness] Plugin initialized.');
  } catch (err) {
    console.error('[Harness] Login/bootstrap failed:', err?.message || err);
  }
}

export function renderIntegrations() {
  RenderComponent({
    hostId: 'boomi-test',
    component: 'AdminLayout',
    props: {
      componentKey: 'integrationsPage',
      // Replace with one of your integration pack IDs:
      integrationPackId: 'your-integration-pack-id',
    },
  });
}

export function logout()  { DestroyPlugin({ clearAuth: true }); clearCtx(); }
export function destroy() { DestroyPlugin({ removeHost: true, clearTheme: true, clearAuth: true }); clearCtx(); }

// ---- side nav wiring ----
document.getElementById('login-link')?.addEventListener('click',   (e) => { e.preventDefault(); login(); });
document.getElementById('render-link')?.addEventListener('click',  (e) => { e.preventDefault(); renderIntegrations(); });
document.getElementById('logout-link')?.addEventListener('click',  (e) => { e.preventDefault(); logout(); });
document.getElementById('destroy-link')?.addEventListener('click', (e) => { e.preventDefault(); destroy(); });

// ---- context panel ----
function setCtx(detail) {
  const sel = (id) => document.getElementById(id);
  sel('ctx-parent') && (sel('ctx-parent').textContent = detail?.parentAccount || '—');
  sel('ctx-auth')   && (sel('ctx-auth').textContent   = detail?.authUser      || '—');
  sel('ctx-group')  && (sel('ctx-group').textContent  = detail?.accountGroup  || '—');
  const dot = sel('ctx-dot');
  if (dot) {
    const ok = Boolean(detail?.authenticated && detail?.isReady);
    dot.classList.toggle('ok', ok);
    dot.title = ok ? 'Connected' : 'Disconnected';
  }
  sel('ctx-theme-enabled')  && (sel('ctx-theme-enabled').textContent = detail?.theme?.enabled ? 'On' : 'Off');
  sel('ctx-theme-default')  && (sel('ctx-theme-default').textContent = detail?.theme?.defaultTheme || '—');
  sel('ctx-ai-enabled')     && (sel('ctx-ai-enabled').textContent    = detail?.ai?.enabled ? 'On' : 'Off');
  sel('ctx-ai-model')       && (sel('ctx-ai-model').textContent      = detail?.ai?.model || '—');
}
function clearCtx() {
  setCtx({ parentAccount:'', authUser:'', accountGroup:'', authenticated:false, isReady:false,
           theme:{enabled:false, defaultTheme:''}, ai:{enabled:false, model:''} });
}
window.addEventListener('boomi:context', (e) => setCtx(e.detail));
