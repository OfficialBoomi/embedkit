/**
 * @file crtSearch.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for the cross reference table find and replace rules: plain, case, whole cell and regular
 * expression matching, zero length patterns, special characters, ordering and the result limit,
 * stepping between matches, the replace plan and the single cell replace (including the
 * replacement syntax), that find and replace always agree, and a 10,000 by 20 scan timing.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  CRT_SEARCH_LIMIT,
  findMatches,
  firstMatchAtOrAfter,
  planReplace,
  replaceInCell,
  stepMatch,
  type CrtMatch,
  type CrtSearchOptions,
} from '../../utils/crt/crtSearch';

const INVALID = 'Invalid regular expression';

function opts(partial: Partial<CrtSearchOptions> = {}): CrtSearchOptions {
  return { matchCase: false, wholeCell: false, regex: false, ...partial };
}

/** A getter over a small literal grid, plus its dimensions. */
function grid(rows: string[][]) {
  return {
    get: (r: number, c: number) => rows[r][c],
    rows: rows.length,
    cols: rows.length > 0 ? rows[0].length : 0,
  };
}

function find(rows: string[][], query: string, o: Partial<CrtSearchOptions> = {}, limit?: number) {
  const g = grid(rows);
  return findMatches(g.get, g.rows, g.cols, query, opts(o), limit);
}

/** The matches as 'row,col' strings, failing the test when the search was not ok. */
function hits(rows: string[][], query: string, o: Partial<CrtSearchOptions> = {}): string[] {
  const result = find(rows, query, o);
  if (!result.ok) throw new Error(`search failed: ${result.error}`);
  return result.matches.map((m) => `${m.row},${m.col}`);
}

function plan(
  rows: string[][],
  query: string,
  replacement: string,
  o: Partial<CrtSearchOptions> = {},
  limit?: number,
) {
  const g = grid(rows);
  return planReplace(g.get, g.rows, g.cols, query, replacement, opts(o), limit);
}

function changesOf(
  rows: string[][],
  query: string,
  replacement: string,
  o: Partial<CrtSearchOptions> = {},
) {
  const result = plan(rows, query, replacement, o);
  if (!result.ok) throw new Error(`plan failed: ${result.error}`);
  return result.plan.changes;
}

describe('findMatches: plain text', () => {
  const rows = [
    ['Apple', 'banana'],
    ['cherry', 'Pineapple'],
    ['', 'APPLE pie'],
  ];

  it('finds cells that contain the text, ignoring case by default', () => {
    expect(hits(rows, 'apple')).toEqual(['0,0', '1,1', '2,1']);
  });

  it('respects case when matchCase is on', () => {
    expect(hits(rows, 'apple', { matchCase: true })).toEqual(['1,1']);
    expect(hits(rows, 'Apple', { matchCase: true })).toEqual(['0,0']);
  });

  it('reports a cell once however many times the text occurs in it', () => {
    expect(hits([['aaa', 'a a a']], 'a')).toEqual(['0,0', '0,1']);
  });

  it('matches case insensitively beyond ASCII', () => {
    expect(hits([['\u00c9clair', 'eclair']], '\u00e9')).toEqual(['0,0']);
  });

  it('does not trim the query or the cells', () => {
    const data = [['a', ' a', 'a ', ' a ']];
    expect(hits(data, ' a')).toEqual(['0,1', '0,3']);
    expect(hits(data, 'a ')).toEqual(['0,2', '0,3']);
    expect(hits(data, ' ')).toEqual(['0,1', '0,2', '0,3']);
  });

  it('does not normalise Unicode', () => {
    const composed = '\u00e9';
    const decomposed = 'e\u0301';
    expect(hits([[composed, decomposed]], composed)).toEqual(['0,0']);
    expect(hits([[composed, decomposed]], decomposed)).toEqual(['0,1']);
  });

  it('returns ok with no matches when nothing is found', () => {
    expect(find(rows, 'zzz')).toEqual({ ok: true, matches: [], truncated: false });
  });
});

describe('findMatches: whole cell', () => {
  const rows = [['ab', 'abc', 'AB', ' ab', 'ab ', '']];

  it('with plain text means the cell equals the query', () => {
    expect(hits(rows, 'ab', { wholeCell: true })).toEqual(['0,0', '0,2']);
  });

  it('follows the case toggle', () => {
    expect(hits(rows, 'ab', { wholeCell: true, matchCase: true })).toEqual(['0,0']);
    expect(hits(rows, 'AB', { wholeCell: true, matchCase: true })).toEqual(['0,2']);
  });

  it('does not trim when comparing', () => {
    expect(hits(rows, ' ab', { wholeCell: true })).toEqual(['0,3']);
    expect(hits(rows, 'ab ', { wholeCell: true })).toEqual(['0,4']);
  });

  it('treats regular expression characters literally in plain mode', () => {
    expect(hits([['a.b', 'axb']], 'a.b', { wholeCell: true })).toEqual(['0,0']);
  });
});

