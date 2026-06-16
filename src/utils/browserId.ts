/**
 * @file browserId.ts
 * @license BSD-2-Clause
 *
 * Stable per-browser anonymous identifier used to scope public embed sessions
 * so that concurrent browsers sharing the same public token / credentials do
 * not collapse onto a single server-side session identity.
 */

const BROWSER_ID_KEY = '__boomi_bid';

function generateId(): string {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Returns a stable per-browser anonymous ID, creating one on first call. */
export function getBrowserId(): string {
  try {
    let id = localStorage.getItem(BROWSER_ID_KEY);
    if (!id) {
      id = generateId();
      localStorage.setItem(BROWSER_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (e.g. private browsing with strict settings):
    // return a session-scoped ID so at least the current session works.
    return generateId();
  }
}
