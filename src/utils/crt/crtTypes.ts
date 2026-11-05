/**
 * @file crtTypes.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Shared types for the cross reference table editor. Pure data, no React, so the
 * store, the keyboard rules and the data sources can be tested without a DOM.
 */

/** How a table matches an input value. Read only: an override cannot change it. */
export type CrtMatchType = 'exact' | 'wildcard' | 'regex';

/** One table as the editor sees it, for one process. */
export interface CrtTableData {
  /** Table component id. The same table has the same id in every process that uses it. */
  id: string;
  name: string;
  /** The process (extension group) this copy belongs to. Each process has its own override. */
  processId: string;
  processName: string;
  matchType: CrtMatchType;
  /** Fixed column headers (2 to 20). Never edited. */
  columns: string[];
  /** The publisher's rows. Always kept, so "Reset to defaults" can restore them. */
  defaultRows: string[][];
  /** The customer's override rows, or null when the table is not overridden. */
  overrideRows: string[][] | null;
  /**
   * A non-empty string means the table is listed but cannot be edited here, for example its
   * definition could not be read or it is runtime specific. The string is the reason shown to
   * the user. `columns` may then be empty and no rows are needed. Internal to the editor.
   */
  unavailableReason?: string;
}

/** A process of the pack. It is listed whether or not it has any table. */
export interface CrtProcessData {
  id: string;
  name: string;
}

/** Where the screen gets its tables. Nothing is registered by default, so the screen asks the server. */
export interface CrtDataSource {
  listTables(): Promise<CrtTableData[]>;
  /**
   * Every process of the pack, including processes with no table. A source that cannot tell leaves
   * this out and the screen uses the processes of the tables it got.
   */
  listProcesses?(): Promise<CrtProcessData[]>;
}

/** A cell address, zero based. */
export interface CrtCell {
  row: number;
  col: number;
}
