/**
 * Checks whether a string is likely to be JSON.
 * 
 * A string is considered likely JSON if it:
 * - Is non-empty after trimming whitespace
 * - Starts with `{` or `[` and ends with `}` or `]`
 * - Can be successfully parsed by `JSON.parse`
 */
export function isLikelyJson(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (!(/[{\[]/.test(t[0]) && /[}\]]/.test(t[t.length - 1]))) return false;
  try { JSON.parse(t); return true; } catch { return false; }
}

export function tryParseJson<T = unknown>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch { return null; }
}

export function isLikelyNdjson(s: string): boolean {
  const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  let parsed = 0;
  for (const l of lines.slice(0, Math.min(lines.length, 5))) {
    try { JSON.parse(l); parsed++; } catch { /* ignore */ }
  }
  return parsed >= 2;
}

export function parseNdjson(s: string): unknown[] {
  const out: unknown[] = [];
  for (const l of s.split(/\r?\n/)) {
    const t = l.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* ignore non-JSON lines */ }
  }
  return out;
}

/**
 * Slugifies a host element id into a value safe to use as a CSS class
 * fragment (e.g. `boomi-swal--<slug>`) — used to scope per-mount styling
 * (dialogs/toasts) so multiple EmbedKit mounts on one page don't collide.
 */
export function slugifyHostId(hostId: string | undefined): string {
  if (!hostId) return 'default';
  const slug = hostId.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-+/, '');
  return slug || 'default';
}
