/**
 * @file crtWarnings.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for the key and whitespace checks on a cross reference table: blank and duplicate keys
 * (case insensitive, never trimmed), the edge space counts behind the cell marker, and the short
 * status lines built from the results.
 */
import { describe, it, expect } from 'vitest';
import {
  checkKeys,
  edgeSpaces,
  describeKeyWarnings,
  type CrtKeyWarnings,
} from '../../utils/crt/crtWarnings';

/** A getCell over a key column. Columns other than the first answer a fixed marker. */
const keyColumn = (keys: string[]) => (row: number, col: number) =>
  col === 0 ? keys[row] : 'other';

const warnings = (
  blankRows: number[],
  duplicateRows: number[],
  duplicateKeyCount: number,
): CrtKeyWarnings => ({ blankRows, duplicateRows, duplicateKeyCount });

describe('checkKeys', () => {
  it('reports nothing for distinct, non-blank keys', () => {
    expect(checkKeys(keyColumn(['apple', 'banana', 'cherry']), 3)).toEqual(
      warnings([], [], 0),
    );
  });

  it('reports nothing for an empty table', () => {
    expect(checkKeys(keyColumn([]), 0)).toEqual(warnings([], [], 0));
  });

  it('flags an empty first column as blank', () => {
    expect(checkKeys(keyColumn(['a', '', 'b']), 3)).toEqual(warnings([1], [], 0));
  });

  it('treats whitespace only keys as blank, including tabs, line breaks and NBSP', () => {
    const keys = ['   ', '\t', '\n', ' ', ' \r\n ', 'x'];
    expect(checkKeys(keyColumn(keys), keys.length)).toEqual(warnings([0, 1, 2, 3, 4], [], 0));
  });

  it('does not count blank keys as duplicates of each other', () => {
    expect(checkKeys(keyColumn(['', ' ', '\t']), 3)).toEqual(warnings([0, 1, 2], [], 0));
  });

  it('finds every row of a duplicated key, in ascending order', () => {
    // 'b' sits on rows 0, 2 and 5; 'a' on rows 1 and 4; 'c' is unique.
    expect(checkKeys(keyColumn(['b', 'a', 'b', 'c', 'a', 'b']), 6)).toEqual(
      warnings([], [0, 1, 2, 4, 5], 2),
    );
  });

  it('matches keys case insensitively', () => {
    expect(checkKeys(keyColumn(['Apple', 'APPLE', 'apple', 'Banana']), 4)).toEqual(
      warnings([], [0, 1, 2], 1),
    );
  });

  it('folds non-ASCII letters', () => {
    expect(checkKeys(keyColumn(['Café', 'CAFÉ']), 2)).toEqual(warnings([], [0, 1], 1));
  });

  it('folds with toLowerCase only, so the German sharp s is not read as ss', () => {
    expect(checkKeys(keyColumn(['Straße', 'STRASSE']), 2)).toEqual(warnings([], [], 0));
  });

  it('does not trim keys, so an edge space makes a different key', () => {
    // 'a' and 'A' match; 'a ' and ' a' are distinct from both and from each other.
    expect(checkKeys(keyColumn(['a', 'a ', ' a', 'A']), 4)).toEqual(warnings([], [0, 3], 1));
  });

  it('counts distinct duplicated keys, not duplicated rows', () => {
    expect(checkKeys(keyColumn(['x', 'x', 'x', 'y', 'y', 'z']), 6)).toEqual(
      warnings([], [0, 1, 2, 3, 4], 2),
    );
  });

  it('keeps the blank list and the duplicate list apart', () => {
    expect(checkKeys(keyColumn(['', 'a', 'a', ' ', 'b']), 5)).toEqual(
      warnings([0, 3], [1, 2], 1),
    );
  });

  it('reads only the first column', () => {
    const keys = ['a', 'b'];
    const getCell = (row: number, col: number) => (col === 0 ? keys[row] : 'a');
    expect(checkKeys(getCell, 2)).toEqual(warnings([], [], 0));
  });

  it('reads each row exactly once', () => {
    const keys = ['a', 'b', 'a', ''];
    let calls = 0;
    checkKeys((row, col) => {
      calls++;
      return keyColumn(keys)(row, col);
    }, keys.length);
    expect(calls).toBe(4);
  });

  it('checks 10,000 rows in under 200 ms', () => {
    // Every seventh row is blank. Key k is shared by rows k and k + 5000, so each duplicate key
    // covers exactly two rows.
    const keys = Array.from({ length: 10000 }, (_, i) => (i % 7 === 0 ? '' : `Key-${i % 5000}`));
    const start = performance.now();
    const result = checkKeys(keyColumn(keys), keys.length);
    const elapsed = performance.now() - start;
    expect(result.blankRows).toHaveLength(1429);
    expect(result.duplicateRows).toHaveLength(2 * result.duplicateKeyCount);
    expect(result.duplicateKeyCount).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });
});

