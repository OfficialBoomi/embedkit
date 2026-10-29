/**
 * @file Integrations.tsx
 * @component Integrations
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The `Integrations` component displays a list of integration packs and allows users to add, edit, run, and delete integrations.
 * It supports both grid and table views, search functionality, execution history viewing, and pagination.
 * Provides UI for adding new integrations via a modal form and integrates with Boomi hooks for fetching, creating,
 * deleting, and running integration packs.
 *
 * @return {JSX.Element} A fully functional integrations component with search, view, edit, delete, run, and history capabilities.
 */

import { 
  useEffect, 
  useState, 
  useRef
} from 'react';
import { 
  AiOutlinePlus, 
  AiOutlineTable, 
  AiOutlineAppstore 
} from 'react-icons/ai';
import { usePlugin } from '../../context/pluginContext';
import { componentMap } from '../../main'
import { ExecutionRecord } from '@boomi/embedkit-sdk';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { 
  useCreateIntegrationPackInstance 
} from "../../hooks/integration-pack-instance/useCreateIntegrationPackInstance";
import { 
  useDeleteIntegrationPackInstance 
} from '../../hooks/integration-pack-instance/useDeleteIntegrationPackInstance';
import { 
  useFetchIntegrationPackInstances 
} from '../../hooks/integration-pack-instance/useFetchIntegrationPackIntances';
import { 
  useRunAllProcesses 
} from '../../hooks/execution-request/useRunAllProcesses'
import AddIntegrationForm, { AddIntegrationFormRef, type AddIntegrationFormResult } from './AddIntegrationForm';
import AddIntegrationCatalog from './AddIntegrationCatalog';
import { uiVersionAtLeast, UI_VERSIONS } from '../../utils/ui-version';
import AjaxLoader from '../ui/AjaxLoader';
import Button from '../ui/Button';
import Integration from './Integration'; 
import Modal from '../ui/Modal';
import Page from '../core/Page';
import Pagination from '../ui/Pagination'
import { paginationPlacement, resolvePaginationOptions } from '../../utils/pagination'
import SearchBar from '../ui/SearchBar';
import ListFilterButton from '../ui/ListFilterButton';
import ListSortButton from '../ui/ListSortButton';
import { EMPTY_FILTERS, useIntegrationPacksService, type ListFilters, type ListSort } from '../../service/integrationPacks.service';
import {
  LIST_SORT_OPTIONS,
  forgetStoredSort,
  isNewerSort,
  readStoredSort,
  resolveDefaultSort,
  resolveInitialSort,
  resolveSortOptions,
  storeSort,
} from '../../utils/listSort';
import { readListState, writeListState } from '../../utils/listState';
import { AiOutlineArrowUp, AiOutlineArrowDown, AiOutlineSwap } from 'react-icons/ai';
import ToastNotification from '../ui/ToastNotification';
import ViewExecutionDetails from './ViewExecutionDetails';
import logger from '../../logger.service';
import { emitEmbedKitEvent } from '../../events.service';

/**
 * @interface IntegrationsProps
 *
 * @description Props for the `Integrations` component.
 *
 * @property {boolean} [showUpdateControls] - Flag indicating whether to show update controls.
 * @property {boolean} [componentKey] - Optional unique key for the component instance
 * @property {'on' | 'off'} [defaultView] - Default view mode for displaying integrations, either 'on' or 'off'.
 */
export interface IntegrationsProps {
  componentKey: string 
  showUpdateControls?: boolean;
}

