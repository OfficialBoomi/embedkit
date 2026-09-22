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

  // ---------------------------------------------------------------------
  // Boomi Companion agent (Claude Agent SDK loop in embedkit-server).
  // Swap the `ai` block above for this one to route an agent to the
  // Companion instead of OpenAI or Agent Studio, and give that agent
  // `transport: 'companion-sdk'` in boomi.config.js.
  //
  // The Anthropic token travels on this login POST exactly like every
  // other credential and is encrypted at rest with them. The Boomi
  // platform credentials above are reused for the Companion skills'
  // own .env — nothing extra to configure.
  // ---------------------------------------------------------------------
  // ai: {
  //   enabled: true,
  //   model: 'boomi-companion',            // or a concrete id: 'claude-opus-5'
  //   anthropicApiToken: env.VITE_ANTHROPIC_API_KEY || '',
  //   companion: {
  //     // Tenant-wide defaults.
  //     tools: 'readonly',                 // 'readonly' | 'full'  (default 'readonly')
  //     maxTurns: 60,
  //
  //     // Per-agent overrides, keyed by the agent id the client sends.
  //     // The tool surface is resolved here, server-side — never from the
  //     // browser — so only this block can grant an agent Bash/Write.
  //     byAgent: {
  //       'db8135be-182f-4971-8c60-9658fb565ee3': {
  //         // 'full' adds Bash/Write/Edit/Task so the Companion skills can run
  //         // their boomi-* scripts and push components. Every call is gated by
  //         // a deny-by-default policy on the server: one command per Bash call
  //         // (no chaining, substitution or redirection), only the skill scripts
  //         // plus read-only utilities, writes confined to the session
  //         // workspace, and the generated .env unreadable.
  //         //
  //         // That gate is policy, not a kernel boundary — an allowed script
  //         // runs with the server's privileges. Confine the process at the OS
  //         // level too (read-only rootfs, tmpfs workspace, egress limited to
  //         // the Boomi API, non-root) before exposing this beyond dev.
  //         tools: 'full',
  //         model: 'claude-opus-5',
  //         // Restrict which skills it may invoke (omit for all discovered):
  //         // skills: ['bc-integration:boomi-integration'],
  //         // Written into the workspace .env for the skill scripts:
  //         environmentId: env.VITE_API_ENVIRONMENT_ID || '',
  //         // testAtomId: '',
  //         // targetFolder: '',
  //         systemPromptAppend: 'Prefer reusing existing connections.',
  //
  //         // Sandbox relaxations. Every field WIDENS what the agent may do,
  //         // so leave unset unless a workflow specifically needs it.
  //         // sandbox: {
  //         //   extraAllowedCommands: ['mvn'],   // extra executables
  //         //   extraReadableRoots: ['/srv/shared-schemas'],
  //         //   allowNetworkCommands: false,     // true permits curl/wget directly
  //         //   allowEnvRead: false,             // true exposes the credential file
  //         // },
  //       },
  //     },
  //   },
  // },

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

/**
 * Renders the Boomi Companion agent (transport: 'companion-sdk') inside
 * #boomi-companion-host. Turns go to POST /v1/companion/session and replies
 * stream back on the usual SSE conversation channel. Requires
 * VITE_ANTHROPIC_API_KEY in .env and the 'boomi-companion' agent in boomi.config.js.
 */
export function renderCompanion() {
  RenderComponent({
    hostId: 'boomi-companion-host',
    component: 'Agent',
    props: {
      componentKey: 'boomi-companion',
      integrationPackId: 'boomi-companion',
    },
  });
}

export function logout()  { DestroyPlugin({ clearAuth: true }); clearCtx(); }
export function destroy() { DestroyPlugin({ removeHost: true, clearTheme: true, clearAuth: true }); clearCtx(); }

// ---- side nav wiring ----
document.getElementById('login-link')?.addEventListener('click',   (e) => { e.preventDefault(); login(); });
document.getElementById('render-link')?.addEventListener('click',  (e) => { e.preventDefault(); renderIntegrations(); });
document.getElementById('companion-link')?.addEventListener('click', (e) => { e.preventDefault(); renderCompanion(); });
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
