/**
 * @file crtHistory.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The two quiet lines of the cross reference table screen that say who changed things: one for the
 * open table (only saves made through this screen are known) and one for the whole environment (the
 * last save Boomi recorded, whoever made it). Pure text and data, no React and no fetching, so it
 * can be tested without a server.
 *
 * The wording is fixed. The environment line says only whether the save came from the Boomi user
 * interface, never anything else about how it was made.
 */
import type {
  CrossReferenceEnvironmentHistory,
  CrossReferenceHistoryResponse,
  CrossReferenceTableHistory,
} from '../../service/crossReferenceTables.service';

/** The tooltip of the environment line: that line is about the whole environment, not the open table. */
export const ENVIRONMENT_HISTORY_HINT = 'Boomi records this for the whole environment, not for one table.';

/** A date and time in the viewer's own format. Text that is not a date is shown as it came. */
export function formatHistoryDate(raw: string): string {
  const text = typeof raw === 'string' ? raw : '';
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** " by <name>" when there is a name, nothing when the name is blank, so the line never has a gap. */
const byPart = (by: string): string => (by && by.trim() ? ` by ${by}` : '');

/** The line for one table: its last save or reset made through this screen. */
export function formatTableHistory(entry: CrossReferenceTableHistory): string {
  const when = formatHistoryDate(entry.at);
  if (entry.action === 'reset') return `Defaults restored from this screen${byPart(entry.by)} on ${when}`;
  const rows = `${entry.rowCount} ${entry.rowCount === 1 ? 'row' : 'rows'}`;
  return `Last saved from this screen${byPart(entry.by)} on ${when}, ${rows}`;
}

/** The line for the environment: the last save Boomi recorded, and whether it was made in the Boomi user interface. */
export function formatEnvironmentHistory(env: CrossReferenceEnvironmentHistory): string {
  return `Last saved${byPart(env.by)} on ${formatHistoryDate(env.at)}, ${env.viaUi ? 'via UI' : 'not via UI'}`;
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