const Integrations: React.FC<IntegrationsProps> = ({ 
  componentKey,
  showUpdateControls
  }) => {
  const { boomiConfig, setPageIsLoading, renderComponent } = usePlugin();
  const renderType = boomiConfig?.components?.[componentKey]?.renderType ?? 'all';
  // 1.7 UI (catalog, connector icons, environment chip) only when this component opts in via uiVersion.
  const catalogUi = uiVersionAtLeast(boomiConfig, componentKey, UI_VERSIONS.CATALOG);
  const simple = boomiConfig?.components?.[componentKey]?.integrations?.simple ?? false;
  const showEnvironmentColumn: boolean = boomiConfig?.components?.[componentKey]?.integrations?.integration?.showEnvironment ?? catalogUi;
  const listCfg = boomiConfig?.components?.[componentKey]?.integrations ?? {};
  const sortCfg = listCfg.sort;
  const showFilter: boolean = listCfg.filter?.show ?? catalogUi;
  const sortable: boolean = listCfg.table?.sortable ?? catalogUi;
  // The Sort by menu follows the sortable table headers unless `integrations.sort.show` says otherwise.
  const showSortMenu: boolean = sortCfg?.show ?? sortable;
  const [toasts, setToasts] = useState<{
    delete: boolean;
    update: boolean;
    startSuccess: boolean;
    startError: boolean;
  }>({
    delete: false,
    update: showUpdateControls || false,
    startSuccess: false,
    startError: false,
  });
  const { deleteIntegrationPackInstance } = useDeleteIntegrationPackInstance();
  const { markIntegrationPackViewed } = useIntegrationPacksService();
  const { createInstance } = useCreateIntegrationPackInstance();
  const [searchContext, setSearchContext] = useState<string>('');
  // Server-side filter and sort (1.7 UI). Changing either goes back to page 1.
  // Page and filters this tab remembers from before the list was left (for example to open a pack). Filters are only
  // restored when the filter button is shown, so a remembered filter can never be stuck on with no way to clear it;
  // without that button a remembered filtered page is not used either.
  const [restored] = useState(() => {
    const saved = readListState(String(componentKey));
    if (!saved || showFilter) return saved;
    return saved.filters.environmentIds.length || saved.filters.connectorTypes.length ? undefined : saved;
  });
  const [filters, setFilters] = useState<ListFilters>(() => restored?.filters ?? EMPTY_FILTERS);
  // Starts where the user left it, else at the host's `integrations.sort.default`, else Default order. A remembered sort
  // is only used while some sort control (the menu or the table headers) is shown.
  const [sort, setSort] = useState<ListSort | undefined>(() => {
    const options = resolveSortOptions(sortCfg?.options, showEnvironmentColumn);
    return sortable || showSortMenu
      ? resolveInitialSort(String(componentKey), sortCfg?.default, options)
      : resolveDefaultSort(sortCfg?.default, options);
  });
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const formRef = useRef<AddIntegrationFormRef>(null);
  const hasFetched = useRef(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const paginationRaw = boomiConfig?.components?.[componentKey]?.integrations?.pagination;
  const {
    integrationPackInstances,
    error,
    isLoading,
    refetch,
    currentPage,
    totalPages,
    goToPage,
    loadFacets,
    sortUnsupported,
  } = useFetchIntegrationPackInstances({
    search: searchContext,
    renderType: renderType,
    includeConnectors: boomiConfig?.components?.[componentKey]?.integrations?.integration?.showConnectors ?? catalogUi,
    sort,
    filters,
    pageSize: paginationRaw?.pageSize,
    initialPage: restored?.page,
  });
  const pagination = resolvePaginationOptions(paginationRaw);
  const paginationBefore = paginationPlacement(pagination.position) === 'before';
  const paginationControls =
    !isLoading && totalPages > 1 ? (
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => goToPage(page)}
        position={pagination.position}
        alignment={pagination.alignment}
        styles={pagination.styles}
      />
    ) : null;
  // A pinned bar covers the last rows; leave room under the list for it.
  const paginationSpacer =
    paginationControls && pagination.position === 'fixed-bottom' ? <div className="h-20" aria-hidden="true" /> : null;
  // An older server rejects Created and Last viewed; the list then loads without them and they are not offered.
  const sortOptions = resolveSortOptions(sortCfg?.options, showEnvironmentColumn).filter(
    (by) => !(sortUnsupported && isNewerSort(by))
  );
  useEffect(() => {
    if (!sortUnsupported) return;
    setSort((cur) => (cur && isNewerSort(cur.by) ? undefined : cur));
    // Do not keep trying a remembered sort the server cannot do.
    const stored = readStoredSort(String(componentKey), LIST_SORT_OPTIONS);
    if (stored && isNewerSort(stored.by)) forgetStoredSort(String(componentKey));
  }, [sortUnsupported, componentKey]);
  // Remember the page and filters for the length of this tab, so coming back from a pack lands where the user was.
  // A search is not remembered, and a page number only fits the list it came from, so while one is active the page is
  // kept as 1 and only the filters carry over.
  useEffect(() => {
    writeListState(String(componentKey), { page: searchContext ? 1 : currentPage, filters });
  }, [componentKey, currentPage, filters, searchContext]);
  /** Applies a sort the user picked, remembers it in this browser and returns to page 1. */
  const applySort = (next: ListSort | undefined) => { setSort(next); storeSort(String(componentKey), next); goToPage(1); };
  const changeSortFromMenu = applySort;
  const changeFilters = (next: ListFilters) => { setFilters(next); goToPage(1); };
  /** Click a header: ascending, then descending, then back to the default order. */
  const changeSort = (by: ListSort['by']) => {
    applySort(sort?.by !== by ? { by, dir: 'asc' } : sort.dir === 'asc' ? { by, dir: 'desc' } : undefined);
  };
  const header = (by: ListSort['by'], label: string) => {
    if (!sortable) return label;
    const activeDir = sort?.by === by ? sort.dir : undefined;
    const Icon = activeDir === 'asc' ? AiOutlineArrowUp : activeDir === 'desc' ? AiOutlineArrowDown : AiOutlineSwap;
    return (
      <button type="button" className={`boomi-sort${activeDir ? ' boomi-sort--active' : ''}`} onClick={() => changeSort(by)}>
        {label}
        <Icon className="boomi-sort__icon" style={activeDir ? undefined : { transform: 'rotate(90deg)' }} aria-hidden="true" />
      </button>
    );
  };
  const ariaSort = (by: ListSort['by']) =>
    sortable ? (sort?.by === by ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined;
  const {
    isRunning,
    error: executionError,
    runAllProcesses,
  } = useRunAllProcesses();
  const [isViewingDetails, setIsViewingDetails] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ExecutionRecord | null>(null);
  const storageKey = `integrations-list-all:${componentKey}`;
  const [viewType, setViewType] = useState<'on' | 'off'>('off');
  const coerceView = (v?: string | null): 'on' | 'off' | undefined => normalizeView(v ?? undefined);
  const normalizeView = (v?: string | boolean | null): 'on' | 'off' | undefined => {
    if (v === true) return 'on';
    if (v === false) return 'off';
    if (typeof v === 'string') {
      const lc = v.toLowerCase();
      if (lc === 'table' || lc === 'on') return 'on';
      if (lc === 'grid'  || lc === 'off') return 'off';
    }
    return undefined;
  };

  const showToast = (type: keyof typeof toasts) => {
    setToasts((prev) => ({ ...prev, [type]: true }));
    setTimeout(() => {
      setToasts((prev) => ({ ...prev, [type]: false }));
    }, 3000); 
  };

  const handleViewDetails = (record: ExecutionRecord) => {
    logger.debug('showing execution record:', record)
    setSelectedRecord(record);
    setIsViewingDetails(true);
  };

  const handleViewClose = () => {
    setIsViewingDetails(false);
    setSelectedRecord(null);
  };

  const visibleIntegrations = integrationPackInstances.filter(
    (integration) => !removedIds.has(integration.id || '')
  );
  const visibleListIntegrations = visibleIntegrations.filter((integration) => !integration.isAgent);

  /** Legacy dropdown form: validate, then install. */
  const handleSubmit = async () => {
    const result = formRef.current?.validateAndSubmit();
    if (!result) return;
    await installIntegration(result);
  };

  /** Shared install path for both the legacy form and the catalog. */
  const installIntegration = async (result: AddIntegrationFormResult) => {
    setIsOpen(false);
    setApiError(null);
    setPageIsLoading(true);
    try {
      logger.debug('Creating integration instance with:', result);
      const instance = await createInstance(
        result.integrationPackId || '',
        result.isSingle || false,
        result.environmentId,
        result.integrationName
      );
      if (instance) {
        emitEmbedKitEvent(
          'integration.instance.created',
          {
            integrationPackInstanceId: instance.id,
            integrationPackId: instance.integrationPackId,
            environmentId: instance.environmentId,
            componentKey,
          },
          {
            integrationPackInstanceId: instance.id || '',
            integrationPackId: instance.integrationPackId,
            integrationPackName: instance.integrationPackName,
            environmentId: instance.environmentId,
            installationType: instance.installationType,
            isAgent: instance.isAgent,
          }
        );
        // One-time seed of the partner's default mappings ran server-side during
        // install (SDK createAndAttachIntegrationPackInstance). Surface its result
        // so the host app can alert on maps that were not seeded.
        const seed = (instance as any).mapDefaultsSeed;
        if (seed) {
          if (seed.failed?.length) {
            logger.warn('Default mappings were not seeded for some maps', seed.failed);
          }
          emitEmbedKitEvent(
            'map.defaults.seeded',
            {
              integrationPackInstanceId: instance.id,
              integrationPackId: instance.integrationPackId,
              environmentId: instance.environmentId,
              componentKey,
            },
            {
              integrationPackInstanceId: instance.id || '',
              environmentId: instance.environmentId,
              summariesFound: seed.summariesFound,
              seeded: seed.seeded,
              skipped: seed.skipped,
              failed: seed.failed,
            }
          );
        }
        // Agents open Run Agent; every integration, single-install included, opens the setup wizard.
        if (instance.isAgent) {
          handleRenderEditComponent('RunAgent', instance);
        } else {
          handleRenderEditComponent('ConfigureIntegration', instance);
        }
      }
    } catch (error: any) {
      setApiError(error.message || 'Failed to install integration');
      logger.error('Install error:', error);
    }
  };

  const onBack = () => {
   renderComponent?.({
      component: 'Integrations',
      props: { 
        componentKey: componentKey || 'integrationsMain'
      },
    });
  };

  const handleRenderEditComponent = (
    componentName: keyof typeof componentMap,
    integration: IntegrationPackInstance
  ) => {
    // Feeds the Last viewed sort. Fire and forget: a failure never delays opening the pack.
    if (showSortMenu && sortOptions.includes('lastViewed') && integration?.id) markIntegrationPackViewed(integration.id);
    setPageIsLoading(true);
    renderComponent?.({
      component: componentName || 'ConfigureIntegration',
      props: {
        componentKey: componentKey || 'integrationsMain',
        integration: integration,
        simple: simple,
        onBack,
      },
    });
  };

  const handleShowHistory = (integration: IntegrationPackInstance) => {
    setPageIsLoading(true);
    renderComponent?.({
      component: 'ExecutionHistory',
      props: {
        componentKey: componentKey || 'integrationsMain',
        integration,
        onBack
      }
    });
  };

  const handleDelete = async (integration: IntegrationPackInstance) => {
    const success = await deleteIntegrationPackInstance(integration.id || '');
    if (success) {
      // Deletion returns no server body — the identifying data only exists
      // in the component's already-fetched `integration` object.
      emitEmbedKitEvent(
        'integration.instance.deleted',
        {
          integrationPackInstanceId: integration.id,
          integrationPackId: integration.integrationPackId,
          environmentId: integration.environmentId,
          componentKey,
        },
        {
          integrationPackInstanceId: integration.id || '',
          integrationPackId: integration.integrationPackId,
          integrationPackName: integration.integrationPackName,
          environmentId: integration.environmentId,
          installationType: integration.installationType,
          isAgent: integration.isAgent,
        }
      );
      setRemovedIds((prev) => new Set(prev).add(integration.id || ''));
      showToast('delete');
      await refetch();
    }
  };

  const handleRunIntegration = async (integration: IntegrationPackInstance) => {
    const recordUrls = await runAllProcesses(integration.environmentId || '', integration.id || '');
    if (recordUrls && !executionError) {
      emitEmbedKitEvent(
        'integration.processes.run',
        {
          integrationPackInstanceId: integration.id,
          integrationPackId: integration.integrationPackId,
          environmentId: integration.environmentId,
          componentKey,
        },
        {
          integrationPackInstanceId: integration.id || '',
          environmentId: integration.environmentId,
          recordUrls,
        }
      );
      setPageIsLoading(false);
      showToast('startSuccess');
    } else if (executionError){
      showToast('startError');
    }
  };

  const updateTableView = () => {
    const storedViewType = coerceView(localStorage.getItem(storageKey));
    if (storedViewType) setViewType(storedViewType);
  };

  const searchIntegrations = (value: string) => {
    setSearchContext(value);
  };

  useEffect(() => {
    if (showUpdateControls) {
      showToast('update');
    }
  }, [showUpdateControls]);


  useEffect(() => {
    if (!hasFetched.current) hasFetched.current = true;
    const node =
      boomiConfig?.components?.[componentKey]?.integrations ??
      {};

    const forced     = !!node.forceDefaultView;
    const configured = normalizeView(node.defaultView as any);
    const stored     = coerceView(localStorage.getItem(storageKey));

    // Debug once to make sure config is where you think it is
    logger.debug('Integrations view init', {
      componentKey,
      storageKey,
      forced,
      configured,
      stored,
    });

    if (forced) {
      const next = configured ?? 'off';
      setViewType(next);
      try { localStorage.setItem(storageKey, next); } catch {}
      return;
    }

    if (stored) {
      setViewType(stored);
      return;
    }

    if (configured) {
      setViewType(configured);
      try { localStorage.setItem(storageKey, configured); } catch {}
      return;
    }

    setViewType('off');
    try { localStorage.setItem(storageKey, 'off'); } catch {}
  }, [boomiConfig, componentKey, storageKey]);

  useEffect(() => {
      setPageIsLoading(isRunning);
    }, [isRunning, setPageIsLoading]);

  // 'catalog': searchable cards/table with connector icons and scoped environments.
  // 'form': the dropdown-based form. Default follows the component's uiVersion.
  const layoutCfg = boomiConfig?.components?.[componentKey]?.form?.addIntegration?.layout;
  const addIntegrationLayout: 'catalog' | 'form' =
    layoutCfg === 'form' || layoutCfg === 'catalog' ? layoutCfg : catalogUi ? 'catalog' : 'form';
  const existingIntegrationNames = integrationPackInstances
    .map((i) => i.integrationPackOverrideName || i.integrationPackName)
    .filter((n): n is string => !!n);

  const showSearch = boomiConfig?.components?.[componentKey]?.integrations?.search?.show ?? true;
  const showAdd = boomiConfig?.components?.[componentKey]?.integrations?.addButton?.show ?? true;
  const showType = boomiConfig?.components?.[componentKey]?.integrations?.viewTypeButton?.show ?? true;

  const headerContent = (
    <>
      {showSearch && (
        <div className={showFilter ? 'boomi-list-search' : 'boomi-list-search-plain'}>
          <SearchBar
            searchCallback={searchIntegrations}
            suggestions={Array.from(
              new Set(
                integrationPackInstances
                  .map((i) => i.integrationPackOverrideName || i.integrationPackName)
                  .filter((n): n is string => !!n)
              )
            )}
          />
          {showFilter && (
            <ListFilterButton value={filters} onChange={changeFilters} loadFacets={loadFacets} facetsKey={`${renderType}|${searchContext}`} />
          )}
        </div>
      )}
      {!showSearch && showFilter && (
        <div className="boomi-list-search">
          <ListFilterButton value={filters} onChange={changeFilters} loadFacets={loadFacets} facetsKey={`${renderType}|${searchContext}`} />
        </div>
      )}
      {showAdd && (
        <div className="flex-1 pr-4 pt-4">
          <Button
            toggle={false}
            primary={true}
            showIcon={true}
            label={boomiConfig?.components?.[componentKey]?.integrations?.addButton?.label}
            icon={<AiOutlinePlus className="h-5 w-5" />}
            onClick={() => setIsOpen(true)}
          />
        </div>
      )}
      {showSortMenu && sortOptions.length > 0 && (
        <div className="flex-none pt-4 pr-4">
          <ListSortButton value={sort} onChange={changeSortFromMenu} options={sortOptions} />
        </div>
      )}
      {showType && (
        <div className="flex-none pt-4 pr-4">
          <Button
            toggle
            primary={false}
            viewLoc={storageKey}         
            onClass="flex w-full justify-center rounded-md px-2 py-2 text-xs font-semibold leading-6 shadow-md transition-colors duration-100"
            showIcon={true}
            label={boomiConfig?.components?.[componentKey]?.integrations?.viewTypeButton?.label}
            icon={<AiOutlineTable className="h-5 w-5" />}
            onIcon={<AiOutlineAppstore className="h-5 w-5" />}
            onClick={updateTableView}
          />
        </div>
      )}
    </>
  );

  const bodyContent = viewType === 'off' ? (
    <>
        {paginationBefore && paginationControls}
        <ul
          role="list"
          className={
            catalogUi
              ? 'boomi-integration-grid'
              : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8'
          }
        >
        {isLoading ? (
          <div className="col-span-full flex justify-center items-center"><AjaxLoader /></div>
        ) : visibleIntegrations.length > 0 ? (
          visibleIntegrations.map((integration) => (
            <Integration
              componentKey={componentKey}
              key={integration.id}
              viewType="off"
              integration={integration}
              simple={simple}
              onEditClick={handleRenderEditComponent}
              onDeleteClick={handleDelete}
              onShowHistory={handleShowHistory}
              onViewDetails={handleViewDetails}
              onRunClick={handleRunIntegration}
            />
          ))
        ) : (
          <div className="col-span-full flex justify-center items-center">
            <p className="text-gray-500 text-xs">No integrations found.</p>
          </div>
        )}
      </ul>
      {!paginationBefore && paginationControls}
      {paginationSpacer}
    </>
  ) : (
    <div className="">
      {paginationBefore && paginationControls}
      <table className="boomi-integrations-table">
        <thead className="boomi-table-header">
          <tr>
            <th className="boomi-integrations-table__th boomi-integrations-table__th--name" aria-sort={ariaSort('name')}>{header('name', 'Name')}</th>
            <th className="boomi-integrations-table__th boomi-integrations-table__th--description" aria-sort={ariaSort('description')}>{header('description', 'Description')}</th>
            {showEnvironmentColumn && (
              <th className="boomi-integrations-table__th boomi-integrations-table__th--environment" aria-sort={ariaSort('environment')}>{header('environment', 'Environment')}</th>
            )}
            <th className="boomi-integrations-table__th boomi-integrations-table__th--history">Execution History</th>
            {(boomiConfig?.components?.[componentKey]?.integrations?.integration?.showControls ?? true) && (
              <th className="boomi-integrations-table__th-actions"></th>
            )}
          </tr>
        </thead>

        <tbody className="divide-y">
          {isLoading ? (
            <tr>
              <td colSpan={5}>
                <div className="flex justify-center items-center py-6"><AjaxLoader /></div>
              </td>
            </tr>
          ) : visibleListIntegrations.length > 0 ? (
            visibleListIntegrations.map((integration) => (
              <Integration
                componentKey={componentKey}
                key={integration.id}
                viewType="on"
                integration={integration}
                simple={simple}
                onEditClick={handleRenderEditComponent}
                onDeleteClick={handleDelete}
                onShowHistory={handleShowHistory}
                onViewDetails={handleViewDetails}
                onRunClick={handleRunIntegration}
              />
            ))
          ) : visibleIntegrations.length > 0 ? (
            <tr>
              <td colSpan={5}>
                <div className="flex justify-center items-center py-4">
                  <p className="text-gray-500 text-xs">No integrations found.</p>
                </div>
              </td>
            </tr>
          ) : (
            <tr>
              <td colSpan={5}>
                <div className="flex justify-center items-center py-4">
                  <p className="text-gray-500 text-xs">No integrations found.</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!paginationBefore && paginationControls}
      {paginationSpacer}
    </div>
  );
  const errorMsg = error || apiError;
  return (
    <>
      <>
        {toasts.delete && <ToastNotification type="success" content="Integration deleted successfully!" />}
        {toasts.update && <ToastNotification type="success" content="Integration updated successfully!" />}
        {toasts.startSuccess && <ToastNotification type="success" content="Integration process(s) started successfully!" />}
        {toasts.startError && <ToastNotification type="error" content={`Error starting integrations: ${executionError}`} />}
      </>
      {isViewingDetails && (
        <Modal
          isOpen={isViewingDetails}
          title={`${boomiConfig?.components?.[componentKey]?.integrations?.executionHistoryDetails?.title || 'Execution History Details'}`}
          description={boomiConfig?.components?.[componentKey]?.integrations?.executionHistoryDetails?.description || 'The details for this execution.'}
          showCancelButton={false}
          onSubmit={handleViewClose}
          submitLabel="Close"
        >
          {selectedRecord && (
            <ViewExecutionDetails record={selectedRecord} />
          )}
        </Modal>
      )}
      {addIntegrationLayout === 'form' ? (
        <Modal
          isOpen={isOpen}
          title={`${boomiConfig?.components?.[componentKey]?.form?.addIntegration?.title || 'Add Integration'}`}
          description={boomiConfig?.components?.[componentKey]?.form?.addIntegration?.description || 'Add a new integration to your environment. Note: This will not deploy the integration, it will only create the integration instance.'}
          onClose={() => setIsOpen(false)}
          onSubmit={handleSubmit}
          submitLabel="Create Integration"
        >
          <AddIntegrationForm
            ref={formRef}
            componentKey={componentKey}
            existingIntegrationNames={existingIntegrationNames}
          />
        </Modal>
      ) : (
        <Modal
          isOpen={isOpen}
          size="catalog"
          title={`${boomiConfig?.components?.[componentKey]?.form?.addIntegration?.title || 'Add Integration'}`}
          description={boomiConfig?.components?.[componentKey]?.form?.addIntegration?.description || 'Choose an integration to install. This creates the integration instance in the selected environment; it does not deploy it.'}
          onClose={() => setIsOpen(false)}
          showSaveButton={false}
          showCancelButton={false}
        >
          {isOpen && (
            <AddIntegrationCatalog
              componentKey={componentKey}
              renderType={renderType}
              existingIntegrationNames={existingIntegrationNames}
              onInstall={installIntegration}
            />
          )}
        </Modal>
      )}
      <Page
        componentKey={componentKey}
        componentName='integrations'
        isRootNavigation={true}
        title={`${boomiConfig?.components?.[componentKey]?.integrations?.header?.title || 'Integrations'}`}
        description={boomiConfig?.components?.[componentKey]?.integrations?.header?.description || 'View your integrations below.'}
        headerContent={headerContent}
        bodyContent={bodyContent}
        error={
          errorMsg
            ? {
                header: 'Error',
                message: errorMsg,
                errorType: 'error',
              }
            : undefined
        }
        levelOne="My Integrations"
        callbackOne={onBack}
      />
    </>
  );
};

export default Integrations;
