/**
 * @file crtHistory.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The history line of the cross reference table screen: the exact wording, how our record and Boomi's
 * are merged into one line, the date format, finding the record of one table, and reading the server's
 * answer without trusting its shape.
 * Dates are compared with the same formatter the code uses, so the tests do not depend on the time
 * zone or the language of the machine that runs them.
 */
import { describe, it, expect } from 'vitest';
import {
  ENVIRONMENT_HISTORY_HINT,
  findTableHistory,
  formatHistoryDate,
  formatTableHistoryLine,
  mergeTableHistory,
  readHistory,
  type TableHistoryLine,
} from '../../utils/crt/crtHistory';
import type { CrossReferenceEnvironmentHistory, CrossReferenceTableHistory } from '../../service/crossReferenceTables.service';

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

const env = (over: Partial<CrossReferenceEnvironmentHistory> = {}): CrossReferenceEnvironmentHistory => ({
  at: ISO,
  by: 'boomi.user@example.com',
  viaUi: false,
  ...over,
});
const later = (secs: number) => new Date(Date.parse(ISO) + secs * 1000).toISOString();

describe('formatTableHistoryLine', () => {
  const line = (over: Partial<TableHistoryLine> = {}): TableHistoryLine => ({
    at: ISO,
    by: 'sam@example.com',
    action: 'save',
    viaUi: false,
    environmentWide: false,
    ...over,
  });

  it('says who saved and when, and nothing else', () => {
    expect(formatTableHistoryLine(line())).toBe(`Last saved by sam@example.com on ${shown(ISO)}`);
  });

  it('says the defaults were restored after a reset', () => {
    expect(formatTableHistoryLine(line({ action: 'reset' }))).toBe(`Defaults restored by sam@example.com on ${shown(ISO)}`);
  });

  it('leaves the user out, with no gap, when nobody is known', () => {
    expect(formatTableHistoryLine(line({ by: '' }))).toBe(`Last saved on ${shown(ISO)}`);
    expect(formatTableHistoryLine(line({ by: '   ' }))).toBe(`Last saved on ${shown(ISO)}`);
  });

  it('does not say how the save was made, whatever the flag says', () => {
    expect(formatTableHistoryLine(line({ viaUi: true }))).toBe(formatTableHistoryLine(line({ viaUi: false })));
    for (const text of [formatTableHistoryLine(line({ viaUi: true })), formatTableHistoryLine(line({ action: 'reset' }))]) {
      expect(text).not.toMatch(/api|via ui|rows?\b|screen|account/i);
    }
  });

  it('shows an unreadable date as it came', () => {
    expect(formatTableHistoryLine(line({ at: 'sometime' }))).toBe('Last saved by sam@example.com on sometime');
  });

  it('keeps the tooltip wording for a line that comes from Boomi alone', () => {
    expect(ENVIRONMENT_HISTORY_HINT).toBe('Boomi records this for the whole environment, not for one table.');
  });
});

