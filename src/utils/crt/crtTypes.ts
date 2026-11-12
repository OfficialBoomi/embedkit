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
  /**
   * A short fingerprint of the table's state on the server (is it overridden, and which rows) when
   * this was loaded. Sent back with a save so the server can refuse to overwrite a change somebody
   * else made in between. Absent when the server does not send one.
   */
  stamp?: string;
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
  /**
   * What the server allows when saving. `maxSaveBytes` is the largest request body it accepts. A
   * source that cannot tell leaves this out, or leaves a field out, and the screen assumes the
   * smallest limit a server ever had.
   */
  limits?(): Promise<{ maxSaveBytes?: number }>;
}

/** A cell address, zero based. */
export interface CrtCell {
  row: number;
  col: number;
}
