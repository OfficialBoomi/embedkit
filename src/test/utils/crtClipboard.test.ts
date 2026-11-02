/**
 * @file crtClipboard.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for the cross reference table clipboard helpers: how cells are written as tab
 * separated text, how clipboard text from a spreadsheet is read, the exact round trip between
 * the two (including empty cells, tabs, quotes and line breaks), padding and cutting to the
 * column count, and reading a range through a cell getter.
 */
import { describe, it, expect } from 'vitest';
import { toTsv, parseClipboard, fitColumns, readMatrix } from '../../utils/crt/crtClipboard';

describe('toTsv', () => {
  it('joins cells with tabs and rows with LF, with no trailing break', () => {
    expect(
      toTsv([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('a\tb\nc\td');
  });

  it('writes a single value as it is', () => {
    expect(toTsv([['hello world, 1, 2']])).toBe('hello world, 1, 2');
  });

  it('gives an empty string for an empty matrix', () => {
    expect(toTsv([])).toBe('');
  });

  it('quotes a cell with a tab, CR, LF or double quote and doubles inner quotes', () => {
    expect(toTsv([['a\tb']])).toBe('"a\tb"');
    expect(toTsv([['a\nb']])).toBe('"a\nb"');
    expect(toTsv([['a\rb']])).toBe('"a\rb"');
    expect(toTsv([['say "hi"']])).toBe('"say ""hi"""');
    expect(toTsv([['"']])).toBe('""""');
  });

  it('does not quote commas, spaces or unicode', () => {
    expect(toTsv([['a, b', ' padded ', 'é\u{1f600}']])).toBe('a, b\t padded \té\u{1f600}');
  });

  it('writes empty cells as bare tabs', () => {
    expect(toTsv([['', '', '']])).toBe('\t\t');
    expect(toTsv([['a', '', 'c']])).toBe('a\t\tc');
    expect(toTsv([['', 'b']])).toBe('\tb');
  });

  it('writes a last row that is one empty cell as a quoted empty cell', () => {
    expect(toTsv([['']])).toBe('""');
    expect(toTsv([['a'], ['']])).toBe('a\n""');
    expect(toTsv([[''], ['']])).toBe('\n""');
  });

  it('leaves a single empty cell that is not in the last row as a blank line', () => {
    expect(toTsv([[''], ['a']])).toBe('\na');
  });

  it('does not change its input', () => {
    const m = [['a\tb', 'c']];
    toTsv(m);
    expect(m).toEqual([['a\tb', 'c']]);
  });
});

describe('parseClipboard', () => {
  it('gives no rows for an empty string', () => {
    expect(parseClipboard('')).toEqual([]);
  });

  it('reads text with no tab and no line break as one cell', () => {
    expect(parseClipboard('hello')).toEqual([['hello']]);
    expect(parseClipboard('hello world')).toEqual([['hello world']]);
    expect(parseClipboard('a, b, c')).toEqual([['a, b, c']]);
    expect(parseClipboard(' padded ')).toEqual([[' padded ']]);
  });

  it('splits on tabs and line breaks', () => {
    expect(parseClipboard('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('ignores one final line break, LF or CRLF', () => {
    expect(parseClipboard('a\tb\n')).toEqual([['a', 'b']]);
    expect(parseClipboard('a\tb\r\n')).toEqual([['a', 'b']]);
    expect(parseClipboard('a\n')).toEqual([['a']]);
  });

  it('handles CRLF between rows', () => {
    expect(parseClipboard('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps empty cells', () => {
    expect(parseClipboard('a\t\tc')).toEqual([['a', '', 'c']]);
    expect(parseClipboard('\t\t')).toEqual([['', '', '']]);
  });

  it('reads quoted cells the way spreadsheets write them', () => {
    expect(parseClipboard('"a\tb"\t"line1\nline2"\t"say ""hi"""')).toEqual([
      ['a\tb', 'line1\nline2', 'say "hi"'],
    ]);
  });

  it('keeps commas in the data and does not split on them', () => {
    expect(parseClipboard('1,5\t2,5')).toEqual([['1,5', '2,5']]);
  });

  it('does not trim cells', () => {
    expect(parseClipboard(' a \t b ')).toEqual([[' a ', ' b ']]);
  });

  it('does not force rows to one width', () => {
    expect(parseClipboard('a\tb\tc\nd')).toEqual([['a', 'b', 'c'], ['d']]);
  });

  it('reads a quoted empty cell as one empty cell', () => {
    expect(parseClipboard('""')).toEqual([['']]);
  });

  it('reads text that starts with a quote as a quoted cell, as a spreadsheet does', () => {
    expect(parseClipboard('"hi"')).toEqual([['hi']]);
  });
});

describe('round trip', () => {
  const roundTrips = (m: string[][]) => expect(parseClipboard(toTsv(m))).toEqual(m);

  it('holds for plain cells', () => {
    roundTrips([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    roundTrips([['only']]);
    roundTrips([['a'], ['b'], ['c']]);
  });

  it('holds for tabs, quotes and line breaks in cells', () => {
    roundTrips([['a\tb', 'say "hi"', 'x\ny', 'x\r\ny', 'x\ry', '"', '""', '"a"']]);
    roundTrips([['\t', '\n', '\r\n', '\t\n"']]);
    roundTrips([
      ['"\t"', '\n\n'],
      ['""', '\t\t'],
    ]);
  });

  it('holds for empty cells in every position', () => {
    roundTrips([['', 'b', '']]);
    roundTrips([
      ['', ''],
      ['a', ''],
      ['', 'b'],
    ]);
  });

  it('holds for a row of all empty cells', () => {
    roundTrips([['', '', '']]);
    roundTrips([
      ['a', 'b', 'c'],
      ['', '', ''],
    ]);
    roundTrips([
      ['', '', ''],
      ['a', 'b', 'c'],
    ]);
    roundTrips([
      ['', ''],
      ['', ''],
    ]);
  });

  it('holds for the single empty cell matrix', () => {
    roundTrips([['']]);
  });

  it('holds for one column that ends in, or is made of, empty cells', () => {
    roundTrips([['a'], ['']]);
    roundTrips([[''], ['']]);
    roundTrips([[''], ['a']]);
    roundTrips([[''], [''], ['']]);
    roundTrips([['a'], [''], ['b'], ['']]);
  });

  it('holds for a cell that starts with a byte order mark', () => {
    roundTrips([['﻿abc', 'd']]);
    roundTrips([['a', '﻿b']]);
  });

  it('holds for an empty matrix', () => {
    expect(parseClipboard(toTsv([]))).toEqual([]);
  });

  it('holds for text with spaces, commas and unicode', () => {
    roundTrips([[' a, b ', 'é\u{1f600}', '1,5']]);
  });

  it('holds for random matrices full of awkward characters', () => {
    // A small seeded generator keeps the test repeatable.
    let seed = 12345;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const pieces = ['', '', 'a', 'b c', ',', '\t', '\n', '\r', '\r\n', '"', '""', ' ', 'é'];
    const cell = () => {
      let s = '';
      const len = Math.floor(next() * 4);
      for (let i = 0; i < len; i++) s += pieces[Math.floor(next() * pieces.length)];
      return s;
    };
    for (let n = 0; n < 300; n++) {
      const rows = 1 + Math.floor(next() * 4);
      const cols = 1 + Math.floor(next() * 4);
      const m: string[][] = [];
      for (let r = 0; r < rows; r++) {
        const row: string[] = [];
        for (let c = 0; c < cols; c++) row.push(cell());
        m.push(row);
      }
      expect(parseClipboard(toTsv(m))).toEqual(m);
    }
  });

  it('holds for 10,000 rows of 20 cells', () => {
    const m: string[][] = [];
    for (let r = 0; r < 10000; r++) {
      const row: string[] = [];
      for (let c = 0; c < 20; c++) row.push(c % 7 === 0 ? `r${r}\tc${c}` : `r${r}c${c}`);
      m.push(row);
    }
    expect(parseClipboard(toTsv(m))).toEqual(m);
  });
});

describe('fitColumns', () => {
  it('leaves rows of the right width the same', () => {
    expect(fitColumns([['a', 'b']], 2)).toEqual({ rows: [['a', 'b']], cut: false });
  });

  it('pads short rows with empty cells without marking a cut', () => {
    expect(fitColumns([['a'], ['b', 'c']], 3)).toEqual({
      rows: [
        ['a', '', ''],
        ['b', 'c', ''],
      ],
      cut: false,
    });
  });

  it('cuts long rows and marks the cut', () => {
    expect(fitColumns([['a', 'b', 'c', 'd']], 2)).toEqual({ rows: [['a', 'b']], cut: true });
  });

  it('marks a cut when only one of several rows is too long', () => {
    const out = fitColumns([['a', 'b'], ['c', 'd', 'e'], ['f']], 2);
    expect(out.rows).toEqual([['a', 'b'], ['c', 'd'], ['f', '']]);
    expect(out.cut).toBe(true);
  });

  it('does not count dropped empty cells as a cut (trailing tabs carry nothing)', () => {
    expect(fitColumns([['a', '']], 1)).toEqual({ rows: [['a']], cut: false });
    expect(fitColumns([['a', '', '']], 1)).toEqual({ rows: [['a']], cut: false });
  });

  it('counts a dropped cell with content as a cut, even after empty ones', () => {
    expect(fitColumns([['a', '', 'x']], 1)).toEqual({ rows: [['a']], cut: true });
  });

  it('gives no rows for no input', () => {
    expect(fitColumns([], 4)).toEqual({ rows: [], cut: false });
  });

  it('gives empty rows for zero columns, and cut when cells were dropped', () => {
    expect(fitColumns([['a']], 0)).toEqual({ rows: [[]], cut: true });
    expect(fitColumns([[]], 0)).toEqual({ rows: [[]], cut: false });
  });

  it('returns new arrays and never changes or keeps the input', () => {
    const input = [['a', 'b']];
    const out = fitColumns(input, 2);
    expect(out.rows).not.toBe(input);
    expect(out.rows[0]).not.toBe(input[0]);
    out.rows[0][0] = 'changed';
    expect(input).toEqual([['a', 'b']]);
  });
});

describe('readMatrix', () => {
  const cellAt = (r: number, c: number) => `r${r}c${c}`;

  it('reads a block of cells row by row', () => {
    expect(readMatrix(cellAt, { r0: 1, c0: 2, r1: 2, c1: 4 })).toEqual([
      ['r1c2', 'r1c3', 'r1c4'],
      ['r2c2', 'r2c3', 'r2c4'],
    ]);
  });

  it('reads one cell', () => {
    expect(readMatrix(cellAt, { r0: 3, c0: 3, r1: 3, c1: 3 })).toEqual([['r3c3']]);
  });

  it('reads one row and one column', () => {
    expect(readMatrix(cellAt, { r0: 0, c0: 0, r1: 0, c1: 2 })).toEqual([['r0c0', 'r0c1', 'r0c2']]);
    expect(readMatrix(cellAt, { r0: 0, c0: 1, r1: 2, c1: 1 })).toEqual([['r0c1'], ['r1c1'], ['r2c1']]);
  });

  it('asks the getter for each cell exactly once', () => {
    const seen: string[] = [];
    readMatrix((r, c) => {
      seen.push(`${r},${c}`);
      return '';
    }, { r0: 0, c0: 0, r1: 1, c1: 1 });
    expect(seen).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });

  it('gives no rows for a range that ends before it starts', () => {
    expect(readMatrix(cellAt, { r0: 2, c0: 0, r1: 1, c1: 3 })).toEqual([]);
  });

  it('feeds toTsv for a copy', () => {
    const m = readMatrix(cellAt, { r0: 0, c0: 0, r1: 1, c1: 1 });
    expect(toTsv(m)).toBe('r0c0\tr0c1\nr1c0\tr1c1');
  });
});