describe('findMatches: regular expressions', () => {
  it('matches a pattern anywhere in the cell', () => {
    const rows = [['id-12', 'name', 'x7', '']];
    expect(hits(rows, '\\d+', { regex: true })).toEqual(['0,0', '0,2']);
  });

  it('honours anchors and alternation', () => {
    const rows = [['cat', 'concat', 'dog', 'bird']];
    expect(hits(rows, '^cat', { regex: true })).toEqual(['0,0']);
    expect(hits(rows, 'cat$', { regex: true })).toEqual(['0,0', '0,1']);
    expect(hits(rows, 'dog|bird', { regex: true })).toEqual(['0,2', '0,3']);
  });

  it('adds only the case flag, so a dot does not cross a line break', () => {
    expect(hits([['A', 'a']], 'a', { regex: true })).toEqual(['0,0', '0,1']);
    expect(hits([['A', 'a']], 'a', { regex: true, matchCase: true })).toEqual(['0,1']);
    expect(hits([['a\nb', 'a-b']], 'a.b', { regex: true })).toEqual(['0,1']);
  });

  it('applies the whole cell wrapper to the entire pattern, alternation included', () => {
    const rows = [['a', 'b', 'ab', 'ba', 'abc']];
    expect(hits(rows, 'a|b', { regex: true, wholeCell: true })).toEqual(['0,0', '0,1']);
    expect(hits(rows, 'a|ab', { regex: true, wholeCell: true })).toEqual(['0,0', '0,2']);
  });

  it('combines regex and whole cell', () => {
    const rows = [['123', '123a', 'a123', '', '45']];
    expect(hits(rows, '\\d+', { regex: true, wholeCell: true })).toEqual(['0,0', '0,4']);
    expect(hits(rows, '[a-z]\\d+|\\d+[a-z]', { regex: true, wholeCell: true })).toEqual([
      '0,1',
      '0,2',
    ]);
  });

  it('supports lookbehind and named groups', () => {
    expect(hits([['$5', '5', 'x5']], '(?<=\\$)\\d', { regex: true })).toEqual(['0,0']);
    expect(hits([['ab', 'cd']], '(?<first>a)b', { regex: true })).toEqual(['0,0']);
  });

  it('keeps a backreference working inside the whole cell wrapper', () => {
    const rows = [['aa', 'ab', 'aaa']];
    expect(hits(rows, '(a)\\1', { regex: true, wholeCell: true })).toEqual(['0,0']);
  });
});

