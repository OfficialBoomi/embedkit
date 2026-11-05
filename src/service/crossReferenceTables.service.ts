import { useHttp } from './http';
import logger from '../logger.service';
import type { CrtServerTablesResponse } from '../utils/crt/crtLiveSource';

export type FetchCrossReferenceTablesArgs = {
  integrationPackInstanceId: string;
  environmentId: string;
  /** With `tableId`, narrows the answer to that one table of that one process (reloading it). */
  processId?: string;
  tableId?: string;
  signal?: AbortSignal;
};

/** Which table of which process to write. One request writes one table of one process. */
export type CrossReferenceTableWriteArgs = {
  integrationPackInstanceId: string;
  environmentId: string;
  /** The installed process (extension group) whose copy of the table is written. */
  processId: string;
  tableId: string;
  /**
   * The stamp the table had when it was loaded. The server refuses the write (409, code
   * `TABLE_CHANGED`) when the table is different now. Leave it out to write regardless.
   */
  expectedStamp?: string;
  signal?: AbortSignal;
};

export type SaveCrossReferenceTableArgs = CrossReferenceTableWriteArgs & {
  /** Every row of the table, one text cell per column. Replaces the process's own rows. */
  rows: string[][];
};

export type ResetCrossReferenceTableArgs = CrossReferenceTableWriteArgs;

/** What the server read back after the write. */
export type CrossReferenceTableWriteResult = {
  processId: string;
  tableId: string;
  /** True when the process has its own rows for the table, false when it uses the defaults. */
  overridden: boolean;
  rowCount: number;
  /** The table's stamp now. Use it as `expectedStamp` for the next write. */
  stamp: string;
};

export function useCrossReferenceTablesService() {
  const http = useHttp();

  /** The overrideable cross reference tables of an installed pack, with headers, default rows and override rows. */
  async function fetchCrossReferenceTables(
    args: FetchCrossReferenceTablesArgs
  ): Promise<CrtServerTablesResponse> {
    const { signal, ...params } = args;
    logger.debug('Service: fetchCrossReferenceTables', params);
    return http.get('/cross-reference-tables', { params, signal });
  }

  /**
   * Saves the customer's own rows of one table in one process. A failure throws an HttpError whose
   * `body.code` is the server's code (for example `TABLE_CHANGED`).
   */
  async function saveCrossReferenceTable(args: SaveCrossReferenceTableArgs): Promise<CrossReferenceTableWriteResult> {
    const { signal, rows, ...rest } = args;
    // Ids and a count only: the cell values are the customer's data and stay out of the log.
    logger.debug('Service: saveCrossReferenceTable', { ...rest, rowCount: rows.length });
    return http.post('/cross-reference-tables/save', { ...rest, rows }, { signal });
  }

  /** Puts one table of one process back to the publisher's defaults. Fails the same way as a save. */
  async function resetCrossReferenceTable(args: ResetCrossReferenceTableArgs): Promise<CrossReferenceTableWriteResult> {
    const { signal, ...body } = args;
    logger.debug('Service: resetCrossReferenceTable', body);
    return http.post('/cross-reference-tables/reset', body, { signal });
  }

  return { fetchCrossReferenceTables, saveCrossReferenceTable, resetCrossReferenceTable };
}
