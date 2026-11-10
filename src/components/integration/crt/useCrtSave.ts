/**
 * @file useCrtSave.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Saving and resetting cross reference tables for the screen. One request writes one table of one
 * process, so a table that other processes share is saved by looping over the processes, one after
 * the other (a single request that did them all could outlast the server's 30 second window for big
 * tables, and one result per process is what the confirmation shows).
 *
 * What the hook owns: whether a save is running (the screen disables itself meanwhile), the error
 * of a failed save, the conflict prompt, the shared-table confirmation and its progress, and the
 * success toast. What it does not own: the tables and their stores. The screen hands in `commitTable`,
 * which replaces one table's data with what was saved and builds a clean store for it, so a saved
 * table has no edits and no dot.
 *
 * Whether Save writes rows or restores the defaults follows the store: a table that shows its own rows
 * is saved, a table that was loaded with its own rows and now shows the defaults is reset.
 *
 * After each table is written the optional `onWritten` callback runs (the screen reloads its history
 * lines there). It is fire and forget: a failure in it is ignored and never changes the save's result.
 *
 * Once a request has been answered the table is written, and nothing after that may turn it into a
 * failed save (a customer would be told it failed, or retry against their own write). The answer is read
 * defensively (`readWriteAnswer`), and taking the new data into the screen is guarded and logged on its own.
 * A process whose save was refused because the table changed meanwhile cannot be retried with the same
 * stamp, so it is left out of "Retry" and its line says to reload the table.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { emitEmbedKitEvent } from '../../../events.service';
import logger from '../../../logger.service';
import {
  useCrossReferenceTablesService,
  type CrossReferenceTableWriteResult,
} from '../../../service/crossReferenceTables.service';
import { mapServerTables } from '../../../utils/crt/crtLiveSource';
import {
  checkSaveSize,
  classifySaveError,
  describeSaveAction,
  describeShareTargets,
  describeWriteSuccess,
  readWriteAnswer,
  writeBusyLabel,
  type SaveAction,
  type ShareTarget,
} from '../../../utils/crt/crtSave';
import type { CrtStore } from '../../../utils/crt/crtStore';
import type { CrtTableData } from '../../../utils/crt/crtTypes';
import type { CrtScopeProgress, CrtScopeStage } from './CrtSaveScopeModal';

/** One table of one process: the same table id is a different entry in every process that uses it. */
const keyOf = (t: Pick<CrtTableData, 'processId' | 'id'>): string => `${t.processId}:${t.id}`;

export interface UseCrtSaveArgs {
  componentKey: string;
  packInstanceId?: string;
  packId?: string;
  packEnvironmentId?: string;
  /** The pack's name, which the server's process names carry in front (see `displayProcessName`). */
  packName?: string;
  /** Every table of the pack as loaded or last saved. */
  tables: CrtTableData[];
  selectedTable: CrtTableData | null;
  /** The store of a table, when it has one (a table gets its store the first time it is opened). */
  getStore: (key: string) => CrtStore | undefined;
  /** Replaces one table's data with `next` and gives it a clean store. */
  commitTable: (key: string, next: CrtTableData) => void;
  /** The largest request body the server accepts; unknown for an older server. */
  maxSaveBytes?: number;
  /** A short result line under the grid. */
  onNotice: (message: string, kind: 'info' | 'warn') => void;
  /**
   * Called after each table that was written successfully (a save or a reset), once the screen has
   * taken the new data. Nothing waits for it and what it does can never change the result of the save.
   */
  onWritten?: () => void;
}

export interface CrtToast {
  id: number;
  content: string;
}

export interface CrtScopeState {
  stage: CrtScopeStage;
  mode: 'save' | 'reset';
  targets: ShareTarget[];
  progress: CrtScopeProgress[];
}

export interface CrtSaveApi {
  /** A save is running: the screen must not be used until it ends. */
  saving: boolean;
  /** What the running work is, for the wait window: "Saving...", "Restoring defaults..." or "Reloading...". */
  busyLabel: string;
  /** What Save does for the open table, from its store. */
  action: SaveAction;
  /** The open table is also used by other processes (that can be written): Save is a split button. */
  shared: boolean;
  /** Saves (or resets) the open table in this process only. */
  save: () => void;
  /** Opens the confirmation for saving to the other processes that share the table. */
  openScope: () => void;
  scope: CrtScopeState | null;
  confirmScope: (otherProcessIds: string[]) => void;
  retryScope: () => void;
  closeScope: () => void;
  /** Set after a conflict on the open table's own save. */
  conflict: boolean;
  overwriteConflict: () => void;
  reloadConflict: () => void;
  keepEditing: () => void;
  /** The plain sentence for a failed save, shown above the buttons. */
  error: string | null;
  dismissError: () => void;
  toast: CrtToast | null;
}

