/**
 * @file crtHistory.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The one quiet line of the cross reference table screen that says when the open table was last saved
 * and by whom. It is worked out from two records: ours (saves made through the plugin, per table) and
 * Boomi's (the last save of the whole environment, whoever made it). Pure text and data, no React and
 * no fetching, so it can be tested without a server.
 *
 * The line shows a date, a time and a user, nothing else: no account id, no row count and no word about
 * how the save was made.
 */
import type {
  CrossReferenceEnvironmentHistory,
  CrossReferenceHistoryResponse,
  CrossReferenceTableHistory,
} from '../../service/crossReferenceTables.service';

/** The tooltip of a line that comes from Boomi alone: that record is about the whole environment, not one table. */
export const ENVIRONMENT_HISTORY_HINT = 'Boomi records this for the whole environment, not for one table.';

/** A date and time in the viewer's own format. Text that is not a date is shown as it came. */
export function formatHistoryDate(raw: string): string {
  const text = typeof raw === 'string' ? raw : '';
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** " by <name>" when there is a name, nothing when the name is blank, so the line never has a gap. */
const byPart = (by: string): string => (by && by.trim() ? ` by ${by.trim()}` : '');

/** Our own record of a save and Boomi's record of the same save are this close in time (seconds apart in practice). */
const SAME_SAVE_MS = 2 * 60 * 1000;
/** A Boomi save newer than ours by more than this was made by someone else. */
const SOMEONE_ELSE_MS = 60 * 1000;

/** What the screen says about one table: when it was last saved, and by whom when that is known. */
export interface TableHistoryLine {
  /** When, ISO 8601. */
  at: string;
  /** The user (an email address from Boomi, or the host's user id). Blank when nobody is known. */
  by: string;
  action: 'save' | 'reset';
  /** True when the save was made in the Boomi user interface. Kept for later use: the line does not say it. */
  viaUi: boolean;
  /** True when the line comes from Boomi alone, which records saves per environment and not per table. */
  environmentWide: boolean;
}

const time = (iso: string): number => new Date(iso).getTime();

/**
 * One line for one table, from the two records the server sends.
 *
 * - With our own record of the table (a save or reset made through the plugin): its time. The user is the
 *   one Boomi names for the save made at that moment (the plugin's session knows no person), else the host's
 *   user id when there is one, else nobody. If Boomi shows a newer save made in its own user interface, someone
 *   else changed the environment since, and that save is shown instead.
 * - Without our record: Boomi's last save of the environment, but only for a table that has rows of its own,
 *   because a table on the defaults has never been saved.
 */
export function mergeTableHistory(
  entry: CrossReferenceTableHistory | null,
  env: CrossReferenceEnvironmentHistory | null,
  overridden: boolean
): TableHistoryLine | null {
  if (entry) {
    const mine = time(entry.at);
    const theirs = env ? time(env.at) : NaN;
    if (env && env.viaUi && Number.isFinite(theirs) && Number.isFinite(mine) && theirs - mine > SOMEONE_ELSE_MS) {
      return { at: env.at, by: env.by, action: 'save', viaUi: true, environmentWide: true };
    }
    const sameSave = env && Number.isFinite(theirs) && Number.isFinite(mine) && Math.abs(theirs - mine) <= SAME_SAVE_MS;
    return {
      at: entry.at,
      by: sameSave ? env.by : entry.by,
      action: entry.action,
      viaUi: sameSave ? env.viaUi : false,
      environmentWide: false,
    };
  }
  if (env && overridden) {
    return { at: env.at, by: env.by, action: 'save', viaUi: env.viaUi, environmentWide: true };
  }
  return null;
}

/** The words of the line. It never says how the save was made. */
export function formatTableHistoryLine(line: TableHistoryLine): string {
  const when = formatHistoryDate(line.at);
  return line.action === 'reset'
    ? `Defaults restored${byPart(line.by)} on ${when}`
    : `Last saved${byPart(line.by)} on ${when}`;
}

/** The record of one table of one process, or null when the screen has none for it. */
export function findTableHistory(
  tables: readonly CrossReferenceTableHistory[] | null | undefined,
  processId: string,
  tableId: string
): CrossReferenceTableHistory | null {
  return tables?.find((t) => t.processId === processId && t.tableId === tableId) ?? null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readTable(raw: unknown): CrossReferenceTableHistory | null {
  if (!isObject(raw)) return null;
  const { processId, tableId, at, by, action, rowCount } = raw;
  if (typeof processId !== 'string' || typeof tableId !== 'string' || typeof at !== 'string') return null;
  if (typeof rowCount !== 'number' || !Number.isFinite(rowCount)) return null;
  return {
    processId,
    tableId,
    at,
    by: typeof by === 'string' ? by : '',
    action: action === 'reset' ? 'reset' : 'save',
    rowCount,
  };
}

function readEnvironment(raw: unknown): CrossReferenceEnvironmentHistory | null {
  if (!isObject(raw) || typeof raw.at !== 'string') return null;
  return { at: raw.at, by: typeof raw.by === 'string' ? raw.by : '', viaUi: raw.viaUi === true };
}

/**
 * Takes the server's answer and keeps what can be shown. An entry that is not readable is dropped,
 * and an answer that is not an object at all is null, so a strange answer shows nothing and breaks
 * nothing.
 */
export function readHistory(raw: unknown): CrossReferenceHistoryResponse | null {
  if (!isObject(raw)) return null;
  const tables = Array.isArray(raw.tables) ? raw.tables.map(readTable).filter((t): t is CrossReferenceTableHistory => t !== null) : [];
  return { environment: readEnvironment(raw.environment), tables };
}
