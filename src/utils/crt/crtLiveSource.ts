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
import type { CrtDataSource, CrtMatchType, CrtProcessData, CrtTableData } from './crtTypes';

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
  /** Fingerprint of the table's state, sent back with a save. Older servers do not send it. */
  stamp?: string;
}

export interface CrtServerTablesResponse {
  tables: CrtServerTable[];
  /** Every process of the pack, also those with no table. Older servers do not send it. */
  processes?: Array<{ id: string; name: string }>;
  /** What saving may send. Older servers do not send it. */
  limits?: { maxSaveBytes?: number };
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
  const head = {
    id: t.id,
    name: t.name,
    processId: t.processId,
    processName: t.processName,
    // Only a text stamp is meaningful; anything else is left out rather than guessed at.
    ...(typeof t.stamp === 'string' ? { stamp: t.stamp } : {}),
  };
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

export interface MapServerTablesOptions {
  /**
   * The pack's name. A multi install pack names each installed process "<pack name> - <process name>",
   * and the screen already shows the pack name, so it is dropped from the process name for display.
   * A process name that does not start that way, or would be left empty, is kept as it is.
   */
  processNamePrefix?: string;
}

/** The process name without the pack name that the platform puts in front of it. */
export function displayProcessName(name: string, packName?: string): string {
  const prefix = packName ? `${packName} - ` : '';
  return prefix && name.startsWith(prefix) && name.length > prefix.length ? name.slice(prefix.length) : name;
}

/** Maps the server's answer. Throws when the answer is not a list of tables at all. */
export function mapServerTables(response: unknown, options: MapServerTablesOptions = {}): CrtTableData[] {
  const tables = (response as { tables?: unknown } | null)?.tables;
  if (!Array.isArray(tables)) throw new Error(UNEXPECTED_ANSWER);
  return tables.map((t) => {
    if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || typeof t.processId !== 'string') {
      throw new Error(UNEXPECTED_ANSWER);
    }
    const processName = typeof t.processName === 'string' ? t.processName : '';
    return mapServerTable({ ...t, processName: displayProcessName(processName, options.processNamePrefix) });
  });
}

/**
 * Maps the process list of the server's answer. An answer without one (an older server) gives an
 * empty list, and the screen then uses the processes of the tables.
 */
export function mapServerProcesses(response: unknown, options: MapServerTablesOptions = {}): CrtProcessData[] {
  const processes = (response as { processes?: unknown } | null)?.processes;
  if (!Array.isArray(processes)) return [];
  return processes
    .filter((p): p is { id: string; name?: unknown } => !!p && typeof p.id === 'string')
    .map((p) => ({
      id: p.id,
      name: displayProcessName(typeof p.name === 'string' ? p.name : '', options.processNamePrefix),
    }));
}

/**
 * The save limits of the server's answer. Only a positive, finite number of bytes is kept; an older
 * server that sends none, or anything else, gives an empty object.
 */
export function mapServerLimits(response: unknown): { maxSaveBytes?: number } {
  const limits = (response as { limits?: unknown } | null)?.limits as { maxSaveBytes?: unknown } | null | undefined;
  const bytes = limits?.maxSaveBytes;
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0 ? { maxSaveBytes: bytes } : {};
}

/**
 * A data source that asks the server. `fetchTables` does the request. The tables, the processes and
 * the limits come from the same answer, so asking for all of them makes one request.
 */
export function createLiveCrtDataSource(
  fetchTables: () => Promise<unknown>,
  options: MapServerTablesOptions = {}
): CrtDataSource {
  let pending: Promise<unknown> | null = null;
  const fetchOnce = (): Promise<unknown> => {
    if (!pending) pending = fetchTables();
    return pending;
  };
  return {
    listTables: async () => mapServerTables(await fetchOnce(), options),
    listProcesses: async () => mapServerProcesses(await fetchOnce(), options),
    limits: async () => mapServerLimits(await fetchOnce()),
  };
}
