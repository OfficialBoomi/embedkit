/**
 * @file parseCsv.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for the CSV and tab separated text reader behind pasting into the table editor: RFC 4180
 * quoting and record endings, the edge cases around blank lines and byte order marks, field values
 * kept exactly as written, and parse speed on a large file.
 */
import { describe, it, expect } from 'vitest';
import { parseCsv } from '../../utils/crt/parseCsv';

/** Builds `rows` lines of `cols` cells each, like r0c0,r0c1,... */
function bigCsv(rows: number, cols: number): string {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) cells.push(`r${r}c${c}`);
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}

describe('parseCsv', () => {
  it('reads simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('"Doe, Jane",42\n')).toEqual([['Doe, Jane', '42']]);
  });

  it('turns a doubled quote inside a quoted field into one quote', () => {
    expect(parseCsv('"say ""hi""",x\n')).toEqual([['say "hi"', 'x']]);
    expect(parseCsv('""""\n')).toEqual([['"']]);
  });

  it('keeps LF and CRLF line breaks inside a quoted field', () => {
    expect(parseCsv('"line1\nline2",x\n')).toEqual([['line1\nline2', 'x']]);
    expect(parseCsv('"a\r\nb",c\r\n')).toEqual([['a\r\nb', 'c']]);
  });

  it('accepts CRLF, LF and lone CR as record endings', () => {
    const expected = [
      ['a', 'b'],
      ['1', '2'],
    ];
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual(expected);
    expect(parseCsv('a,b\n1,2\n')).toEqual(expected);
    expect(parseCsv('a,b\r1,2\r')).toEqual(expected);
  });

  it('does not add an empty record for a final line break', () => {
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']]);
    expect(parseCsv('a,b\r\n')).toEqual([['a', 'b']]);
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
  });

  it('reads a line with only a line break in the middle as one empty field', () => {
    expect(parseCsv('a\n\nb')).toEqual([['a'], [''], ['b']]);
    expect(parseCsv('a\n\n')).toEqual([['a'], ['']]);
  });

  it('returns no records for empty text', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('drops a leading byte order mark', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('﻿')).toEqual([]);
  });

  it('keeps empty fields, quoted empty fields and all-empty rows', () => {
    expect(parseCsv('a,,c\n')).toEqual([['a', '', 'c']]);
    expect(parseCsv('"",x\n')).toEqual([['', 'x']]);
    expect(parseCsv(',,,\n')).toEqual([['', '', '', '']]);
    expect(parseCsv('a,\n')).toEqual([['a', '']]);
  });

  it('never trims spaces, tabs or emoji', () => {
    expect(parseCsv(' a , b\tc ,\u{1F600} x \n')).toEqual([[' a ', ' b\tc ', '\u{1F600} x ']]);
    expect(parseCsv('"  padded  ",x\n')).toEqual([['  padded  ', 'x']]);
  });

  it('keeps 255 and 1000 character values intact', () => {
    const short = 'x'.repeat(255);
    expect(parseCsv(`${short},z\n`)).toEqual([[short, 'z']]);

    // 1000 characters, with a comma, a quote and a line break inside the quoted field.
    const long = `${'x'.repeat(980)},"q"\n${'y'.repeat(15)}`;
    expect(long).toHaveLength(1000);
    const encoded = `"${long.replace(/"/g, '""')}"`;
    expect(parseCsv(`${encoded},end\n`)).toEqual([[long, 'end']]);
  });

  it('keeps a quote in the middle of an unquoted field as written', () => {
    expect(parseCsv('ab"c,d\n')).toEqual([['ab"c', 'd']]);
  });

  it('reads malformed quoting leniently', () => {
    // An unterminated quote runs to the end of the text.
    expect(parseCsv('"abc,def')).toEqual([['abc,def']]);
    // Text right after a closing quote is kept up to the next delimiter.
    expect(parseCsv('"a"b,c')).toEqual([['ab', 'c']]);
  });

  it('parses 10,000 rows of 20 columns in under a second', () => {
    const text = bigCsv(10000, 20);

    const started = performance.now();
    const records = parseCsv(text);
    const elapsed = performance.now() - started;

    expect(records).toHaveLength(10000);
    expect(records[0][0]).toBe('r0c0');
    expect(records[9999][19]).toBe('r9999c19');
    expect(elapsed).toBeLessThan(1000);
  });
});
