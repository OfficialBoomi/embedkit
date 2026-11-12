/**
 * @file crtWarningsView.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for how key warnings are shown: the per row flag, the chips and their wording (held to
 * describeKeyWarnings), the jump to the next flagged row, and the hover text of a cell.
 */
import { describe, it, expect } from 'vitest';
import { markEdgeSpaces } from '../../utils/crt/crtCellMarkers';
import { checkKeys, describeKeyWarnings, type CrtKeyWarnings } from '../../utils/crt/crtWarnings';
import {
  buildKeyChips,
  buildKeyRowFlags,
  cellTooltip,
  KEY_WARN_BLANK,
  KEY_WARN_DUPLICATE,
  KEY_WARN_NONE,
  KEY_WARN_TITLE,
  nextFlaggedRow,
} from '../../utils/crt/crtWarningsView';

const warnings = (over: Partial<CrtKeyWarnings> = {}): CrtKeyWarnings => ({
  blankRows: [],
  duplicateRows: [],
  duplicateKeyCount: 0,
  ...over,
});

const keysOf = (keys: string[]) => checkKeys((r) => keys[r], keys.length);

describe('buildKeyRowFlags', () => {
  it('is empty for a clean table', () => {
    expect(buildKeyRowFlags(warnings()).size).toBe(0);
  });

  it('flags blank rows and duplicate rows and nothing else', () => {
    const flags = buildKeyRowFlags(keysOf(['a', '', 'b', 'a', '  ', 'c']));
    expect(flags.get(1)).toBe(KEY_WARN_BLANK);
    expect(flags.get(4)).toBe(KEY_WARN_BLANK);
    expect(flags.get(0)).toBe(KEY_WARN_DUPLICATE);
    expect(flags.get(3)).toBe(KEY_WARN_DUPLICATE);
    expect(flags.has(2)).toBe(false);
    expect(flags.has(5)).toBe(false);
    expect(flags.size).toBe(4);
  });

  it('never gives a row both flags: a blank key is not a duplicate of another blank key', () => {
    const flags = buildKeyRowFlags(keysOf(['', '', 'x']));
    expect([...flags.entries()]).toEqual([
      [0, KEY_WARN_BLANK],
      [1, KEY_WARN_BLANK],
    ]);
  });

  it('keeps the flags distinct from the no warning value', () => {
    expect(KEY_WARN_NONE).toBe(0);
    expect(new Set([KEY_WARN_NONE, KEY_WARN_BLANK, KEY_WARN_DUPLICATE]).size).toBe(3);
  });
});

describe('buildKeyChips', () => {
  it('gives no chips for a clean table', () => {
    expect(buildKeyChips(warnings())).toEqual([]);
    expect(buildKeyChips(keysOf(['a', 'b', 'c']))).toEqual([]);
  });

  it('gives a blank chip with the blank rows', () => {
    const w = keysOf(['a', '', 'b', ' ']);
    const chips = buildKeyChips(w);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ kind: 'blank', label: '2 blank keys', rows: [1, 3] });
    expect(chips[0].title).toMatch(/blank key/);
  });

  it('gives a duplicate chip with the duplicate rows', () => {
    const w = keysOf(['a', 'b', 'A', 'c', 'b']);
    const chips = buildKeyChips(w);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ kind: 'duplicate', label: '2 duplicate keys', rows: [0, 1, 2, 4] });
    expect(chips[0].title).toMatch(/duplicate key/);
  });

  it('puts the blank chip first when both are needed', () => {
    const chips = buildKeyChips(keysOf(['a', '', 'a']));
    expect(chips.map((c) => c.kind)).toEqual(['blank', 'duplicate']);
    expect(chips.map((c) => c.label)).toEqual(['1 blank key', '1 duplicate key']);
  });

  it('says the same thing as describeKeyWarnings, in the same order', () => {
    const cases = [
      keysOf([]),
      keysOf(['a', 'b']),
      keysOf(['']),
      keysOf(['a', 'a']),
      keysOf(['', 'x', 'y', 'x', 'y', '  ']),
      keysOf(['k', 'K', 'k', '', 'z']),
    ];
    for (const w of cases) {
      expect(buildKeyChips(w).map((c) => c.label)).toEqual(describeKeyWarnings(w));
    }
  });

  it('counts duplicate keys, not rows, in the label', () => {
    const chips = buildKeyChips(keysOf(['a', 'a', 'a', 'a']));
    expect(chips[0].label).toBe('1 duplicate key');
    expect(chips[0].rows).toHaveLength(4);
  });
});

