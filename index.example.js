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

// ---- in-page console ----
// Mirrors console.* into the #inpage-console panel with a level filter and a
// Clear button, so plugin logs are visible without opening devtools.
(function setupInPageConsole() {
  const box = document.getElementById('inpage-console');
  if (!box) return;

  const MAX_LINES = 500;
  const LEVELS = { debug: 10, log: 15, info: 20, warn: 30, error: 40, off: 100 };
  const levelSelect = document.getElementById('log-level');
  let currentLevel = LEVELS[(levelSelect?.value || 'debug')] ?? LEVELS.debug;
  const history = [];

  const orig = {
    log:   console.log.bind(console),
    info:  console.info?.bind(console)  || console.log.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug?.bind(console) || console.log.bind(console),
  };

  const kindToLevel = (kind) => LEVELS[kind] ?? LEVELS.debug;

  const normalize = (args) => args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a, null, 2); } catch { return String(a); }
  }).join(' ');

  function render() {
    box.innerHTML = '';
    const filtered = history.filter(m => kindToLevel(m.kind) >= currentLevel);
    const toShow = filtered.slice(-MAX_LINES);
    for (const m of toShow) {
      const line = document.createElement('div');
      line.className = m.kind;
      line.textContent = m.text;
      box.appendChild(line);
    }
    box.scrollTop = box.scrollHeight;
  }

  function push(kind, args) {
    history.push({ kind, text: normalize(args) });
    if (history.length > 5000) history.splice(0, history.length - 5000);
    render();
  }

  ['log', 'info', 'warn', 'error', 'debug'].forEach(kind => {
    console[kind] = (...args) => {
      orig[kind](...args);
      push(kind, args);
    };
  });

  document.getElementById('clear-console')?.addEventListener('click', () => {
    history.length = 0;
    render();
  });

  levelSelect?.addEventListener('change', (e) => {
    const val = (e.target?.value || 'debug');
    currentLevel = LEVELS[val] ?? LEVELS.debug;
    render();
  });

  render();
})();

// ---- console panel resizer ----
// Drag the divider (or use arrow keys / double-click) to resize the console.
(function enableSplitResize() {
  const root      = document.documentElement;
  const workbench = document.querySelector('.workbench');
  const pluginEl  = document.querySelector('.plugin-host');
  const resizer   = document.querySelector('.workbench-resizer');
  const consoleEl = document.getElementById('inpage-console');
  const headerEl  = document.querySelector('.console-header');

  if (!workbench || !pluginEl || !resizer || !consoleEl) return;

  const STORAGE_KEY    = 'embedkit.console.height';
  const MIN_CONSOLE_H  = 32;   
  const MIN_PLUGIN_H   = 160;  
  let startY = 0;
  let startConsoleH = 0;

  const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '', 10);
  if (!Number.isNaN(saved)) {
    root.style.setProperty('--console-height', `${saved}px`);
  }

  function totalAvailable() {
    return workbench.getBoundingClientRect().height;
  }
  function partsHeights() {
    const resizerH = resizer.getBoundingClientRect().height
      + parseFloat(getComputedStyle(resizer).marginTop || 0)
      + parseFloat(getComputedStyle(resizer).marginBottom || 0);
    const headerH = headerEl?.getBoundingClientRect().height || 0;
    return { resizerH, headerH };
  }

  function clampConsoleHeight(nextPx) {
    const total = totalAvailable();
    const { resizerH, headerH } = partsHeights();
    const minForConsole = MIN_CONSOLE_H;
    const maxForConsole = Math.max(
      MIN_CONSOLE_H,
      total - resizerH - MIN_PLUGIN_H - headerH
    );
    return Math.min(Math.max(nextPx, minForConsole), maxForConsole);
  }

  function startDrag(clientY) {
    startY = clientY;
    startConsoleH = consoleEl.getBoundingClientRect().height;
    document.body.classList.add('resizing');
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   endDrag);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend',  endDrag);
  }

  function onMouseDown(e) { e.preventDefault(); startDrag(e.clientY); }
  function onTouchStart(e) { if (e.touches?.[0]) { e.preventDefault(); startDrag(e.touches[0].clientY); } }

  function onMouseMove(e) { e.preventDefault(); applyDelta(e.clientY - startY); }
  function onTouchMove(e) {
    if (!e.touches?.[0]) return;
    e.preventDefault();
    applyDelta(e.touches[0].clientY - startY);
  }

  function applyDelta(dy) {
    const next = clampConsoleHeight(startConsoleH - dy);
    root.style.setProperty('--console-height', `${next}px`);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function endDrag() {
    document.body.classList.remove('resizing');
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup',   endDrag);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend',  endDrag);
    const h = parseInt(getComputedStyle(consoleEl).height, 10);
    localStorage.setItem(STORAGE_KEY, String(h));
  }

  resizer.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 64 : 16;
    let delta = 0;
    if (e.key === 'ArrowUp') delta = -step;    
    else if (e.key === 'ArrowDown') delta = step;
    if (delta) {
      e.preventDefault();
      const now = parseInt(getComputedStyle(consoleEl).height, 10) || 220;
      const h = clampConsoleHeight(now - delta); 
      root.style.setProperty('--console-height', `${h}px`);
      localStorage.setItem(STORAGE_KEY, String(h));
    }
  });

  let lastSavedBeforeCollapse = saved || 220;
  resizer.addEventListener('dblclick', () => {
    const current = parseInt(getComputedStyle(consoleEl).height, 10) || 220;
    if (current > MIN_CONSOLE_H + 8) {
      lastSavedBeforeCollapse = current;
      root.style.setProperty('--console-height', `${MIN_CONSOLE_H}px`);
      localStorage.setItem(STORAGE_KEY, String(MIN_CONSOLE_H));
    } else {
      const restored = clampConsoleHeight(lastSavedBeforeCollapse);
      root.style.setProperty('--console-height', `${restored}px`);
      localStorage.setItem(STORAGE_KEY, String(restored));
    }
  });

  window.addEventListener('resize', () => {
    const current = parseInt(getComputedStyle(consoleEl).height, 10) || 220;
    const clamped = clampConsoleHeight(current);
    if (clamped !== current) {
      root.style.setProperty('--console-height', `${clamped}px`);
      localStorage.setItem(STORAGE_KEY, String(clamped));
    }
  });

  resizer.addEventListener('mousedown', onMouseDown);
  resizer.addEventListener('touchstart', onTouchStart, { passive: false });
})();
