/**
 * @file UpdateCrossReferences.tsx
 * @component UpdateCrossReferences
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders the cross reference table screen of an integration: pick a lookup table, view the
 * publisher's default values (read only), and turn on Override to edit your own copy in an
 * Excel-like grid. Each table keeps its own edits while you switch between tables.
 * Rows can be added, inserted, duplicated, moved, deleted, cut, copied and pasted, from the
 * toolbar, the grid's context menu or the keyboard. The tables come from the server (read only:
 * the pack's real headers, default rows and override rows), or from a data source registered with
 * `registerCrtDataSource`, which tests use. Nothing is saved from this screen yet, and the
 * Save button says so.
 *
 * A small dot in the picker marks every table with unsaved edits, and leaving the screen (the
 * Cancel button or the breadcrumb) asks first while any table has some. A table that cannot be
 * edited is listed as a disabled option with its reason, or hidden, depending on the component's
 * `crossReferenceTables.unavailableTables` setting ('disabled', the default, or 'hidden'). With
 * no editable table at all the screen says so.
 *
 * Find and replace (Ctrl or Cmd+F, or the Find button) opens a third toolbar row that searches
 * the selected table as you type. Its state lives here, above the grid, so the query survives
 * switching tables; see crt/useCrtFind.
 *
 * While a table is editable its key column is checked for blank and duplicate keys after every
 * change. Each problem shows as a warning chip in the info row (and in the full screen caption);
 * pressing a chip jumps to the next flagged row. The grid gets the same result to mark the key
 * cells. A table that is not editable shows no key warnings.
 *
 * @return {JSX.Element} The rendered UpdateCrossReferences component.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { usePlugin } from '../../context/pluginContext';
import { useDialogs } from '../../hooks/useDialogs';
import { useCrossReferenceTablesService } from '../../service/crossReferenceTables.service';
import { HttpError } from '../../service/http';
import { getCrtDataSource } from '../../utils/crt/crtDataSource';
import { createLiveCrtDataSource } from '../../utils/crt/crtLiveSource';
import { createCrtStore, type CrtStore } from '../../utils/crt/crtStore';
import type { CrtMatchType, CrtTableData } from '../../utils/crt/crtTypes';
import { checkKeys } from '../../utils/crt/crtWarnings';
import { buildKeyChips, nextFlaggedRow, type CrtKeyChip } from '../../utils/crt/crtWarningsView';
import AjaxLoader from '../ui/AjaxLoader';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import Page from '../core/Page';
import CrtFindBar from './crt/CrtFindBar';
import CrtGrid, { type CrtGridHandle, type CrtGridInfo, type CrtOp } from './crt/CrtGrid';
import CrtTablePicker, { type CrtPickerOption } from './crt/CrtTablePicker';
import CrtToolbar from './crt/CrtToolbar';
import { useCrtFind } from './crt/useCrtFind';
import crtCss from './crt/crt.css?inline';

/**
 * @interface UpdateCrossReferencesProps
 *
 * @description
 * Props for the `UpdateCrossReferences` component.
 *
 * @property {string} componentKey - Unique key for the component instance.
 * @property {IntegrationPackInstance} integration - The integration whose tables are shown.
 * @property {() => void} [onBack] - Optional callback invoked to navigate back.
 */
export interface UpdateCrossReferencesProps {
  componentKey: string;
  integration: IntegrationPackInstance;
  onBack?: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tables: CrtTableData[] };

const READ_ONLY_HINT = 'Read only. Press Override to edit.';
const SAVE_NOTE = 'Saving is not available yet. Your edits stay on this screen and are not sent to Boomi.';
const SERVER_TOO_OLD =
  'This server does not support cross reference tables yet. Update the embedkit server and try again.';
const HINT_MS = 3000;

/** A short result message under the grid. Warnings use the danger colour, the rest the muted one. */
interface Notice {
  message: string;
  kind: 'info' | 'warn';
}

const MATCH_LABEL: Record<CrtMatchType, string> = {
  exact: 'Exact',
  wildcard: 'Wildcard',
  regex: 'Regex',
};

const NO_TABLES: CrtTableData[] = [];
const NO_KEYS: ReadonlySet<string> = new Set();
const NO_CHIPS: CrtKeyChip[] = [];
const NOOP_SUBSCRIBE = () => () => {};
const ZERO_VERSION = () => 0;

