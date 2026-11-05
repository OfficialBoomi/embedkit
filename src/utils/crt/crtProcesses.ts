/**
 * @file crtProcesses.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The rules behind the Process dropdown of the cross reference table screen. Pure data, no React,
 * so they can be tested without a DOM.
 *
 * A pack can have several processes and each keeps its own override of a table, so the screen is
 * always "in" one process: the Process dropdown picks it and the Table dropdown lists only that
 * process's tables. A process with no table is still listed, disabled, so nobody wonders where it
 * went.
 */
import type { CrtProcessData, CrtTableData } from './crtTypes';

/** The note on a process that has no table. It disables the option. */
export const NO_TABLES_REASON = 'No tables in this process';

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true });

const isEditable = (t: CrtTableData): boolean => !t.unavailableReason;

/** The tables of one process, sorted by name ("Table 2" before "Table 10"). */
export function tablesOfProcess(tables: readonly CrtTableData[], processId: string): CrtTableData[] {
  return tables.filter((t) => t.processId === processId).sort((a, b) => byName(a.name, b.name));
}

/**
 * Every process of the pack, sorted by name: the ones the source named, plus any process a table
 * belongs to that the source did not name (a source that cannot list processes). A name the source
 * gave wins over the one on a table.
 */
export function mergeProcesses(named: readonly CrtProcessData[], tables: readonly CrtTableData[]): CrtProcessData[] {
  const byId = new Map<string, CrtProcessData>();
  for (const p of named) if (!byId.has(p.id)) byId.set(p.id, { id: p.id, name: p.name });
  for (const t of tables) if (!byId.has(t.processId)) byId.set(t.processId, { id: t.processId, name: t.processName });
  return [...byId.values()].sort((a, b) => byName(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface InitialSelection {
  process: CrtProcessData | null;
  table: CrtTableData | null;
}

/**
 * What is open when the screen first shows: the first process (by name) that has a table that can
 * be edited, and its first such table. With no editable table anywhere, no table is selected; the
 * process shown is then the first one that has any table (so the reasons can be read), or else the
 * first process, or none when the pack has no process.
 */
export function pickInitial(processes: readonly CrtProcessData[], tables: readonly CrtTableData[]): InitialSelection {
  for (const process of processes) {
    const first = tablesOfProcess(tables, process.id).find(isEditable);
    if (first) return { process, table: first };
  }
  const withTables = processes.find((p) => tables.some((t) => t.processId === p.id));
  return { process: withTables ?? processes[0] ?? null, table: null };
}

/**
 * The table to open after the user picks a process: the table that is open now if the new process
 * has it too and it can be edited there (handy for comparing a shared table), otherwise the first
 * editable table of the new process, or none.
 */
export function tableAfterProcessSwitch(
  tables: readonly CrtTableData[],
  processId: string,
  currentTableId: string | null
): CrtTableData | null {
  const editable = tablesOfProcess(tables, processId).filter(isEditable);
  return (currentTableId ? editable.find((t) => t.id === currentTableId) : undefined) ?? editable[0] ?? null;
}