describe('mergeTableHistory', () => {
  it('with our record: its time, and the user Boomi names for the save made at that moment', () => {
    const merged = mergeTableHistory(entry({ by: '' }), env({ at: later(2) }), true);
    expect(merged).toEqual({ at: ISO, by: 'boomi.user@example.com', action: 'save', viaUi: false, environmentWide: false });
  });

  it('with our record and no Boomi record: our time and the host user id when there is one', () => {
    expect(mergeTableHistory(entry({ by: 'host-user' }), null, true)).toMatchObject({ at: ISO, by: 'host-user' });
    expect(mergeTableHistory(entry({ by: '' }), null, true)).toMatchObject({ at: ISO, by: '' });
  });

  it('with our record and a Boomi record of a different moment: the user is not taken from it', () => {
    // An API save of another table a few minutes later must not be shown as this table's user.
    expect(mergeTableHistory(entry({ by: '' }), env({ at: later(600) }), true)).toMatchObject({ at: ISO, by: '' });
    expect(mergeTableHistory(entry({ by: 'host-user' }), env({ at: later(-600) }), true)).toMatchObject({ by: 'host-user' });
  });

  describe('the user: Boomi\'s only when it names one', () => {
    it('a blank Boomi user keeps the user of our record', () => {
      expect(mergeTableHistory(entry({ by: 'host-user' }), env({ at: later(2), by: '' }), true)).toMatchObject({ by: 'host-user' });
      expect(mergeTableHistory(entry({ by: 'host-user' }), env({ at: later(-30), by: '   ' }), true)).toMatchObject({ by: 'host-user' });
    });

    it('a Boomi user for the same save wins over the one in our record', () => {
      expect(mergeTableHistory(entry({ by: 'host-user' }), env({ at: later(2) }), true)).toMatchObject({ by: 'boomi.user@example.com' });
    });

    it('both blank is blank, so the line has no "by"', () => {
      const merged = mergeTableHistory(entry({ by: '' }), env({ at: later(2), by: '' }), true) as TableHistoryLine;
      expect(merged.by).toBe('');
      expect(formatTableHistoryLine(merged)).toBe(`Last saved on ${shown(ISO)}`);
    });

    it('still takes the viaUi flag of the same save when its user is blank', () => {
      expect(mergeTableHistory(entry({ by: 'host-user' }), env({ at: later(1), by: '', viaUi: true }), true)).toMatchObject({
        by: 'host-user',
        viaUi: true,
      });
    });
  });

  describe('the same save: Boomi stamps first, up to 90 seconds before our record or up to 10 after it', () => {
    const boomiAt = (secs: number) => env({ at: later(secs), by: 'boomi.user@example.com' });
    const sameAs = (secs: number) =>
      (mergeTableHistory(entry({ by: 'host-user' }), boomiAt(secs), true) as TableHistoryLine).by === 'boomi.user@example.com';

    it('Boomi\'s entry shortly before ours is the same save', () => {
      expect(sameAs(-1)).toBe(true);
      expect(sameAs(-20)).toBe(true);
      expect(sameAs(-60)).toBe(true);
    });

    it('90 seconds before is still the same save, 91 is not', () => {
      expect(sameAs(-90)).toBe(true);
      expect(sameAs(-91)).toBe(false);
    });

    it('Boomi\'s entry a few seconds after ours is the same save, up to 10 seconds', () => {
      expect(sameAs(0)).toBe(true);
      expect(sameAs(5)).toBe(true);
      expect(sameAs(10)).toBe(true);
      expect(sameAs(11)).toBe(false);
    });

    it('the old window of two minutes either way no longer counts', () => {
      expect(sameAs(100)).toBe(false);
      expect(sameAs(-100)).toBe(false);
      expect(sameAs(-119)).toBe(false);
      expect(sameAs(119)).toBe(false);
    });

    it('outside the window the user of our record stays', () => {
      expect(mergeTableHistory(entry({ by: 'host-user' }), boomiAt(-300), true)).toMatchObject({ by: 'host-user', viaUi: false });
    });

    it('a user interface entry a minute or more after ours is someone else\'s save and is shown instead', () => {
      const other = (secs: number) => env({ at: later(secs), by: 'other.person@example.com', viaUi: true });
      expect(mergeTableHistory(entry({ by: 'host-user' }), other(10), true)).toMatchObject({ by: 'other.person@example.com', environmentWide: false });
      expect(mergeTableHistory(entry({ by: 'host-user' }), other(60), true)).toMatchObject({ environmentWide: false });
      expect(mergeTableHistory(entry({ by: 'host-user' }), other(61), true)).toMatchObject({
        at: later(61),
        by: 'other.person@example.com',
        environmentWide: true,
      });
    });

    it('between the two, 11 to 60 seconds after ours, it is neither: our line stays and takes no user from Boomi', () => {
      const between = env({ at: later(30), by: 'other.person@example.com', viaUi: true });
      expect(mergeTableHistory(entry({ by: 'host-user' }), between, true)).toEqual({
        at: ISO,
        by: 'host-user',
        action: 'save',
        viaUi: false,
        environmentWide: false,
      });
    });
  });

  describe('a Boomi record with no date', () => {
    it('is no record: our line is used as it is', () => {
      const merged = mergeTableHistory(entry({ by: 'host-user' }), env({ at: '', by: 'boomi.user@example.com', viaUi: true }), true);
      expect(merged).toEqual({ at: ISO, by: 'host-user', action: 'save', viaUi: false, environmentWide: false });
    });

    it('gives no line of its own for a table without our record', () => {
      expect(mergeTableHistory(null, env({ at: '' }), true)).toBeNull();
      expect(mergeTableHistory(null, env({ at: '   ' }), true)).toBeNull();
    });
  });

  it('keeps our reset as a reset', () => {
    expect(mergeTableHistory(entry({ action: 'reset', rowCount: 0 }), env({ at: later(1) }), false)).toMatchObject({ action: 'reset', at: ISO });
  });

  it('a newer save made in the Boomi user interface means someone else changed it: that save is shown', () => {
    const merged = mergeTableHistory(entry(), env({ at: later(3600), by: 'other.person@example.com', viaUi: true }), true);
    expect(merged).toEqual({ at: later(3600), by: 'other.person@example.com', action: 'save', viaUi: true, environmentWide: true });
  });

  it('a newer save that was not made in the user interface does not replace our record', () => {
    const merged = mergeTableHistory(entry(), env({ at: later(3600), viaUi: false }), true);
    expect(merged).toMatchObject({ at: ISO, environmentWide: false });
  });

  it('a user interface save only seconds after ours is the same moment, not someone else', () => {
    expect(mergeTableHistory(entry({ by: '' }), env({ at: later(5), viaUi: true }), true)).toMatchObject({ at: ISO, by: 'boomi.user@example.com' });
  });

  it('without our record: Boomi\'s last save of the environment, for a table that has rows of its own', () => {
    expect(mergeTableHistory(null, env({ viaUi: true }), true)).toEqual({
      at: ISO,
      by: 'boomi.user@example.com',
      action: 'save',
      viaUi: true,
      environmentWide: true,
    });
  });

  it('without our record, a table on the defaults has never been saved: no line', () => {
    expect(mergeTableHistory(null, env(), false)).toBeNull();
  });

  it('no record of either kind: no line', () => {
    expect(mergeTableHistory(null, null, true)).toBeNull();
    expect(mergeTableHistory(null, null, false)).toBeNull();
  });

  it('copes with a date it cannot read: our record wins, nothing breaks', () => {
    expect(mergeTableHistory(entry({ at: 'sometime', by: 'host-user' }), env(), true)).toMatchObject({ at: 'sometime', by: 'host-user' });
    expect(mergeTableHistory(entry(), env({ at: 'later', viaUi: true }), true)).toMatchObject({ at: ISO });
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

  it('drops an environment whose date is empty, so the line never reads "on " with nothing after it', () => {
    expect(readHistory({ environment: { at: '', by: 'x', viaUi: true } })?.environment).toBeNull();
    expect(readHistory({ environment: { at: '   ', by: 'x' } })?.environment).toBeNull();
    // The tables of the answer are kept.
    expect(readHistory({ environment: { at: '' }, tables: [entry()] })).toEqual({ environment: null, tables: [entry()] });
  });

  it('drops an environment it cannot read, and counts only an exact true as "via UI"', () => {
    expect(readHistory({ environment: { by: 'x', viaUi: true } })?.environment).toBeNull();
    expect(readHistory({ environment: 'yesterday' })?.environment).toBeNull();
    expect(readHistory({ environment: { at: ISO, by: 'x', viaUi: 'true' } })?.environment).toEqual({ at: ISO, by: 'x', viaUi: false });
    expect(readHistory({ environment: { at: ISO } })?.environment).toEqual({ at: ISO, by: '', viaUi: false });
  });
});