/** One table per process: the same table id can be used by several processes. */
const tableKey = (t: CrtTableData): string => `${t.processId}:${t.id}`;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** A table that is listed but cannot be edited here. Only a non-empty reason counts. */
const isUnavailable = (t: CrtTableData): boolean => Boolean(t.unavailableReason);

/** Re-rendering on an identical report would loop: the grid reports after every render it makes. */
function sameInfo(a: CrtGridInfo | null, b: CrtGridInfo): boolean {
  if (!a) return false;
  return (Object.keys(b) as Array<keyof CrtGridInfo>).every((key) => a[key] === b[key]);
}

/** Name first, then process name, with numbers sorted by value ("Table 2" before "Table 10"). */
function sortTables(list: CrtTableData[]): CrtTableData[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }) ||
        a.processName.localeCompare(b.processName, undefined, { numeric: true })
    );
}

/** The live store state when a store exists, otherwise the loaded data. */
function describeTable(t: CrtTableData, store?: CrtStore): string {
  const overridden = store ? store.isOverridden() : t.overrideRows != null;
  const rows = store ? store.rowCount() : (t.overrideRows ?? t.defaultRows).length;
  return `${t.processName} | ${overridden ? 'Overridden' : 'Default'} | ${plural(rows, 'row', 'rows')}`;
}

/** Re-renders the caller whenever the given store changes. */
function useStoreVersion(store: CrtStore | null): number {
  return useSyncExternalStore(
    store ? store.subscribe : NOOP_SUBSCRIBE,
    store ? store.version : ZERO_VERSION
  );
}