describe('edgeSpaces', () => {
  it('is 0 and 0 for an empty cell', () => {
    expect(edgeSpaces('')).toEqual({ lead: 0, trail: 0 });
  });

  it('is 0 and 0 for text with no edge space', () => {
    expect(edgeSpaces('a')).toEqual({ lead: 0, trail: 0 });
    expect(edgeSpaces('a b')).toEqual({ lead: 0, trail: 0 });
  });

  it('counts leading spaces', () => {
    expect(edgeSpaces('  abc')).toEqual({ lead: 2, trail: 0 });
  });

  it('counts trailing spaces', () => {
    expect(edgeSpaces('abc   ')).toEqual({ lead: 0, trail: 3 });
  });

  it('counts both ends', () => {
    expect(edgeSpaces(' a ')).toEqual({ lead: 1, trail: 1 });
  });

  it('counts a mixed run of tabs, spaces and line breaks at each end', () => {
    expect(edgeSpaces(' \t a \r\n')).toEqual({ lead: 3, trail: 3 });
  });

  it('does not count spaces between words', () => {
    expect(edgeSpaces(' a  b ')).toEqual({ lead: 1, trail: 1 });
  });

  it('gives a whitespace only cell all of its length as lead and no trail', () => {
    expect(edgeSpaces('   ')).toEqual({ lead: 3, trail: 0 });
    expect(edgeSpaces('\t')).toEqual({ lead: 1, trail: 0 });
  });

  it('treats NBSP, tab and the byte order mark as whitespace', () => {
    expect(edgeSpaces(' a')).toEqual({ lead: 1, trail: 0 });
    expect(edgeSpaces('a\t')).toEqual({ lead: 0, trail: 1 });
    expect(edgeSpaces('﻿a')).toEqual({ lead: 1, trail: 0 });
  });

  it('does not treat a zero width space as whitespace', () => {
    expect(edgeSpaces('​a')).toEqual({ lead: 0, trail: 0 });
  });

  it('counts UTF-16 code units, so an emoji is never whitespace', () => {
    expect(edgeSpaces('🙂 ')).toEqual({ lead: 0, trail: 1 });
  });

  it('returns one shared frozen object for every cell with no edge space', () => {
    const clean = edgeSpaces('a');
    expect(edgeSpaces('b')).toBe(clean);
    expect(edgeSpaces('')).toBe(clean);
    expect(Object.isFrozen(clean)).toBe(true);
  });
});

describe('describeKeyWarnings', () => {
  it('is empty for a clean table', () => {
    expect(describeKeyWarnings(warnings([], [], 0))).toEqual([]);
  });

  it('says blank keys in the singular and the plural', () => {
    expect(describeKeyWarnings(warnings([4], [], 0))).toEqual(['1 blank key']);
    expect(describeKeyWarnings(warnings([0, 1, 2], [], 0))).toEqual(['3 blank keys']);
  });

  it('says duplicate keys in the singular and the plural', () => {
    expect(describeKeyWarnings(warnings([], [0, 1], 1))).toEqual(['1 duplicate key']);
    expect(describeKeyWarnings(warnings([], [0, 1, 2, 3], 2))).toEqual(['2 duplicate keys']);
  });

  it('counts duplicate keys, not duplicate rows', () => {
    expect(describeKeyWarnings(warnings([], [1, 2, 3, 4], 1))).toEqual(['1 duplicate key']);
  });

  it('lists blank keys before duplicate keys', () => {
    expect(describeKeyWarnings(warnings([0, 1, 2], [5, 6], 2))).toEqual([
      '3 blank keys',
      '2 duplicate keys',
    ]);
  });

  it('leaves out a kind whose count is zero', () => {
    expect(describeKeyWarnings(warnings([7], [], 0))).toEqual(['1 blank key']);
    expect(describeKeyWarnings(warnings([], [2, 3], 1))).toEqual(['1 duplicate key']);
  });

  it('uses a thousands separator for large counts', () => {
    const blanks = Array.from({ length: 1500 }, (_, i) => i);
    expect(describeKeyWarnings(warnings(blanks, [], 0))).toEqual(['1,500 blank keys']);
  });

  it('describes what checkKeys finds in one table', () => {
    const result = checkKeys(keyColumn(['', 'A', 'a', 'b']), 4);
    expect(describeKeyWarnings(result)).toEqual(['1 blank key', '1 duplicate key']);
  });
});
