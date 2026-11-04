/**
 * @file crtLiveSource.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The live data source of the cross reference table screen: turns the server's answer into the
 * tables the screen shows. Pure data, no React and no fetching of its own (the caller passes the
 * fetch), so it can be tested without a server.
 *
 * The server lists one entry per process and table. An entry that cannot be edited here comes
 * back with a reason and no data; it is passed on as such. An entry that should have rows and does
 * not is treated the same way instead of failing the whole list.
 */
import type { CrtDataSource, CrtMatchType, CrtTableData } from './crtTypes';

/** One table of one process, as the server sends it. */
export interface CrtServerTable {
  id: string;
  name: string;
  processId: string;
  processName: string;
  /** True when this installation has its own rows for the table. */
  overridden: boolean;
  matchType?: CrtMatchType;
  columns?: string[];
  defaultRows?: string[][];
  /** The installation's rows, or null when not overridden. */
  overrideRows?: string[][] | null;
  unavailableReason?: string;
}

export interface CrtServerTablesResponse {
  tables: CrtServerTable[];
}

const MATCH_TYPES: readonly CrtMatchType[] = ['exact', 'wildcard', 'regex'];

export const UNEXPECTED_ANSWER = 'The server sent an unexpected answer for the cross reference tables.';
export const ROWS_MISSING_REASON = 'The server did not send its rows, so it cannot be edited here.';

/** A row with exactly one text cell per column. Returns the same array when it already is one. */
function fitRow(row: unknown, width: number): string[] {
  if (Array.isArray(row) && row.length === width && row.every((c) => typeof c === 'string')) return row;
  const cells = Array.isArray(row) ? row : [];
  return Array.from({ length: width }, (_, i) => (cells[i] == null ? '' : String(cells[i])));
}

const fitRows = (rows: unknown[], width: number): string[][] => rows.map((r) => fitRow(r, width));

/** Maps one server entry to the screen's table. A table that cannot be edited keeps its reason and has no data. */
export function mapServerTable(t: CrtServerTable): CrtTableData {
  const head = { id: t.id, name: t.name, processId: t.processId, processName: t.processName };
  const unavailable = (reason: string): CrtTableData => ({
    ...head,
    matchType: 'exact',
    columns: [],
    defaultRows: [],
    overrideRows: null,
    unavailableReason: reason,
  });

  if (t.unavailableReason) return unavailable(t.unavailableReason);
  const columns = Array.isArray(t.columns) ? t.columns.map((c) => String(c)) : [];
  if (!columns.length || !Array.isArray(t.defaultRows)) return unavailable(ROWS_MISSING_REASON);
  if (t.overridden && !Array.isArray(t.overrideRows)) return unavailable(ROWS_MISSING_REASON);

  return {
    ...head,
    matchType: t.matchType && MATCH_TYPES.includes(t.matchType) ? t.matchType : 'exact',
    columns,
    defaultRows: fitRows(t.defaultRows, columns.length),
    // An override of an empty table is still an override: an empty list, not null.
    overrideRows: t.overridden ? fitRows(t.overrideRows as unknown[], columns.length) : null,
  };
}

/** Maps the server's answer. Throws when the answer is not a list of tables at all. */
export function mapServerTables(response: unknown): CrtTableData[] {
  const tables = (response as { tables?: unknown } | null)?.tables;
  if (!Array.isArray(tables)) throw new Error(UNEXPECTED_ANSWER);
  return tables.map((t) => {
    if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || typeof t.processId !== 'string') {
      throw new Error(UNEXPECTED_ANSWER);
    }
    return mapServerTable({ ...t, processName: typeof t.processName === 'string' ? t.processName : '' });
  });
}

/** A data source that asks the server. `fetchTables` does the request. */
export function createLiveCrtDataSource(fetchTables: () => Promise<unknown>): CrtDataSource {
  return {
    listTables: async () => mapServerTables(await fetchTables()),
  };
}