const UpdateCrossReferences: React.FC<UpdateCrossReferencesProps> = ({
  componentKey,
  integration,
  onBack,
}) => {
  const { boomiConfig, renderComponent } = usePlugin();
  const { confirm } = useDialogs('CrossReferenceTables');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [gridInfo, setGridInfo] = useState<CrtGridInfo | null>(null);
  // One store per table, created the first time the table is selected, so edits survive switching.
  const storesRef = useRef(new Map<string, CrtStore>());
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetOpen = useRef(false);
  const deleteOpen = useRef(false);
  const leaveOpen = useRef(false);
  // Tables with unsaved edits, across all tables (not only the selected one), for the picker dots.
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlySet<string>>(NO_KEYS);
  const unsubscribesRef = useRef(new Map<string, () => void>());
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<CrtGridHandle>(null);
  // Full screen fills the plugin area with the toolbar, the grid and the status line.
  const [fullScreen, setFullScreen] = useState(false);
  const toggleFullScreen = useCallback(() => setFullScreen((on) => !on), []);
  // The dialog hook may hand back a new function each render; the grid needs a stable callback.
  const confirmRef = useRef(confirm);
  useEffect(() => {
    confirmRef.current = confirm;
  });
  // The service hook returns new functions each render; the load effect must not re-run for that.
  const { fetchCrossReferenceTables } = useCrossReferenceTablesService();
  const fetchTablesRef = useRef(fetchCrossReferenceTables);
  useEffect(() => {
    fetchTablesRef.current = fetchCrossReferenceTables;
  });

  // The Override button disappears and the Reset dialog steals focus, so hand it back to the grid.
  const focusGrid = useCallback(() => {
    gridWrapRef.current?.querySelector<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true });
  }, []);

  // A dialog marks the rest of the page aria-hidden. If the grid still holds focus at that
  // moment the browser warns, so let go of focus first; focusGrid() takes it back afterwards.
  const blurGrid = useCallback(() => {
    gridWrapRef.current?.querySelector<HTMLElement>('[role="grid"]')?.blur();
  }, []);

  // The built-in dialog hides over about 200 ms and keeps the page aria-hidden until it is gone.
  // Taking focus earlier triggers the same warning, so wait for it to leave (at most about 1.5 s).
  // A host dialog handler has no such container, so focus comes back at once.
  const focusGridAfterDialog = useCallback(() => {
    let frames = 0;
    const tick = () => {
      if (document.querySelector('.swal2-container') && frames++ < 90) {
        requestAnimationFrame(tick);
        return;
      }
      focusGrid();
    };
    requestAnimationFrame(tick);
  }, [focusGrid]);

  const fullScreenSeen = useRef(false);
  useEffect(() => {
    if (!fullScreenSeen.current) {
      fullScreenSeen.current = true;
      return;
    }
    focusGrid();
  }, [fullScreen, focusGrid]);

  // The set is replaced only when a table gains or loses its dot, so an edit to a table that is
  // already dirty costs no extra render.
  const syncDirty = useCallback((key: string, store: CrtStore) => {
    const dirty = store.isDirty();
    setDirtyKeys((prev) => {
      if (prev.has(key) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const ensureStore = useCallback(
    (table: CrtTableData): CrtStore => {
      const key = tableKey(table);
      let store = storesRef.current.get(key);
      if (!store) {
        store = createCrtStore(table);
        storesRef.current.set(key, store);
      }
      if (!unsubscribesRef.current.has(key)) {
        const watched = store;
        unsubscribesRef.current.set(
          key,
          watched.subscribe(() => syncDirty(key, watched))
        );
      }
      return store;
    },
    [syncDirty]
  );

  // Drops every store and its subscription (a retry starts from nothing).
  const releaseStores = useCallback(() => {
    unsubscribesRef.current.forEach((unsubscribe) => unsubscribe());
    unsubscribesRef.current.clear();
    storesRef.current.clear();
    setDirtyKeys(NO_KEYS);
  }, []);

  useEffect(() => {
    const unsubscribes = unsubscribesRef.current;
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      unsubscribes.clear();
    };
  }, []);

  const packInstanceId = integration.id;
  const packEnvironmentId = integration.environmentId;
  const packName = integration.integrationPackOverrideName || integration.integrationPackName;
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const load = async (): Promise<CrtTableData[]> => {
      // A registered source wins; otherwise the tables come from the server.
      const source =
        getCrtDataSource() ??
        createLiveCrtDataSource(() => {
          if (!packInstanceId || !packEnvironmentId) {
            throw new Error('This integration pack has no environment to read cross reference tables from.');
          }
          return fetchTablesRef.current({
            integrationPackInstanceId: packInstanceId,
            environmentId: packEnvironmentId,
            signal: controller.signal,
          });
        }, { processNamePrefix: packName });
      return source.listTables();
    };
    load()
      .then((list) => {
        if (!alive) return;
        const tables = sortTables(list);
        // A table that cannot be edited never gets a store and is never selected.
        const first = tables.find((t) => !isUnavailable(t));
        if (first) {
          ensureStore(first);
          setSelectedKey(tableKey(first));
        }
        setState({ status: 'ready', tables });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // A server without the route answers 404 (or 501 when its SDK is too old): say so plainly.
        const tooOld = err instanceof HttpError && (err.status === 404 || err.status === 501);
        setState({
          status: 'error',
          message: tooOld
            ? SERVER_TOO_OLD
            : err instanceof Error && err.message
              ? err.message
              : 'The cross reference tables could not be loaded.',
        });
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [loadAttempt, ensureStore, packInstanceId, packEnvironmentId, packName]);

  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    []
  );

  const tables = state.status === 'ready' ? state.tables : NO_TABLES;
  const selectedTable = tables.find((t) => tableKey(t) === selectedKey) ?? null;
  const store = selectedTable ? (storesRef.current.get(tableKey(selectedTable)) ?? null) : null;
  // Live state (override, row count) of the selected table; other tables only change when selected.
  const storeVersion = useStoreVersion(store);

  // Blank and duplicate keys, only while the table can be edited. The store changes in place, so its
  // version is what says the rows are not the ones that were checked.
  const keyWarnings = useMemo(
    () =>
      store && store.isEditable() ? checkKeys((r, c) => store.getCell(r, c), store.rowCount()) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, storeVersion]
  );
  const keyChips = keyWarnings ? buildKeyChips(keyWarnings) : NO_CHIPS;

  // A chip moves the cursor to column 0 of the next flagged row and gives the grid focus, so the
  // keys work at once. showCell scrolls the row into view.
  const jumpToKey = useCallback((rows: readonly number[]) => {
    const handle = gridRef.current;
    if (!handle) return;
    const row = nextFlaggedRow(rows, handle.activeCell().row);
    if (row < 0) return;
    handle.showCell(row, 0);
    handle.focus();
  }, []);

  // Nothing at all in the markup when the table has nothing to report.
  const renderKeyChips = () =>
    keyChips.map((chip) => (
      <button
        key={chip.kind}
        type="button"
        className="boomi-crt-chip boomi-crt-chip--warn"
        title={chip.title}
        onClick={() => jumpToKey(chip.rows)}
      >
        {chip.label}
      </button>
    ));

  const unavailableMode =
    boomiConfig?.components?.[componentKey]?.crossReferenceTables?.unavailableTables ?? 'disabled';
  // Any value other than 'hidden' counts as the default, 'disabled'.
  const listedTables = unavailableMode === 'hidden' ? tables.filter((t) => !isUnavailable(t)) : tables;

  // What the empty state lists: nothing in 'hidden' mode, since those tables are not shown at all.
  const shownUnavailable = listedTables.filter(isUnavailable);

  const options: CrtPickerOption[] = listedTables.map((t) => {
    const key = tableKey(t);
    if (t.unavailableReason) {
      return {
        key,
        name: t.name,
        description: `${t.processName} | Unavailable`,
        dirty: false,
        disabledReason: t.unavailableReason,
      };
    }
    return {
      key,
      name: t.name,
      description: describeTable(t, storesRef.current.get(key)),
      dirty: dirtyKeys.has(key),
    };
  });

  const showTitle = boomiConfig?.components?.[componentKey]?.crossReferenceTables?.showTitle ?? true;
  const title =
    boomiConfig?.components?.[componentKey]?.crossReferenceTables?.title || 'Cross Reference Tables';
  const showDescription =
    boomiConfig?.components?.[componentKey]?.crossReferenceTables?.showDescription ?? true;
  const description =
    boomiConfig?.components?.[componentKey]?.crossReferenceTables?.description ||
    'View the lookup tables of this integration. Turn on Override to edit your own copy.';

  const handleSelect = (key: string) => {
    const table = tables.find((t) => tableKey(t) === key);
    if (!table || isUnavailable(table)) return;
    ensureStore(table);
    setSelectedKey(key);
  };

  const handleRetry = () => {
    releaseStores();
    setSelectedKey(null);
    setState({ status: 'loading' });
    setLoadAttempt((n) => n + 1);
  };

  // Asks before leaving while any table has unsaved edits. Counted from the live stores, so it
  // cannot lag behind a render. Guarded like the reset dialog so a double click cannot open two.
  const confirmLeave = async (changed: number): Promise<boolean> => {
    if (leaveOpen.current) return false;
    leaveOpen.current = true;
    blurGrid();
    let leave = false;
    try {
      leave = await confirm({
        title: 'Discard your changes?',
        description: `${
          changed === 1 ? 'One table has' : `${changed.toLocaleString('en-US')} tables have`
        } unsaved changes. Leaving now discards them.`,
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        destructive: true,
      });
      return leave;
    } finally {
      leaveOpen.current = false;
      // Staying: hand focus back once the dialog has finished closing. Leaving needs no focus.
      if (!leave) focusGridAfterDialog();
    }
  };

  // Clean tables leave at once, with no dialog and no wait.
  const leaveScreen = (go: () => void) => {
    let changed = 0;
    storesRef.current.forEach((s) => {
      if (s.isDirty()) changed += 1;
    });
    if (changed === 0) {
      go();
      return;
    }
    void confirmLeave(changed).then((leave) => {
      if (leave) go();
    });
  };

  const handleCancel = () =>
    leaveScreen(() => {
      renderComponent?.({
        component: 'Integrations',
        props: {
          componentKey: componentKey || 'integrationsMain',
        },
      });
    });

  // With no callback the breadcrumb does nothing, so there is nothing to leave and nothing to ask.
  const handleBreadcrumb = onBack ? () => leaveScreen(onBack) : undefined;

  const handleOverride = () => {
    store?.override();
    focusGrid();
  };

  const handleReset = async () => {
    if (!store || resetOpen.current) return;
    resetOpen.current = true;
    const target = store;
    blurGrid();
    try {
      const confirmed = await confirm({
        title: 'Reset to defaults?',
        description:
          'Your changes to this table will be discarded and the default values will show again.',
        confirmLabel: 'Reset',
        cancelLabel: 'Keep my values',
        destructive: true,
      });
      if (confirmed) target.reset();
    } finally {
      resetOpen.current = false;
      // After the dialog has finished closing and handing focus back.
      focusGridAfterDialog();
    }
  };

  // The callbacks below are stable, so the memoized grid does not re-render when this screen does.
  const showNotice = useCallback((message: string, kind: Notice['kind']) => {
    setNotice({ message, kind });
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setNotice(null), HINT_MS);
  }, []);

  const showHint = useCallback(() => showNotice(READ_ONLY_HINT, 'warn'), [showNotice]);

  const find = useCrtFind(store, gridRef, { onNotice: showNotice, onBlocked: showHint });

  const handleInfo = useCallback((next: CrtGridInfo) => {
    setGridInfo((prev) => (sameInfo(prev, next) ? prev : next));
  }, []);

  const handleRun = useCallback((op: CrtOp) => {
    gridRef.current?.run(op);
  }, []);

  // Deleting several rows asks first. Guarded like the reset dialog so a double click cannot open two.
  const confirmDelete = useCallback(
    async (count: number): Promise<boolean> => {
      if (deleteOpen.current) return false;
      deleteOpen.current = true;
      blurGrid();
      try {
        return await confirmRef.current({
          title: `Delete ${count.toLocaleString('en-US')} rows?`,
          description:
            'The rows are removed from this table. Reset to defaults brings the original values back.',
          confirmLabel: 'Delete',
          cancelLabel: 'Keep rows',
          destructive: true,
        });
      } finally {
        deleteOpen.current = false;
        // After the dialog has finished closing and handing focus back.
        focusGridAfterDialog();
      }
    },
    [focusGridAfterDialog, blurGrid]
  );

  // The grid, the cell editor and the menu stop the Escape they use, so one that gets this far
  // belongs to full screen.
  const handleWorkspaceKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (fullScreen && e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      e.stopPropagation();
      setFullScreen(false);
    }
  };

  const sharedWith = selectedTable
    ? [
        ...new Set(
          listedTables
            .filter((t) => t.id === selectedTable.id && t.processId !== selectedTable.processId)
            .map((t) => t.processName)
        ),
      ]
    : [];

  const renderTable = (table: CrtTableData, current: CrtStore) => {
    const overridden = current.isOverridden();
    return (
      <>
        <div className="boomi-crt-picker">
          <CrtTablePicker options={options} selectedKey={selectedKey} onSelect={handleSelect} />
        </div>

        <div className="boomi-crt-info">
          <span className="boomi-crt-chip">Process: {table.processName}</span>
          {sharedWith.length > 0 && (
            <span className="boomi-crt-chip">Shared with: {sharedWith.join(', ')}</span>
          )}
          <span
            className="boomi-crt-chip"
            title="How this table matches a value is set by its publisher and cannot be changed."
          >
            Match: {MATCH_LABEL[table.matchType]}
          </span>
          <span
            className={`boomi-crt-chip ${overridden ? 'boomi-crt-chip--overridden' : 'boomi-crt-chip--default'}`}
            title={
              overridden
                ? 'You are editing your own copy of this table.'
                : "Showing the publisher's default values (read only). Press Override to edit."
            }
          >
            {overridden ? 'Overridden' : 'Default'}
          </span>
          {renderKeyChips()}
          <span className="boomi-crt-count">
            {plural(current.rowCount(), 'row', 'rows')}, {plural(current.colCount(), 'column', 'columns')}
          </span>
        </div>

        <div
          className={fullScreen ? 'boomi-crt-workspace boomi-crt-workspace--full' : 'boomi-crt-workspace'}
          onKeyDown={handleWorkspaceKeyDown}
        >
          {fullScreen && (
            <div className="boomi-crt-fs-caption">
              <CrtTablePicker
                compact
                options={options}
                selectedKey={selectedKey}
                onSelect={handleSelect}
              />
              <span className="boomi-crt-fs-sub">{table.processName}</span>
              <span
                className={`boomi-crt-chip ${overridden ? 'boomi-crt-chip--overridden' : 'boomi-crt-chip--default'}`}
              >
                {overridden ? 'Overridden' : 'Default'}
              </span>
              {renderKeyChips()}
              <span className="boomi-crt-count">
                {plural(current.rowCount(), 'row', 'rows')}, {plural(current.colCount(), 'column', 'columns')}
              </span>
            </div>
          )}
          <CrtToolbar
            info={gridInfo}
            onRun={handleRun}
            fullScreen={fullScreen}
            onToggleFullScreen={toggleFullScreen}
            find={{
              open: find.open,
              onToggle: find.toggle,
              onCommand: find.onCommand,
              bar: <CrtFindBar {...find.bar} />,
            }}
            trailing={
              // The wrapper carries the tooltip, so it shows over the whole button.
              overridden ? (
                <span title="Discard your changes and show the default values again.">
                  <Button
                    toggle={false}
                    primary={false}
                    showIcon={false}
                    label="Reset to defaults"
                    onClick={handleReset}
                  />
                </span>
              ) : (
                <span title="Edit your own copy. It will no longer follow later changes to the defaults.">
                  <Button
                    toggle={false}
                    primary={true}
                    showIcon={false}
                    label="Override"
                    onClick={handleOverride}
                  />
                </span>
              )
            }
          />

          <div className="boomi-crt-grid-wrap" ref={gridWrapRef}>
            <CrtGrid
              ref={gridRef}
              store={current}
              ariaLabel={`${table.name} (${table.processName})`}
              onBlocked={showHint}
              onInfo={handleInfo}
              onNotice={showNotice}
              confirmDelete={confirmDelete}
              find={find.highlight}
              onFind={find.onCommand}
              keyWarnings={keyWarnings ?? undefined}
            />
          </div>

          <div className="boomi-crt-statusbar">
            <span className="boomi-crt-help">
              {overridden
                ? 'Arrows move, Space ticks a row, Enter edits. Ctrl+C/X/V copy, cut, paste. Ctrl+Z undo, Ctrl+F find. Right-click for row actions.'
                : 'Arrows move, Space ticks a row. Ctrl+C copies, Ctrl+F finds. Press Override to edit.'}
            </span>
            <span
              className={`boomi-crt-hint boomi-crt-hint--${notice?.kind ?? 'info'}`}
              role="status"
              aria-live="polite"
            >
              {notice?.message}
            </span>
          </div>
        </div>
      </>
    );
  };

  const bodyContent = (
    <>
      <style>{crtCss}</style>
      {state.status === 'loading' ? (
        <div className="flex justify-center items-center pt-6 m-6">
          <AjaxLoader message="Loading cross reference tables..." />
        </div>
      ) : state.status === 'error' ? (
        <Dialog
          error={{
            header: 'Could not load cross reference tables',
            message: state.message,
            errorType: 'error',
            onClose: onBack ?? (() => {}),
          }}
          origin="maps"
          showActionButton
          buttonLabel="Try again"
          onButtonClick={handleRetry}
        />
      ) : !selectedTable || !store ? (
        <div className="boomi-update boomi-crt-screen">
          {showTitle && <div className="boomi-update-title">{title}</div>}
          {showDescription && <div className="boomi-update-desc">{description}</div>}
          <div className="boomi-crt-empty">
            <p>No editable cross reference tables</p>
            {shownUnavailable.length > 0 && (
              <ul className="boomi-crt-empty-list">
                {shownUnavailable.map((t) => (
                  <li key={tableKey(t)}>
                    {t.name} ({t.processName}): {t.unavailableReason}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="boomi-update-actions">
            <Button
              toggle={false}
              primary={false}
              showIcon={false}
              label="Cancel"
              onClick={handleCancel}
            />
          </div>
        </div>
      ) : (
        <div className="boomi-update boomi-crt-screen">
          {showTitle && <div className="boomi-update-title">{title}</div>}
          {showDescription && <div className="boomi-update-desc">{description}</div>}
          {renderTable(selectedTable, store)}
          <p className="boomi-crt-help" role="note">
            {SAVE_NOTE}
          </p>
          <div className="boomi-update-actions">
            <Button
              toggle={false}
              primary={false}
              showIcon={false}
              label="Cancel"
              onClick={handleCancel}
            />
            <Button
              toggle={false}
              primary={true}
              showIcon={false}
              label="Save"
              disabled
              hoverText={SAVE_NOTE}
            />
          </div>
        </div>
      )}
    </>
  );

  return (
    <Page
      componentKey={componentKey}
      componentName="crossReferenceTables"
      isRootNavigation={false}
      title={`${title} - ${integration.integrationPackOverrideName || integration.integrationPackName || ''}`}
      description={integration.integrationPackDescription || ''}
      headerContent={<></>}
      bodyContent={bodyContent}
      footerContent={<></>}
      levelOne="My Integrations"
      callbackOne={handleBreadcrumb}
    />
  );
};

UpdateCrossReferences.displayName = 'UpdateCrossReferences';
export default UpdateCrossReferences;
