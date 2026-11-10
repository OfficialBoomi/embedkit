/**
 * @file crtHistory.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The two history lines of the cross reference table screen: the exact wording, the date format,
 * finding the record of one table, and reading the server's answer without trusting its shape.
 * Dates are compared with the same formatter the code uses, so the tests do not depend on the time
 * zone or the language of the machine that runs them.
 */
import { describe, it, expect } from 'vitest';
import {
  ENVIRONMENT_HISTORY_HINT,
  findTableHistory,
  formatEnvironmentHistory,
  formatHistoryDate,
  formatTableHistory,
  readHistory,
} from '../../utils/crt/crtHistory';
import type { CrossReferenceTableHistory } from '../../service/crossReferenceTables.service';

const ISO = '2026-11-09T22:40:00Z';
const shown = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

const entry = (over: Partial<CrossReferenceTableHistory> = {}): CrossReferenceTableHistory => ({
  processId: 'p1',
  tableId: 't1',
  at: ISO,
  by: 'sam@example.com',
  action: 'save',
  rowCount: 6,
  ...over,
});

describe('formatHistoryDate', () => {
  it('uses the medium date and short time style of the viewer', () => {
    expect(formatHistoryDate(ISO)).toBe(shown(ISO));
  });

  it('shows text that is not a date as it came', () => {
    expect(formatHistoryDate('last Tuesday')).toBe('last Tuesday');
    expect(formatHistoryDate('')).toBe('');
  });
});

describe('formatTableHistory', () => {
  it('says who saved, when, and how many rows', () => {
    expect(formatTableHistory(entry())).toBe(`Last saved from this screen by sam@example.com on ${shown(ISO)}, 6 rows`);
  });

  it('uses the singular for one row and the plural for none', () => {
    expect(formatTableHistory(entry({ rowCount: 1 }))).toMatch(/, 1 row$/);
    expect(formatTableHistory(entry({ rowCount: 0 }))).toMatch(/, 0 rows$/);
  });

  it('says the defaults were restored after a reset, with no row count', () => {
    expect(formatTableHistory(entry({ action: 'reset', rowCount: 0 }))).toBe(
      `Defaults restored from this screen by sam@example.com on ${shown(ISO)}`
    );
  });

  it('leaves the name out, with no gap, when the record has none', () => {
    expect(formatTableHistory(entry({ by: '' }))).toBe(`Last saved from this screen on ${shown(ISO)}, 6 rows`);
    expect(formatTableHistory(entry({ by: '  ', action: 'reset' }))).toBe(`Defaults restored from this screen on ${shown(ISO)}`);
  });

  it('shows an unreadable date as it came', () => {
    expect(formatTableHistory(entry({ at: 'sometime' }))).toBe('Last saved from this screen by sam@example.com on sometime, 6 rows');
  });
});

describe('formatEnvironmentHistory', () => {
  it('says "via UI" for a save made in the Boomi user interface', () => {
    expect(formatEnvironmentHistory({ at: ISO, by: 'sam@example.com', viaUi: true })).toBe(
      `Last saved by sam@example.com on ${shown(ISO)}, via UI`
    );
  });

  it('says "not via UI" for any other save', () => {
    expect(formatEnvironmentHistory({ at: ISO, by: 'svc@example.com', viaUi: false })).toBe(
      `Last saved by svc@example.com on ${shown(ISO)}, not via UI`
    );
  });

  it('leaves the name out, with no gap, when there is none', () => {
    expect(formatEnvironmentHistory({ at: ISO, by: '', viaUi: true })).toBe(`Last saved on ${shown(ISO)}, via UI`);
  });

  it('shows an unreadable date as it came', () => {
    expect(formatEnvironmentHistory({ at: 'sometime', by: 'a', viaUi: false })).toBe('Last saved by a on sometime, not via UI');
  });
});

