/**
 * @file crtSearch.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Pure find and replace rules for the cross reference table editor: which cells match a query,
 * how to step from one match to the next, and what a replace would write. No React and no store,
 * the caller hands in a cell getter, so the rules can be tested without a DOM.
 *
 * Find and replace share one compiled regular expression (plain text is escaped into one), so
 * the cells that are highlighted are exactly the cells that get replaced. A cell counts as a
 * match only when the pattern matches a non-empty piece of it. Zero length matches never count,
 * and replace leaves them alone, so a pattern such as a* does not light up (or rewrite) every cell.
 */

export interface CrtSearchOptions {
  matchCase: boolean;
  /** The whole cell text must match, not just a piece of it. */
  wholeCell: boolean;
  /** Treat the query as a JavaScript regular expression instead of plain text. */
  regex: boolean;
}

/** One matching cell. A cell with several hits in its text is still one match. */
export interface CrtMatch {
  row: number;
  col: number;
}

export type CrtSearchResult =
  | { ok: true; matches: CrtMatch[]; truncated: boolean }
  | { ok: false; error: string };

export interface CrtReplacePlan {
  changes: Array<{ row: number; col: number; value: string }>;
  truncated: boolean;
}

/** Most matching (or changing) cells a single search reports, so a huge table cannot flood the UI. */
export const CRT_SEARCH_LIMIT = 50000;

/** The only error text. The engine's own message is not passed on, it differs by browser. */
const INVALID_PATTERN = 'Invalid regular expression';

type CellGetter = (row: number, col: number) => string;

type Compiled = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ready'; re: RegExp };

const EMPTY_QUERY: Compiled = { kind: 'empty' };
const INVALID_QUERY: Compiled = { kind: 'invalid' };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the one regular expression for a query. Flags are 'g' plus 'i' when case is ignored and
 * nothing else, so a dot does not cross a line break and ^ and $ only mean the ends of the cell.
 *
 * A user pattern is compiled on its own first and only then wrapped for whole cell mode, because
 * wrapping can turn an invalid pattern into a valid one (a)(b would become ^(?:a)(b)$) and the
 * toggle must not change whether a pattern is accepted.
 */
function compile(query: string, opts: CrtSearchOptions): Compiled {
  if (query === '') return EMPTY_QUERY;
  const flags = opts.matchCase ? 'g' : 'gi';
  const source = opts.regex ? query : escapeRegExp(query);
  try {
    const plain = new RegExp(source, flags);
    return { kind: 'ready', re: opts.wholeCell ? new RegExp(`^(?:${source})$`, flags) : plain };
  } catch {
    return INVALID_QUERY;
  }
}

/**
 * True when the pattern matches at least one non-empty piece of the text. A global expression
 * keeps its position between calls, so every cell starts from zero.
 *
 * The loop repeats only while the matches found are empty, and each repeat starts one character
 * later, so it is bounded by the length of the cell; a pattern with no empty matches costs one
 * run. A single run cannot be interrupted, so a pattern that backtracks badly on a long cell
 * will stall this call, and nothing here can prevent that.
 */
function hasNonEmptyMatch(re: RegExp, value: string): boolean {
  if (value === '') return false;
  re.lastIndex = 0;
  let m = re.exec(value);
  while (m !== null) {
    if (m[0].length > 0) {
      re.lastIndex = 0;
      return true;
    }
    re.lastIndex = m.index + 1;
    m = re.exec(value);
  }
  return false;
}

/** The largest number of results to collect. Infinity means no cap. */
function resultCap(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) return CRT_SEARCH_LIMIT;
  return Math.max(0, Math.floor(limit));
}

/**
 * Every cell the query matches, in row-major order. An empty query finds nothing. When more than
 * `limit` cells match, the first `limit` are returned and `truncated` is true; hitting the limit
 * exactly is not truncation.
 */
export function findMatches(
  getCell: CellGetter,
  rowCount: number,
  colCount: number,
  query: string,
  opts: CrtSearchOptions,
  limit: number = CRT_SEARCH_LIMIT,
): CrtSearchResult {
  const compiled = compile(query, opts);
  if (compiled.kind === 'invalid') return { ok: false, error: INVALID_PATTERN };
  const matches: CrtMatch[] = [];
  if (compiled.kind === 'empty') return { ok: true, matches, truncated: false };

  const cap = resultCap(limit);
  const { re } = compiled;
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      const value = getCell(row, col);
      let hit: boolean;
      try {
        hit = hasNonEmptyMatch(re, value);
      } catch {
        // A pattern the engine gives up on (for example by running out of stack) is unusable.
        return { ok: false, error: INVALID_PATTERN };
      }
      if (!hit) continue;
      if (matches.length >= cap) return { ok: true, matches, truncated: true };
      matches.push({ row, col });
    }
  }
  return { ok: true, matches, truncated: false };
}

/**
 * Index of the first match at or after (row, col) in row-major order, wrapping to 0 when the
 * position is past the last match, or -1 when there are no matches. `matches` must be in the
 * order findMatches returns, which is what makes the binary search valid.
 */
export function firstMatchAtOrAfter(matches: readonly CrtMatch[], row: number, col: number): number {
  if (matches.length === 0) return -1;
  let lo = 0;
  let hi = matches.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const m = matches[mid];
    if (m.row < row || (m.row === row && m.col < col)) lo = mid + 1;
    else hi = mid;
  }
  return lo === matches.length ? 0 : lo;
}

