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
 * The tables come from the registered data source; nothing is saved from this screen yet.
 *
 * @return {JSX.Element} The rendered UpdateCrossReferences component.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { usePlugin } from '../../context/pluginContext';
import { useDialogs } from '../../hooks/useDialogs';
import { getCrtDataSource } from '../../utils/crt/crtDataSource';
import { createCrtStore, type CrtStore } from '../../utils/crt/crtStore';
import type { CrtMatchType, CrtTableData } from '../../utils/crt/crtTypes';
import AjaxLoader from '../ui/AjaxLoader';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import Dropdown, { type Option } from '../ui/Dropdown';
import Page from '../core/Page';
import CrtGrid from './crt/CrtGrid';
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
const HINT_MS = 3000;

const MATCH_LABEL: Record<CrtMatchType, string> = {
  exact: 'Exact',
  wildcard: 'Wildcard',
  regex: 'Regex',
};

const NO_TABLES: CrtTableData[] = [];
const NOOP_SUBSCRIBE = () => () => {};
const ZERO_VERSION = () => 0;

/** One table per process: the same table id can be used by several processes. */
const tableKey = (t: CrtTableData): string => `${t.processId}:${t.id}`;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

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
  const [hint, setHint] = useState<string | null>(null);
  // One store per table, created the first time the table is selected, so edits survive switching.
  const storesRef = useRef(new Map<string, CrtStore>());
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetOpen = useRef(false);
  const gridWrapRef = useRef<HTMLDivElement>(null);

  // The Override button disappears and the Reset dialog steals focus, so hand it back to the grid.
  const focusGrid = useCallback(() => {
    gridWrapRef.current?.querySelector<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true });
  }, []);

  const ensureStore = useCallback((table: CrtTableData): CrtStore => {
    const key = tableKey(table);
    let store = storesRef.current.get(key);
    if (!store) {
      store = createCrtStore(table);
      storesRef.current.set(key, store);
    }
    return store;
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<CrtTableData[]> => {
      const source = getCrtDataSource();
      return source ? source.listTables() : [];
    };
    load()
      .then((list) => {
        if (!alive) return;
        const tables = sortTables(list);
        if (tables.length > 0) {
          ensureStore(tables[0]);
          setSelectedKey(tableKey(tables[0]));
        }
        setState({ status: 'ready', tables });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setState({
          status: 'error',
          message:
            err instanceof Error && err.message
              ? err.message
              : 'The cross reference tables could not be loaded.',
        });
      });
    return () => {
      alive = false;
    };
  }, [loadAttempt, ensureStore]);

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
  useStoreVersion(store);

  const options: Option[] = tables.map((t) => {
    const key = tableKey(t);
    return { id: key, name: t.name, description: describeTable(t, storesRef.current.get(key)) };
  });
  const selectedOption = options.find((o) => o.id === selectedKey);

  const showTitle = boomiConfig?.components?.[componentKey]?.crossReferenceTables?.showTitle ?? true;
  const title =
    boomiConfig?.components?.[componentKey]?.crossReferenceTables?.title || 'Cross Reference Tables';
  const showDescription =
    boomiConfig?.components?.[componentKey]?.crossReferenceTables?.showDescription ?? true;
  const description =
    boomiConfig?.components?.[componentKey]?.crossReferenceTables?.description ||
    'View the lookup tables of this integration. Turn on Override to edit your own copy.';

  const handleSelect = (option: Option) => {
    const table = tables.find((t) => tableKey(t) === option.id);
    if (!table) return;
    ensureStore(table);
    setSelectedKey(option.id);
  };

  const handleRetry = () => {
    storesRef.current.clear();
    setSelectedKey(null);
    setState({ status: 'loading' });
    setLoadAttempt((n) => n + 1);
  };

  const handleCancel = () => {
    renderComponent?.({
      component: 'Integrations',
      props: {
        componentKey: componentKey || 'integrationsMain',
      },
    });
  };

  const handleOverride = () => {
    store?.override();
    focusGrid();
  };

  const handleReset = async () => {
    if (!store || resetOpen.current) return;
    resetOpen.current = true;
    const target = store;
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
      requestAnimationFrame(focusGrid);
    }
  };

  // Stable, so the memoized grid does not re-render when this screen does.
  const showHint = useCallback(() => {
    setHint(READ_ONLY_HINT);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), HINT_MS);
  }, []);

  const sharedWith = selectedTable
    ? [
        ...new Set(
          tables
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
          <Dropdown
            formName="cross-reference-tables"
            label="Table"
            inputName="table"
            options={options}
            selected={selectedOption}
            onChange={handleSelect}
            searchable
            searchPlaceholder="Search tables..."
          />
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
          >
            {overridden ? 'Overridden' : 'Default'}
          </span>
          <span className="boomi-crt-count">
            {plural(current.rowCount(), 'row', 'rows')}, {plural(current.colCount(), 'column', 'columns')}
          </span>
        </div>

        {overridden ? (
          <div className="boomi-crt-toolbar">
            <Button
              toggle={false}
              primary={false}
              showIcon={false}
              label="Reset to defaults"
              onClick={handleReset}
            />
          </div>
        ) : (
          <div className="boomi-crt-banner">
            <span className="boomi-crt-banner-text">
              Showing the publisher's default values (read only). Turn on Override to edit your own
              copy. Your copy will no longer follow later changes to the defaults.
            </span>
            <Button
              toggle={false}
              primary={true}
              showIcon={false}
              label="Override"
              onClick={handleOverride}
            />
          </div>
        )}

        <div className="boomi-crt-grid-wrap" ref={gridWrapRef}>
          <CrtGrid
            store={current}
            ariaLabel={`${table.name} (${table.processName})`}
            onBlocked={showHint}
          />
        </div>

        <div className="boomi-crt-statusbar">
          <span className="boomi-crt-help">
            {overridden
              ? 'Arrows move. Enter edits. F2 edits at the end. Esc cancels. Tab moves right. Delete clears.'
              : 'Arrows move. Press Override to edit.'}
          </span>
          <span className="boomi-crt-hint" role="status" aria-live="polite">
            {hint}
          </span>
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
          <div className="boomi-crt-empty">
            <p>No cross reference tables to show.</p>
          </div>
        </div>
      ) : (
        <div className="boomi-update boomi-crt-screen">
          {showTitle && <div className="boomi-update-title">{title}</div>}
          {showDescription && <div className="boomi-update-desc">{description}</div>}
          {renderTable(selectedTable, store)}
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
              hoverText="Saving is not connected in this prototype"
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
      callbackOne={onBack}
    />
  );
};

UpdateCrossReferences.displayName = 'UpdateCrossReferences';
export default UpdateCrossReferences;