describe('the words shown', () => {
  it('never contain the word API, whatever the record says', () => {
    const lines = [
      formatTableHistory(entry()),
      formatTableHistory(entry({ action: 'reset' })),
      formatEnvironmentHistory({ at: ISO, by: 'someone', viaUi: true }),
      formatEnvironmentHistory({ at: ISO, by: 'someone', viaUi: false }),
      ENVIRONMENT_HISTORY_HINT,
    ];
    for (const line of lines) expect(line).not.toMatch(/\bapi\b/i);
  });

  it('keeps the tooltip wording for the environment line', () => {
    expect(ENVIRONMENT_HISTORY_HINT).toBe('Boomi records this for the whole environment, not for one table.');
  });
});

describe('findTableHistory', () => {
  const tables = [entry({ processId: 'p1', tableId: 't1' }), entry({ processId: 'p2', tableId: 't1', by: 'other' })];

  it('finds the record of one table of one process', () => {
    expect(findTableHistory(tables, 'p2', 't1')?.by).toBe('other');
  });

  it('is null when that process and table have no record, even if the table id is used elsewhere', () => {
    expect(findTableHistory(tables, 'p3', 't1')).toBeNull();
    expect(findTableHistory(tables, 'p1', 't9')).toBeNull();
  });

  it('is null for no list at all', () => {
    expect(findTableHistory([], 'p1', 't1')).toBeNull();
    expect(findTableHistory(null, 'p1', 't1')).toBeNull();
    expect(findTableHistory(undefined, 'p1', 't1')).toBeNull();
  });
});

describe('readHistory', () => {
  it('keeps a good answer as it is', () => {
    const answer = {
      environment: { at: ISO, by: 'sam@example.com', viaUi: true },
      tables: [entry(), entry({ processId: 'p2', action: 'reset', rowCount: 0 })],
    };
    expect(readHistory(answer)).toEqual(answer);
  });

  it('accepts an answer with no environment and no tables', () => {
    expect(readHistory({ environment: null, tables: [] })).toEqual({ environment: null, tables: [] });
    expect(readHistory({})).toEqual({ environment: null, tables: [] });
  });

  it('gives nothing for an answer that is not an object', () => {
    for (const bad of [null, undefined, 'text', 7, [], true]) expect(readHistory(bad)).toBeNull();
  });

  it('drops a table entry it cannot read and keeps the others', () => {
    const read = readHistory({
      environment: null,
      tables: [
        entry(),
        null,
        'x',
        { tableId: 't', at: ISO, rowCount: 1 },
        { processId: 'p', at: ISO, rowCount: 1 },
        { processId: 'p', tableId: 't', rowCount: 1 },
        { processId: 'p', tableId: 't', at: ISO, rowCount: '3' },
        { processId: 'p', tableId: 't', at: ISO, rowCount: Number.NaN },
      ],
    });
    expect(read?.tables).toEqual([entry()]);
  });

  it('treats a table list that is not a list as empty', () => {
    expect(readHistory({ environment: null, tables: { a: 1 } })?.tables).toEqual([]);
  });

  it('turns an unknown action into a save and a missing name into a blank one', () => {
    const read = readHistory({ tables: [{ processId: 'p', tableId: 't', at: ISO, rowCount: 2, action: 'merge' }] });
    expect(read?.tables[0]).toEqual({ processId: 'p', tableId: 't', at: ISO, by: '', action: 'save', rowCount: 2 });
  });

  it('drops an environment it cannot read, and counts only an exact true as "via UI"', () => {
    expect(readHistory({ environment: { by: 'x', viaUi: true } })?.environment).toBeNull();
    expect(readHistory({ environment: 'yesterday' })?.environment).toBeNull();
    expect(readHistory({ environment: { at: ISO, by: 'x', viaUi: 'true' } })?.environment).toEqual({ at: ISO, by: 'x', viaUi: false });
    expect(readHistory({ environment: { at: ISO } })?.environment).toEqual({ at: ISO, by: '', viaUi: false });
  });
});