describe('nextFlaggedRow', () => {
  const rows = [3, 8, 20];

  it('returns the first flagged row after the active row', () => {
    expect(nextFlaggedRow(rows, 0)).toBe(3);
    expect(nextFlaggedRow(rows, 3)).toBe(8);
    expect(nextFlaggedRow(rows, 5)).toBe(8);
    expect(nextFlaggedRow(rows, 8)).toBe(20);
    expect(nextFlaggedRow(rows, 19)).toBe(20);
  });

  it('is strictly after: standing on a flagged row moves on', () => {
    expect(nextFlaggedRow(rows, 3)).not.toBe(3);
  });

  it('wraps around to the first flagged row', () => {
    expect(nextFlaggedRow(rows, 20)).toBe(3);
    expect(nextFlaggedRow(rows, 500)).toBe(3);
  });

  it('lands on the only flagged row from anywhere, including when standing on it', () => {
    expect(nextFlaggedRow([7], 0)).toBe(7);
    expect(nextFlaggedRow([7], 7)).toBe(7);
    expect(nextFlaggedRow([7], 9)).toBe(7);
  });

  it('returns -1 when no row is flagged', () => {
    expect(nextFlaggedRow([], 0)).toBe(-1);
  });

  it('works from before the first row', () => {
    expect(nextFlaggedRow(rows, -1)).toBe(3);
  });

  it('visits every flagged row once in order before it wraps, on a long list', () => {
    const many = Array.from({ length: 2500 }, (_, i) => i * 4 + 1);
    let at = -1;
    const seen: number[] = [];
    for (let i = 0; i < many.length; i++) {
      at = nextFlaggedRow(many, at);
      seen.push(at);
    }
    expect(seen).toEqual(many);
    expect(nextFlaggedRow(many, at)).toBe(many[0]);
  });
});

describe('cellTooltip', () => {
  it('keeps the old behaviour for a plain cell: the text when it is long, otherwise nothing', () => {
    expect(cellTooltip(false, 'short', null, KEY_WARN_NONE)).toBeUndefined();
    expect(cellTooltip(true, 'a long cell text that is clipped', null, KEY_WARN_NONE)).toBe(
      'a long cell text that is clipped'
    );
  });

  it('says what is wrong with a blank key', () => {
    expect(cellTooltip(false, '', null, KEY_WARN_BLANK)).toBe('Blank key');
  });

  it('says what is wrong with a duplicate key', () => {
    expect(cellTooltip(false, 'k', null, KEY_WARN_DUPLICATE)).toBe(
      'Duplicate key (this key appears more than once)'
    );
  });

  it('names the edge space of a cell', () => {
    expect(cellTooltip(false, ' a', markEdgeSpaces(' a'), KEY_WARN_NONE)).toBe('Leading space');
    expect(cellTooltip(false, 'a ', markEdgeSpaces('a '), KEY_WARN_NONE)).toBe('Trailing space');
    expect(cellTooltip(false, ' a ', markEdgeSpaces(' a '), KEY_WARN_NONE)).toBe('Leading and trailing space');
  });

  it('puts the key warning before the edge space note', () => {
    expect(cellTooltip(false, 'a ', markEdgeSpaces('a '), KEY_WARN_DUPLICATE)).toBe(
      'Duplicate key (this key appears more than once)\nTrailing space'
    );
    expect(cellTooltip(false, '  ', markEdgeSpaces('  '), KEY_WARN_BLANK)).toBe('Blank key\nOnly whitespace');
  });

  it('starts with the full text when it is long, then the notes', () => {
    const text = '  a long cell text that is clipped  ';
    expect(cellTooltip(true, text, markEdgeSpaces(text), KEY_WARN_NONE)).toBe(`${text}\nLeading and trailing space`);
    expect(cellTooltip(true, text, markEdgeSpaces(text), KEY_WARN_DUPLICATE)).toBe(
      `${text}\n${KEY_WARN_TITLE[KEY_WARN_DUPLICATE]}\nLeading and trailing space`
    );
  });

  it('ignores a flag value it does not know', () => {
    expect(cellTooltip(false, 'k', null, 99)).toBeUndefined();
  });
});