/**
 * The next (1) or previous (-1) match index, wrapping at both ends. With no matches the answer
 * is -1. An index that is not a valid position (-1 for "no current match", or one left over from
 * a longer list) starts at the first match going forward and the last going back.
 */
export function stepMatch(index: number, count: number, direction: 1 | -1): number {
  if (!(count > 0)) return -1;
  if (!(index >= 0 && index < count)) return direction === 1 ? 0 : count - 1;
  return (index + direction + count) % count;
}

/**
 * Expands $$, $&, $`, $', $n, $nn and $<name> in a replacement the way String.prototype.replace
 * does. It exists because the built-in cannot be told to skip zero length matches, and a
 * replacement function receives the template unexpanded. `args` is what such a function gets:
 * the match, the capture groups, the offset, the whole string and, only when the pattern has
 * named groups, the groups object.
 */
function expandTemplate(template: string, args: unknown[]): string {
  const last = args[args.length - 1];
  const groups =
    typeof last === 'object' && last !== null ? (last as Record<string, unknown>) : undefined;
  const tail = groups ? 3 : 2;
  const matched = args[0] as string;
  const captures = args.slice(1, args.length - tail);
  const offset = args[args.length - tail] as number;
  const whole = args[args.length - tail + 1] as string;

  let out = '';
  for (let i = 0; i < template.length; i++) {
    const ch = template[i];
    if (ch !== '$' || i + 1 >= template.length) {
      out += ch;
      continue;
    }
    const next = template[i + 1];
    if (next === '$') {
      out += '$';
      i++;
    } else if (next === '&') {
      out += matched;
      i++;
    } else if (next === '`') {
      out += whole.slice(0, offset);
      i++;
    } else if (next === "'") {
      out += whole.slice(offset + matched.length);
      i++;
    } else if (next >= '0' && next <= '9') {
      const after = template[i + 2];
      let width = after !== undefined && after >= '0' && after <= '9' ? 2 : 1;
      let n = parseInt(template.slice(i + 1, i + 1 + width), 10);
      if (width === 2 && n > captures.length) {
        width = 1;
        n = parseInt(next, 10);
      }
      if (n >= 1 && n <= captures.length) {
        const capture = captures[n - 1];
        out += capture === undefined ? '' : String(capture);
        i += width;
      } else {
        out += '$';
      }
    } else if (next === '<' && groups) {
      const close = template.indexOf('>', i + 2);
      if (close === -1) {
        out += '$';
      } else {
        const found = groups[template.slice(i + 2, close)];
        out += found === undefined ? '' : String(found);
        i = close;
      }
    } else {
      out += '$';
    }
  }
  return out;
}

/**
 * Rewrites every non-empty match in the text. Empty matches are returned as '' (a no-op) so the
 * built-in replace cannot insert text at positions that find never showed. Plain text takes the
 * replacement literally; only regex mode gives $ its special meaning. Returns the same string
 * when nothing matched.
 */
function replaceMatches(
  re: RegExp,
  value: string,
  replacement: string,
  opts: CrtSearchOptions,
): string {
  if (value === '') return value;
  const expand = opts.regex && replacement.includes('$');
  re.lastIndex = 0;
  const out = value.replace(re, (...args: unknown[]) => {
    if ((args[0] as string) === '') return '';
    return expand ? expandTemplate(replacement, args) : replacement;
  });
  re.lastIndex = 0;
  return out;
}

/**
 * The new text of one cell. Plain mode replaces every occurrence with the replacement taken
 * literally, regex mode follows JavaScript replacement syntax, and whole cell mode replaces the
 * entire value. An invalid pattern, an empty query or no match all give the value back unchanged.
 */
export function replaceInCell(
  value: string,
  query: string,
  replacement: string,
  opts: CrtSearchOptions,
): string {
  const compiled = compile(query, opts);
  if (compiled.kind !== 'ready') return value;
  try {
    return replaceMatches(compiled.re, value, replacement, opts);
  } catch {
    return value;
  }
}

/**
 * The cells a replace would change, in row-major order. Cells whose text would come out the same
 * (including a replacement equal to the old text) are left out, so applying the plan is always a
 * real edit. More than `limit` changes gives the first `limit` and `truncated: true`. Only an
 * invalid pattern is an error.
 */
export function planReplace(
  getCell: CellGetter,
  rowCount: number,
  colCount: number,
  query: string,
  replacement: string,
  opts: CrtSearchOptions,
  limit: number = CRT_SEARCH_LIMIT,
): { ok: true; plan: CrtReplacePlan } | { ok: false; error: string } {
  const compiled = compile(query, opts);
  if (compiled.kind === 'invalid') return { ok: false, error: INVALID_PATTERN };
  const changes: CrtReplacePlan['changes'] = [];
  if (compiled.kind === 'empty') return { ok: true, plan: { changes, truncated: false } };

  const cap = resultCap(limit);
  const { re } = compiled;
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      const value = getCell(row, col);
      let next: string;
      try {
        next = replaceMatches(re, value, replacement, opts);
      } catch {
        return { ok: false, error: INVALID_PATTERN };
      }
      if (next === value) continue;
      if (changes.length >= cap) return { ok: true, plan: { changes, truncated: true } };
      changes.push({ row, col, value: next });
    }
  }
  return { ok: true, plan: { changes, truncated: false } };
}