describe('findMatches: invalid regular expressions', () => {
  const bad = ['(', '[', '*', '+a', 'a{2,1}', '\\', '(?<n', 'a)(b', '(?<=a'];

  it.each(bad)('returns ok false with a fixed message for %s', (pattern) => {
    for (const wholeCell of [false, true]) {
      for (const matchCase of [false, true]) {
        const result = find([['abc']], pattern, { regex: true, wholeCell, matchCase });
        expect(result).toEqual({ ok: false, error: INVALID });
      }
    }
  });

  it('does not let whole cell wrapping rescue a pattern that is invalid on its own', () => {
    expect(find([['ab']], 'a)(b', { regex: true, wholeCell: true })).toEqual({
      ok: false,
      error: INVALID,
    });
  });

  it('never throws, even when there is nothing to scan', () => {
    expect(() => findMatches(() => '', 0, 0, '(', opts({ regex: true }))).not.toThrow();
    expect(findMatches(() => '', 0, 0, '(', opts({ regex: true }))).toEqual({
      ok: false,
      error: INVALID,
    });
  });

  it('does not leak the engine message', () => {
    const result = find([['a']], '(', { regex: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(INVALID);
      expect(result.error).not.toMatch(/Unterminated|Syntax|group/i);
    }
  });

  it('treats the same text as ordinary text in plain mode', () => {
    expect(hits([['f(x)', 'fx']], '(')).toEqual(['0,0']);
    expect(hits([['a[1]', 'a1']], '[')).toEqual(['0,0']);
    expect(hits([['\\', 'x']], '\\')).toEqual(['0,0']);
  });

  it('does not treat an empty regex query as an error', () => {
    expect(find([['a']], '', { regex: true })).toEqual({ ok: true, matches: [], truncated: false });
  });
});

describe('findMatches: zero length patterns', () => {
  it('does not light up every cell for a pattern that can match nothing', () => {
    const rows = [['bbb', '', 'baa', 'aa', 'xyz']];
    expect(hits(rows, 'a*', { regex: true })).toEqual(['0,2', '0,3']);
  });

  it('never counts a pattern that only matches the empty string', () => {
    const rows = [['abc', '', ' ', 'a b']];
    for (const pattern of ['^', '$', '\\b', '(?:)', 'x*', '(?=a)', '^$']) {
      expect(hits(rows, pattern, { regex: true })).toEqual([]);
    }
  });

  it('finds a non-empty piece that comes after an empty match', () => {
    expect(hits([['bbbaaa']], 'a*', { regex: true })).toEqual(['0,0']);
    expect(hits([['12']], '\\d*', { regex: true })).toEqual(['0,0']);
  });

  it('never matches an empty cell, with or without whole cell', () => {
    const rows = [['', '']];
    expect(hits(rows, 'a*', { regex: true })).toEqual([]);
    expect(hits(rows, '.*', { regex: true, wholeCell: true })).toEqual([]);
    expect(hits(rows, 'a*', { regex: true, wholeCell: true })).toEqual([]);
  });

  it('whole cell requires the entire non-empty text to match', () => {
    const rows = [['aaa', 'baa', '']];
    expect(hits(rows, 'a*', { regex: true, wholeCell: true })).toEqual(['0,0']);
  });
});

describe('findMatches: special characters', () => {
  it('handles tabs, quotes and line breaks in cells and queries', () => {
    const rows = [['a\tb', 'say "hi"', 'one\ntwo', "it's"]];
    expect(hits(rows, '\t')).toEqual(['0,0']);
    expect(hits(rows, '"hi"')).toEqual(['0,1']);
    expect(hits(rows, 'one\ntwo', { wholeCell: true })).toEqual(['0,2']);
    expect(hits(rows, "'")).toEqual(['0,3']);
  });

  it('handles emoji', () => {
    const rows = [['go \u{1f600}', 'plain', '\u{1f600}']];
    expect(hits(rows, '\u{1f600}')).toEqual(['0,0', '0,2']);
    expect(hits(rows, '\u{1f600}', { wholeCell: true })).toEqual(['0,2']);
  });

  it('escapes every regular expression metacharacter in plain mode', () => {
    const meta = ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\', '{2}', '.*'];
    for (const token of meta) {
      const rows = [[`x${token}y`, 'xay', 'plain']];
      expect(hits(rows, token)).toEqual(['0,0']);
      expect(hits([[token, `${token}z`]], token, { wholeCell: true })).toEqual(['0,0']);
    }
  });

  it('treats a dot in plain mode as a dot and in regex mode as any character', () => {
    const rows = [['a.b', 'axb']];
    expect(hits(rows, 'a.b')).toEqual(['0,0']);
    expect(hits(rows, 'a.b', { regex: true })).toEqual(['0,0', '0,1']);
  });
});

describe('findMatches: empty cells and empty query', () => {
  const rows = [
    ['', 'a'],
    ['b', ''],
  ];

  it('an empty query finds nothing in any mode', () => {
    for (const regex of [false, true]) {
      for (const wholeCell of [false, true]) {
        for (const matchCase of [false, true]) {
          expect(find(rows, '', { regex, wholeCell, matchCase })).toEqual({
            ok: true,
            matches: [],
            truncated: false,
          });
        }
      }
    }
  });

  it('empty cells are never matches', () => {
    expect(hits(rows, 'a')).toEqual(['0,1']);
    expect(hits(rows, 'a', { wholeCell: true })).toEqual(['0,1']);
  });

  it('a single space is a real query', () => {
    expect(hits([['', ' ', 'a b']], ' ')).toEqual(['0,1', '0,2']);
  });

  it('handles a table with no rows or no columns without reading cells', () => {
    const get = vi.fn(() => 'x');
    expect(findMatches(get, 0, 3, 'x', opts())).toEqual({ ok: true, matches: [], truncated: false });
    expect(findMatches(get, 3, 0, 'x', opts())).toEqual({ ok: true, matches: [], truncated: false });
    expect(get).not.toHaveBeenCalled();
  });
});

describe('findMatches: ordering and shared regex state', () => {
  it('reports matches in row-major order', () => {
    const rows = [
      ['x', '', 'x'],
      ['', 'x', ''],
      ['x', 'x', 'x'],
    ];
    expect(hits(rows, 'x')).toEqual(['0,0', '0,2', '1,1', '2,0', '2,1', '2,2']);
  });

  it('starts every cell from the beginning of its text', () => {
    // A global expression remembers where it stopped, so a reused one would skip these.
    const rows = Array.from({ length: 6 }, () => ['abc', 'abc']);
    expect(hits(rows, 'b')).toHaveLength(12);
    expect(hits(rows, 'b', { regex: true })).toHaveLength(12);
    expect(hits(rows, 'abc', { wholeCell: true })).toHaveLength(12);
    expect(hits(rows, 'abc', { wholeCell: true, regex: true })).toHaveLength(12);
  });

  it('gives the same answer when called twice', () => {
    const rows = [['aba', 'b'], ['a', 'ab']];
    expect(find(rows, 'a')).toEqual(find(rows, 'a'));
    expect(find(rows, 'a', { regex: true })).toEqual(find(rows, 'a', { regex: true }));
  });
});

describe('findMatches: limit and truncated', () => {
  const all = [['x', 'x', 'x', 'x', 'x']];

  it('stops after the limit and reports truncated', () => {
    const result = find(all, 'x', {}, 3);
    expect(result).toEqual({
      ok: true,
      matches: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      truncated: true,
    });
  });

  it('does not report truncated when the matches exactly fit', () => {
    const result = find(all, 'x', {}, 5);
    expect(result.ok && result.matches.length).toBe(5);
    expect(result.ok && result.truncated).toBe(false);
  });

  it('does not report truncated when there are fewer matches than the limit', () => {
    const result = find(all, 'x', {}, 100);
    expect(result.ok && result.truncated).toBe(false);
  });

  it('stops reading cells once it knows there are more', () => {
    const get = vi.fn(() => 'x');
    findMatches(get, 1000, 20, 'x', opts(), 2);
    expect(get.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('a limit of 0 reports truncated as soon as anything matches', () => {
    expect(find(all, 'x', {}, 0)).toEqual({ ok: true, matches: [], truncated: true });
    expect(find(all, 'y', {}, 0)).toEqual({ ok: true, matches: [], truncated: false });
  });

  it('uses CRT_SEARCH_LIMIT by default', () => {
    expect(CRT_SEARCH_LIMIT).toBe(50000);
    const result = findMatches(() => 'x', 300, 200, 'x', opts());
    expect(result.ok && result.matches.length).toBe(CRT_SEARCH_LIMIT);
    expect(result.ok && result.truncated).toBe(true);
  });

  it('applies the limit to matching cells only, not to cells scanned', () => {
    const rows = Array.from({ length: 100 }, (_, r) => [r === 99 ? 'hit' : 'miss']);
    const result = find(rows, 'hit', {}, 1);
    expect(result).toEqual({ ok: true, matches: [{ row: 99, col: 0 }], truncated: false });
  });
});

describe('firstMatchAtOrAfter', () => {
  const matches: CrtMatch[] = [
    { row: 0, col: 1 },
    { row: 2, col: 0 },
    { row: 2, col: 3 },
    { row: 5, col: 2 },
  ];

  it('returns -1 when there are no matches', () => {
    expect(firstMatchAtOrAfter([], 0, 0)).toBe(-1);
    expect(firstMatchAtOrAfter([], 5, 5)).toBe(-1);
  });

  it('finds the first match when the position is before everything', () => {
    expect(firstMatchAtOrAfter(matches, 0, 0)).toBe(0);
  });

  it('counts a match at exactly the position', () => {
    expect(firstMatchAtOrAfter(matches, 0, 1)).toBe(0);
    expect(firstMatchAtOrAfter(matches, 2, 0)).toBe(1);
    expect(firstMatchAtOrAfter(matches, 2, 3)).toBe(2);
    expect(firstMatchAtOrAfter(matches, 5, 2)).toBe(3);
  });

  it('finds the next match when the position is between matches', () => {
    expect(firstMatchAtOrAfter(matches, 0, 2)).toBe(1);
    expect(firstMatchAtOrAfter(matches, 1, 9)).toBe(1);
    expect(firstMatchAtOrAfter(matches, 2, 1)).toBe(2);
    expect(firstMatchAtOrAfter(matches, 2, 4)).toBe(3);
    expect(firstMatchAtOrAfter(matches, 4, 0)).toBe(3);
  });

  it('wraps to the first match when the position is after the last one', () => {
    expect(firstMatchAtOrAfter(matches, 5, 3)).toBe(0);
    expect(firstMatchAtOrAfter(matches, 6, 0)).toBe(0);
    expect(firstMatchAtOrAfter(matches, 10000, 10000)).toBe(0);
  });

  it('works with a single match', () => {
    const one: CrtMatch[] = [{ row: 3, col: 3 }];
    expect(firstMatchAtOrAfter(one, 0, 0)).toBe(0);
    expect(firstMatchAtOrAfter(one, 3, 3)).toBe(0);
    expect(firstMatchAtOrAfter(one, 3, 4)).toBe(0);
  });

  it('agrees with a linear scan on a large generated list', () => {
    const list: CrtMatch[] = [];
    let seed = 12345;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let r = 0; r < 300; r++) {
      for (let c = 0; c < 8; c++) if (rand(4) === 0) list.push({ row: r, col: c });
    }
    for (let i = 0; i < 400; i++) {
      const row = rand(310);
      const col = rand(10);
      let expected = list.findIndex((m) => m.row > row || (m.row === row && m.col >= col));
      if (expected === -1) expected = list.length > 0 ? 0 : -1;
      expect(firstMatchAtOrAfter(list, row, col)).toBe(expected);
    }
  });
});

describe('stepMatch', () => {
  it('moves forward and backward', () => {
    expect(stepMatch(0, 5, 1)).toBe(1);
    expect(stepMatch(3, 5, 1)).toBe(4);
    expect(stepMatch(3, 5, -1)).toBe(2);
    expect(stepMatch(1, 5, -1)).toBe(0);
  });

  it('wraps at both ends', () => {
    expect(stepMatch(4, 5, 1)).toBe(0);
    expect(stepMatch(0, 5, -1)).toBe(4);
  });

  it('stays on the only match', () => {
    expect(stepMatch(0, 1, 1)).toBe(0);
    expect(stepMatch(0, 1, -1)).toBe(0);
  });

  it('answers -1 when there are no matches', () => {
    expect(stepMatch(0, 0, 1)).toBe(-1);
    expect(stepMatch(-1, 0, -1)).toBe(-1);
    expect(stepMatch(7, 0, 1)).toBe(-1);
  });

  it('starts at either end from "no current match" or a stale index', () => {
    expect(stepMatch(-1, 4, 1)).toBe(0);
    expect(stepMatch(-1, 4, -1)).toBe(3);
    expect(stepMatch(9, 4, 1)).toBe(0);
    expect(stepMatch(9, 4, -1)).toBe(3);
  });

  it('walks the whole list and comes back', () => {
    let i = 0;
    const seen: number[] = [];
    for (let n = 0; n < 6; n++) {
      i = stepMatch(i, 3, 1);
      seen.push(i);
    }
    expect(seen).toEqual([1, 2, 0, 1, 2, 0]);
  });
});

describe('replaceInCell: plain text', () => {
  it('replaces every occurrence', () => {
    expect(replaceInCell('a-a-a', 'a', 'b', opts())).toBe('b-b-b');
  });

  it('ignores case unless matchCase is on', () => {
    expect(replaceInCell('Aa', 'a', 'x', opts())).toBe('xx');
    expect(replaceInCell('Aa', 'a', 'x', opts({ matchCase: true }))).toBe('Ax');
  });

  it('takes the replacement literally, dollar signs included', () => {
    expect(replaceInCell('price', 'price', '$5', opts())).toBe('$5');
    expect(replaceInCell('a.b', '.', '$&', opts())).toBe('a$&b');
    expect(replaceInCell('abc', 'b', '$1', opts())).toBe('a$1c');
    expect(replaceInCell('abc', 'b', '$$', opts())).toBe('a$$c');
    expect(replaceInCell('abc', 'b', "$'", opts())).toBe("a$'c");
    expect(replaceInCell('abc', 'b', '$`', opts())).toBe('a$`c');
    expect(replaceInCell('abc', 'b', '$<x>', opts())).toBe('a$<x>c');
  });

  it('treats metacharacters in the query as text', () => {
    expect(replaceInCell('1.5 (x)', '(x)', 'y', opts())).toBe('1.5 y');
    expect(replaceInCell('a*b*c', '*', '+', opts())).toBe('a+b+c');
    expect(replaceInCell('c:\\dir', '\\', '/', opts())).toBe('c:/dir');
  });

  it('can replace with an empty string, tabs and emoji', () => {
    expect(replaceInCell('abc', 'b', '', opts())).toBe('ac');
    expect(replaceInCell('a b', ' ', '\t', opts())).toBe('a\tb');
    expect(replaceInCell('ok', 'ok', '\u{1f600}', opts())).toBe('\u{1f600}');
  });

  it('does not rescan its own output', () => {
    expect(replaceInCell('aaa', 'a', 'aa', opts())).toBe('aaaaaa');
  });

  it('returns the same string when nothing matches', () => {
    const value = 'hello';
    expect(replaceInCell(value, 'z', 'y', opts())).toBe(value);
  });

  it('leaves an empty cell and an empty query alone', () => {
    expect(replaceInCell('', 'a', 'b', opts())).toBe('');
    expect(replaceInCell('abc', '', 'x', opts())).toBe('abc');
    expect(replaceInCell('abc', '', 'x', opts({ regex: true }))).toBe('abc');
  });
});

describe('replaceInCell: whole cell', () => {
  it('replaces the entire value when the cell equals the query', () => {
    expect(replaceInCell('ab', 'ab', 'xyz', opts({ wholeCell: true }))).toBe('xyz');
    expect(replaceInCell('AB', 'ab', 'xyz', opts({ wholeCell: true }))).toBe('xyz');
  });

  it('leaves a cell that only contains the query', () => {
    expect(replaceInCell('abc', 'ab', 'xyz', opts({ wholeCell: true }))).toBe('abc');
    expect(replaceInCell(' ab', 'ab', 'xyz', opts({ wholeCell: true }))).toBe(' ab');
  });

  it('respects case when asked', () => {
    expect(replaceInCell('AB', 'ab', 'x', opts({ wholeCell: true, matchCase: true }))).toBe('AB');
  });

  it('keeps a dollar sign literal in plain mode', () => {
    expect(replaceInCell('ab', 'ab', '$&$1', opts({ wholeCell: true }))).toBe('$&$1');
  });

  it('expands the replacement syntax in regex mode', () => {
    const o = opts({ wholeCell: true, regex: true });
    expect(replaceInCell('12-ab', '(\\d+)-(\\w+)', '$2:$1', o)).toBe('ab:12');
    expect(replaceInCell('12-ab', '(\\d+)-(\\w+)', '[$&]', o)).toBe('[12-ab]');
    expect(replaceInCell('x12-ab', '(\\d+)-(\\w+)', '$2:$1', o)).toBe('x12-ab');
  });
});

describe('replaceInCell: regular expressions', () => {
  const o = opts({ regex: true });

  it('replaces every match', () => {
    expect(replaceInCell('a1b22c333', '\\d+', '#', o)).toBe('a#b#c#');
  });

  it('supports $1, $&, $$, $<name>, the text around the match and unknown groups', () => {
    expect(replaceInCell('john smith', '(\\w+) (\\w+)', '$2, $1', o)).toBe('smith, john');
    expect(replaceInCell('abc', 'b', '[$&]', o)).toBe('a[b]c');
    expect(replaceInCell('abc', 'b', '$$', o)).toBe('a$c');
    expect(replaceInCell('2024-05', '(?<y>\\d+)-(?<m>\\d+)', '$<m>/$<y>', o)).toBe('05/2024');
    expect(replaceInCell('abc', 'b', "<$`|$'>", o)).toBe('a<a|c>c');
    expect(replaceInCell('abc', 'b', '$2', o)).toBe('a$2c');
    expect(replaceInCell('abc', 'b', '$0', o)).toBe('a$0c');
  });

  it('writes an empty string for a group that did not take part', () => {
    expect(replaceInCell('xz', 'x(y)?', '[$1]', o)).toBe('[]z');
  });

  it('ignores case unless matchCase is on', () => {
    expect(replaceInCell('Ab', 'a', 'x', o)).toBe('xb');
    expect(replaceInCell('Ab', 'a', 'x', opts({ regex: true, matchCase: true }))).toBe('Ab');
  });

  it('skips zero length matches instead of inserting text', () => {
    expect(replaceInCell('ab12', '\\d*', '#', o)).toBe('ab#');
    expect(replaceInCell('baa', 'a*', 'X', o)).toBe('bX');
    expect(replaceInCell('abc', 'x*', '-', o)).toBe('abc');
    expect(replaceInCell('abc', '^', '>', o)).toBe('abc');
    expect(replaceInCell('abc', '$', '<', o)).toBe('abc');
  });

  it('gives the cell back for an invalid pattern', () => {
    expect(replaceInCell('abc', '(', 'x', o)).toBe('abc');
    expect(() => replaceInCell('abc', '[', 'x', o)).not.toThrow();
  });

  it('matches the built-in replacement syntax for non-empty matches', () => {
    const cases: Array<[string, string]> = [
      ['(\\d+)-(\\w+)', 'id 12-ab and 7-z'],
      ['(?<num>\\d+)-(?<word>[a-z]+)', 'id 12-ab and 7-z'],
      ['(a)|(b)', 'cabbage'],
      ['x(y)?', 'xz xy'],
      ['b+', 'abbbc'],
    ];
    const templates = [
      '$1',
      '$2',
      '$2-$1',
      '$&',
      '$$',
      '$$1',
      '$`',
      "$'",
      '$<num>',
      '$<word>-$<num>',
      '$<nope>',
      '$<',
      '$<num',
      '$0',
      '$00',
      '$01',
      '$02',
      '$05',
      '$10',
      '$11',
      '$99',
      '$',
      'x$',
      '$z',
      '$&$&',
      'a$1b',
      "[$`|$&|$']",
      '',
    ];
    for (const [pattern, text] of cases) {
      for (const template of templates) {
        const expected = text.replace(new RegExp(pattern, 'g'), template);
        expect(replaceInCell(text, pattern, template, opts({ regex: true, matchCase: true }))).toBe(
          expected,
        );
      }
    }
  });
});

describe('planReplace', () => {
  it('lists only the cells that change, in row-major order', () => {
    const rows = [
      ['cat', 'dog'],
      ['bird', 'concat'],
    ];
    expect(changesOf(rows, 'cat', 'fox')).toEqual([
      { row: 0, col: 0, value: 'fox' },
      { row: 1, col: 1, value: 'confox' },
    ]);
  });

  it('skips cells whose value would not change', () => {
    const rows = [['a', 'b']];
    expect(changesOf(rows, 'a', 'a', { matchCase: true })).toEqual([]);
    expect(changesOf([['x', 'xx']], 'x', 'x')).toEqual([]);
    expect(changesOf([['ab']], 'ab', 'ab', { wholeCell: true })).toEqual([]);
  });

  it('counts a case only change as a change', () => {
    expect(changesOf([['abc']], 'ABC', 'ABC', { wholeCell: true })).toEqual([
      { row: 0, col: 0, value: 'ABC' },
    ]);
  });

  it('replaces every occurrence inside a cell', () => {
    expect(changesOf([['a a a']], 'a', 'b')).toEqual([{ row: 0, col: 0, value: 'b b b' }]);
  });

  it('keeps dollar signs literal in plain mode and expands them in regex mode', () => {
    expect(changesOf([['x']], 'x', '$&$1')).toEqual([{ row: 0, col: 0, value: '$&$1' }]);
    expect(changesOf([['ab-9']], '(\\w+)-(\\d)', '$2-$1', { regex: true })).toEqual([
      { row: 0, col: 0, value: '9-ab' },
    ]);
  });

  it('supports whole cell with plain text', () => {
    const rows = [['ab', 'abc', 'AB']];
    expect(changesOf(rows, 'ab', 'z', { wholeCell: true })).toEqual([
      { row: 0, col: 0, value: 'z' },
      { row: 0, col: 2, value: 'z' },
    ]);
  });

  it('can empty cells', () => {
    expect(changesOf([['drop', 'keep']], 'drop', '')).toEqual([{ row: 0, col: 0, value: '' }]);
  });

  it('leaves empty cells and non matching cells alone, even for patterns that match nothing', () => {
    const rows = [['', 'xyz', 'baa']];
    expect(changesOf(rows, 'a*', 'X', { regex: true })).toEqual([{ row: 0, col: 2, value: 'bX' }]);
  });

  it('an empty query changes nothing', () => {
    expect(plan([['a']], '', 'x')).toEqual({ ok: true, plan: { changes: [], truncated: false } });
    expect(plan([['a']], '', 'x', { regex: true })).toEqual({
      ok: true,
      plan: { changes: [], truncated: false },
    });
  });

  it('reports an invalid regular expression and does not throw', () => {
    expect(plan([['a']], '(', 'x', { regex: true })).toEqual({ ok: false, error: INVALID });
    expect(plan([['a']], 'a)(b', 'x', { regex: true, wholeCell: true })).toEqual({
      ok: false,
      error: INVALID,
    });
    expect(plan([['a(']], '(', 'x')).toEqual({
      ok: true,
      plan: { changes: [{ row: 0, col: 0, value: 'ax' }], truncated: false },
    });
  });

  it('cuts at the limit and reports truncated', () => {
    const rows = [['x', 'x', 'x', 'x']];
    const result = plan(rows, 'x', 'y', {}, 2);
    expect(result).toEqual({
      ok: true,
      plan: {
        changes: [
          { row: 0, col: 0, value: 'y' },
          { row: 0, col: 1, value: 'y' },
        ],
        truncated: true,
      },
    });
  });

  it('does not report truncated when the changes exactly fit the limit', () => {
    const result = plan([['x', 'x']], 'x', 'y', {}, 2);
    expect(result.ok && result.plan.changes.length).toBe(2);
    expect(result.ok && result.plan.truncated).toBe(false);
  });

  it('does not count unchanged cells toward the limit', () => {
    const rows = [['y', 'y', 'xy', 'y', 'xz']];
    const result = plan(rows, 'x', 'q', {}, 2);
    expect(result.ok && result.plan.changes).toEqual([
      { row: 0, col: 2, value: 'qy' },
      { row: 0, col: 4, value: 'qz' },
    ]);
    expect(result.ok && result.plan.truncated).toBe(false);
  });

  it('uses CRT_SEARCH_LIMIT by default', () => {
    const g = { get: () => 'x', rows: 300, cols: 200 };
    const result = planReplace(g.get, g.rows, g.cols, 'x', 'y', opts());
    expect(result.ok && result.plan.changes.length).toBe(CRT_SEARCH_LIMIT);
    expect(result.ok && result.plan.truncated).toBe(true);
  });

  it('does not change the table it reads', () => {
    const rows = [['a', 'b']];
    plan(rows, 'a', 'z');
    expect(rows).toEqual([['a', 'b']]);
  });
});

describe('find and replace agree', () => {
  // Small seeded generator so a failure can be replayed.
  function makeRand(seed: number) {
    let s = seed >>> 0;
    return (n: number) => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (((t ^ (t >>> 14)) >>> 0) % n) | 0;
    };
  }

  const pieces = ['a', 'b', 'A', '1', '2', ' ', '.', '$', '\t', 'ab', 'aa', ''];
  const plainQueries = ['a', 'A', 'ab', '.', '$', ' ', 'aa', '1'];
  const regexQueries = [
    'a',
    'a*',
    'a*?',
    '\\d*',
    '\\d+',
    '^a',
    'b$',
    '^$',
    'a|b',
    '(a)(b)?',
    '\\s*',
    '.*',
    '[ab]+',
    '(?:)',
    '\\b',
  ];

  it('changes exactly the cells find reports, for every option combination', () => {
    const rand = makeRand(20240611);
    for (let round = 0; round < 40; round++) {
      const rows = Array.from({ length: 6 }, () =>
        Array.from({ length: 4 }, () => {
          let text = '';
          const parts = rand(4);
          for (let p = 0; p < parts; p++) text += pieces[rand(pieces.length)];
          return text;
        }),
      );
      const g = grid(rows);
      for (const regex of [false, true]) {
        for (const wholeCell of [false, true]) {
          for (const matchCase of [false, true]) {
            const o = opts({ regex, wholeCell, matchCase });
            for (const query of regex ? regexQueries : plainQueries) {
              const found = findMatches(g.get, g.rows, g.cols, query, o);
              // The marker holds a character no cell can contain, so every real match changes.
              const planned = planReplace(g.get, g.rows, g.cols, query, '<<R>>', o);
              if (!found.ok || !planned.ok) throw new Error(`unexpected failure for ${query}`);
              const foundKeys = found.matches.map((m) => `${m.row},${m.col}`);
              const plannedKeys = planned.plan.changes.map((c) => `${c.row},${c.col}`);
              expect(plannedKeys, `query ${query} ${JSON.stringify(o)}`).toEqual(foundKeys);
              for (const change of planned.plan.changes) {
                expect(change.value).toBe(
                  replaceInCell(rows[change.row][change.col], query, '<<R>>', o),
                );
              }
            }
          }
        }
      }
    }
  });
});

describe('performance: 10,000 rows by 20 columns', () => {
  const ROWS = 10000;
  const COLS = 20;
  const MAX_MS = 500;
  // A pattern that only matches the empty string makes the scan retry at every character of
  // every cell, so it is the slowest case by a wide margin and gets a wider bound.
  const MAX_EMPTY_MATCH_MS = 1500;
  const cell = (r: number, c: number) => `row${r} col${c} value`;

  function timed<T>(fn: () => T): { out: T; elapsed: number } {
    const start = performance.now();
    const out = fn();
    return { out, elapsed: performance.now() - start };
  }

  it('scans for plain text quickly', () => {
    const { out, elapsed } = timed(() => findMatches(cell, ROWS, COLS, 'row99 ', opts()));
    expect(out.ok && out.matches.length).toBe(COLS);
    expect(elapsed).toBeLessThan(MAX_MS);
  });

  it('scans a whole cell search quickly', () => {
    const { out, elapsed } = timed(() =>
      findMatches(cell, ROWS, COLS, 'row5 col5 value', opts({ wholeCell: true })),
    );
    expect(out.ok && out.matches).toEqual([{ row: 5, col: 5 }]);
    expect(elapsed).toBeLessThan(MAX_MS);
  });

  it('scans with a regular expression quickly', () => {
    const { out, elapsed } = timed(() =>
      findMatches(cell, ROWS, COLS, 'col1[0-9] v', opts({ regex: true, matchCase: true }), 1e9),
    );
    expect(out.ok && out.matches.length).toBe(ROWS * 10);
    expect(out.ok && out.truncated).toBe(false);
    expect(elapsed).toBeLessThan(MAX_MS);
  });

  it('scans a pattern that can match nothing quickly', () => {
    const { out, elapsed } = timed(() =>
      findMatches(cell, ROWS, COLS, 'z*', opts({ regex: true })),
    );
    expect(out.ok && out.matches.length).toBe(0);
    expect(elapsed).toBeLessThan(MAX_EMPTY_MATCH_MS);
  });

  it('plans a replace quickly', () => {
    const { out, elapsed } = timed(() => planReplace(cell, ROWS, COLS, 'value', 'v', opts(), 1e9));
    expect(out.ok && out.plan.changes.length).toBe(ROWS * COLS);
    expect(out.ok && out.plan.truncated).toBe(false);
    expect(elapsed).toBeLessThan(MAX_MS);
  });
});