/** What one write needs, taken from a table and its store before anything is sent. */
interface Job {
  key: string;
  table: CrtTableData;
  mode: 'save' | 'reset';
  rows: string[][];
  /** Rows added, edited or removed, for the event. Only known for the open table. */
  changedRowCount?: number;
  /** Stamp to send as `expectedStamp`. Undefined overwrites whatever is there. */
  stamp?: string;
}

const NONE: SaveAction = { mode: 'none', text: 'No changes to save' };

/** Logs a trouble after a write that went through. Ids and the reason only: cell values are the customer's data. */
function logWriteTrouble(job: Job, err: unknown): void {
  logger.error('Cross reference tables: a saved table could not be taken into the screen.', {
    processId: job.table.processId,
    tableId: job.table.id,
    error: err instanceof Error ? err.message : 'unknown error',
  });
}

export function useCrtSave(args: UseCrtSaveArgs): CrtSaveApi {
  const { selectedTable } = args;
  // The service hook hands back new functions on every render, and the handlers must stay stable.
  const service = useCrossReferenceTablesService();
  const serviceRef = useRef(service);
  const argsRef = useRef(args);
  useEffect(() => {
    serviceRef.current = service;
    argsRef.current = args;
  });

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [busyLabel, setBusyLabel] = useState('Saving...');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ key: string; currentStamp?: string } | null>(null);
  const [scope, setScope] = useState<CrtScopeState | null>(null);
  const [toast, setToast] = useState<CrtToast | null>(null);
  const toastId = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const store = selectedTable ? args.getStore(keyOf(selectedTable)) : undefined;
  const action: SaveAction = store ? describeSaveAction(store.changeSummary(), store.rowCount(), store.isDirty()) : NONE;

  const sharers = selectedTable
    ? args.tables.filter((t) => t.id === selectedTable.id && t.processId !== selectedTable.processId && !t.unavailableReason)
    : [];
  const shared = sharers.length > 0;

  const showToast = useCallback((content: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, content });
  }, []);

  /** Works out what to send for the open table, or null (with a notice) when it must not be sent. */
  const prepareOpen = useCallback((): Job | null => {
    const { selectedTable: table, getStore, maxSaveBytes, onNotice } = argsRef.current;
    if (!table) return null;
    const open = getStore(keyOf(table));
    if (!open) return null;
    const act = describeSaveAction(open.changeSummary(), open.rowCount(), open.isDirty());
    if (act.mode === 'none') return null;
    const rows = act.mode === 'save' ? open.rowsSnapshot() : [];
    if (act.mode === 'save') {
      const tooBig = checkSaveSize(rows, maxSaveBytes);
      if (tooBig) {
        onNotice(tooBig, 'warn');
        return null;
      }
    }
    const summary = open.changeSummary();
    return {
      key: keyOf(table),
      table,
      mode: act.mode,
      rows,
      changedRowCount: summary.added + summary.edited + summary.removed,
      stamp: table.stamp,
    };
  }, []);

  /** One request for one table of one process. Throws what the service throws. */
  const write = useCallback(async (job: Job): Promise<CrossReferenceTableWriteResult> => {
    const { packInstanceId, packEnvironmentId } = argsRef.current;
    if (!packInstanceId || !packEnvironmentId) {
      throw new Error('This integration pack has no environment to save cross reference tables in.');
    }
    const common = {
      integrationPackInstanceId: packInstanceId,
      environmentId: packEnvironmentId,
      processId: job.table.processId,
      tableId: job.table.id,
      ...(job.stamp ? { expectedStamp: job.stamp } : {}),
    };
    const { saveCrossReferenceTable, resetCrossReferenceTable } = serviceRef.current;
    return job.mode === 'save'
      ? saveCrossReferenceTable({ ...common, rows: job.rows })
      : resetCrossReferenceTable(common);
  }, []);

  /**
   * Takes what a write answered into the screen and tells the host. The write is done, so a strange answer
   * or a failure on the screen's side is logged and the save still counts as saved. After the screen is
   * gone it only reports to the host.
   */
  const tellWritten = useCallback((job: Job, answer: unknown) => {
    const { componentKey, packInstanceId, packId, packEnvironmentId, commitTable, onWritten } = argsRef.current;
    const read = readWriteAnswer({ mode: job.mode, rowCount: job.rows.length }, answer);
    if (alive.current) {
      try {
        commitTable(job.key, {
          ...job.table,
          overrideRows: read.overridden ? job.rows : null,
          stamp: read.stamp,
        });
      } catch (err) {
        logWriteTrouble(job, err);
      }
    }
    const source = {
      integrationPackInstanceId: packInstanceId,
      integrationPackId: packId,
      environmentId: packEnvironmentId,
      componentKey,
    };
    const ids = {
      integrationPackInstanceId: packInstanceId || '',
      environmentId: packEnvironmentId || '',
      processId: job.table.processId,
      tableId: job.table.id,
    };
    if (job.mode === 'save') {
      emitEmbedKitEvent('crossReference.table.saved', source, {
        ...ids,
        rowCount: read.rowCount,
        ...(job.changedRowCount !== undefined ? { changedRowCount: job.changedRowCount } : {}),
      });
    } else {
      emitEmbedKitEvent('crossReference.table.reset', source, ids);
    }
    // The table is written, so whatever the callback does must not turn that into a failed save.
    if (!alive.current) return;
    try {
      onWritten?.();
    } catch {
      // Ignored on purpose.
    }
  }, []);

  /** Never throws: see tellWritten. */
  const landed = useCallback(
    (job: Job, answer: unknown) => {
      try {
        tellWritten(job, answer);
      } catch (err) {
        logWriteTrouble(job, err);
      }
    },
    [tellWritten]
  );

  // One save at a time: a second request while one runs is refused.
  const begin = useCallback((label = 'Saving...'): boolean => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setBusyLabel(label);
    setSaving(true);
    return true;
  }, []);
  const end = useCallback(() => {
    savingRef.current = false;
    if (alive.current) setSaving(false);
  }, []);

  // ---- this process only ----

  const runOpen = useCallback(
    async (job: Job) => {
      if (!begin(writeBusyLabel(job.mode))) return;
      setError(null);
      try {
        let answer: unknown;
        try {
          answer = await write(job);
        } catch (err) {
          if (!alive.current) return;
          const info = classifySaveError(err);
          if (info.kind === 'conflict') setConflict({ key: job.key, currentStamp: info.currentStamp });
          else setError(info.message);
          return;
        }
        // From here the table is written: nothing below can turn this into a failed save.
        landed(job, answer);
        if (alive.current) showToast(describeWriteSuccess(job.mode, 1));
      } finally {
        end();
      }
    },
    [begin, end, write, landed, showToast]
  );

  const save = useCallback(() => {
    const job = prepareOpen();
    if (job) void runOpen(job);
  }, [prepareOpen, runOpen]);

  const overwriteConflict = useCallback(() => {
    const pending = conflict;
    const job = prepareOpen();
    setConflict(null);
    // The customer chose to overwrite. With the stamp of what is there now, a second change in between is
    // still noticed. Without one the table's own stamp is stale and would conflict again, so none is sent.
    if (job && pending?.key === job.key) void runOpen({ ...job, stamp: pending.currentStamp });
  }, [conflict, prepareOpen, runOpen]);

  const reloadConflict = useCallback(async () => {
    const pending = conflict;
    setConflict(null);
    const { packInstanceId, packEnvironmentId, packName, tables, commitTable, onNotice } = argsRef.current;
    const table = tables.find((t) => keyOf(t) === pending?.key);
    if (!pending || !table || !packInstanceId || !packEnvironmentId) return;
    if (!begin('Reloading...')) return;
    try {
      const response = await serviceRef.current.fetchCrossReferenceTables({
        integrationPackInstanceId: packInstanceId,
        environmentId: packEnvironmentId,
        processId: table.processId,
        tableId: table.id,
      });
      const fresh = mapServerTables(response, { processNamePrefix: packName }).find((t) => keyOf(t) === pending.key);
      if (!fresh) throw new Error('The table could not be found after reloading.');
      // The screen may have been left while the table was on its way.
      if (!alive.current) return;
      commitTable(pending.key, fresh);
      onNotice('Reloaded the current version of this table.', 'info');
    } catch (err) {
      if (alive.current) setError(classifySaveError(err).message);
    } finally {
      end();
    }
  }, [conflict, begin, end]);

  const keepEditing = useCallback(() => setConflict(null), []);

  // ---- other processes that share the table ----

  const openScope = useCallback(() => {
    const { selectedTable: table, tables, getStore } = argsRef.current;
    const job = prepareOpen();
    if (!table || !job) return;
    const others = tables
      .filter((t) => t.id === table.id && t.processId !== table.processId)
      .map((t) => ({
        processId: t.processId,
        processName: t.processName,
        overridden: t.overrideRows != null,
        rows: t.overrideRows ?? [],
        hasUnsavedEdits: Boolean(getStore(keyOf(t))?.isDirty()),
        unavailable: Boolean(t.unavailableReason),
      }));
    const targets = describeShareTargets({ processId: table.processId, tableId: table.id }, job.mode, job.rows, others);
    if (targets.length === 0) {
      void runOpen(job);
      return;
    }
    setScope({ stage: 'choose', mode: job.mode, targets, progress: [] });
  }, [prepareOpen, runOpen]);

  const closeScope = useCallback(() => {
    if (savingRef.current) return;
    setScope(null);
  }, []);

  /**
   * Runs the jobs one after the other and reports each. Returns the lines as they ended, and the jobs
   * that failed in a way a second try can fix: one that failed because the table changed meanwhile would
   * send the same stale stamp and fail again, so it is left out (its line tells the customer to reload).
   */
  const runJobs = useCallback(
    async (jobs: Job[], progress: CrtScopeProgress[]): Promise<{ retryable: Job[]; lines: CrtScopeProgress[] }> => {
      const retryable: Job[] = [];
      let lines = progress;
      const mark = (processId: string, state: CrtScopeProgress['state'], message?: string, canRetry?: boolean) => {
        lines = lines.map((p) =>
          p.processId === processId
            ? { ...p, state, message, retryable: state === 'failed' ? canRetry : undefined }
            : p
        );
        if (alive.current) setScope((s) => (s ? { ...s, progress: lines } : s));
      };
      for (const job of jobs) {
        mark(job.table.processId, 'saving');
        let answer: unknown;
        try {
          answer = await write(job);
        } catch (err) {
          const info = classifySaveError(err);
          const conflict = info.kind === 'conflict';
          if (!conflict) retryable.push(job);
          mark(
            job.table.processId,
            'failed',
            conflict ? 'Changed by someone else after it was loaded. Close this window, reload the table and save again.' : info.message,
            !conflict
          );
          continue;
        }
        // The table is written, whatever the answer looked like.
        landed(job, answer);
        mark(job.table.processId, 'saved');
      }
      return { retryable, lines };
    },
    [write, landed]
  );

  /** The jobs a "Retry" would send: only the ones that failed in a way a second try can fix. */
  const retryableRef = useRef<Job[]>([]);

  const finishJobs = useCallback(
    async (jobs: Job[], progress: CrtScopeProgress[]) => {
      const mode = jobs[0]?.mode ?? 'save';
      if (!begin(writeBusyLabel(mode))) return;
      setError(null);
      setScope((s) => (s ? { ...s, stage: 'running', progress } : s));
      try {
        const { retryable, lines } = await runJobs(jobs, progress);
        retryableRef.current = retryable;
        if (!alive.current) return;
        setScope((s) => (s ? { ...s, stage: 'done' } : s));
        // Every process of the shared save is written, including the ones an earlier round already did.
        if (lines.every((line) => line.state === 'saved')) showToast(describeWriteSuccess(mode, lines.length));
      } finally {
        end();
      }
    },
    [begin, end, runJobs, showToast]
  );

  const confirmScope = useCallback(
    (otherProcessIds: string[]) => {
      const { selectedTable: table, tables } = argsRef.current;
      const mine = prepareOpen();
      if (!table || !mine || !scope) return;
      const chosen = tables.filter((t) => t.id === table.id && otherProcessIds.includes(t.processId));
      // Each other process is checked against what it held when it was loaded, like the open one.
      const jobs: Job[] = [
        mine,
        ...chosen.map((t): Job => ({ key: keyOf(t), table: t, mode: mine.mode, rows: mine.rows, stamp: t.stamp })),
      ];
      const progress: CrtScopeProgress[] = jobs.map((j) => ({
        processId: j.table.processId,
        processName: j.table.processName,
        state: 'waiting',
      }));
      void finishJobs(jobs, progress);
    },
    [prepareOpen, scope, finishJobs]
  );

  const retryScope = useCallback(() => {
    const jobs = retryableRef.current;
    if (jobs.length === 0 || !scope) return;
    const progress = scope.progress.map((p) =>
      jobs.some((j) => j.table.processId === p.processId)
        ? { ...p, state: 'waiting' as const, message: undefined, retryable: undefined }
        : p
    );
    void finishJobs(jobs, progress);
  }, [scope, finishJobs]);

  return {
    saving,
    busyLabel,
    action,
    shared,
    save,
    openScope,
    scope,
    confirmScope,
    retryScope,
    closeScope,
    conflict: conflict !== null,
    overwriteConflict,
    reloadConflict: () => void reloadConflict(),
    keepEditing,
    error,
    dismissError: () => setError(null),
    toast,
  };
}
