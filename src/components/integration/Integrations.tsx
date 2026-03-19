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
import AddIntegrationForm, { AddIntegrationFormRef } from './AddIntegrationForm';
import AjaxLoader from '../ui/AjaxLoader';
import Button from '../ui/Button';
import Integration from './Integration'; 
import Modal from '../ui/Modal';
import Page from '../core/Page';
import Pagination from '../ui/Pagination'
import SearchBar from '../ui/SearchBar';
import ToastNotification from '../ui/ToastNotification';
import ViewExecutionDetails from './ViewExecutionDetails';
import logger from '../../logger.service';

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
  const simple = boomiConfig?.components?.[componentKey]?.integrations?.simple ?? false;
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
  const { createInstance } = useCreateIntegrationPackInstance();
  const [searchContext, setSearchContext] = useState<string>('');
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const formRef = useRef<AddIntegrationFormRef>(null);
  const hasFetched = useRef(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    integrationPackInstances,
    error,
    isLoading,
    refetch,
    currentPage,
    totalPages,
    goToPage,
  } = useFetchIntegrationPackInstances({ search: searchContext, renderType: renderType });
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

  const handleSubmit = async () => {
    const result = formRef.current?.validateAndSubmit();
    if (!result) return;

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
        if (instance.isAgent) {
          handleRenderEditComponent('RunAgent', instance);
        } else if (instance.installationType === 'SINGLE') {
          handleRenderEditComponent('UpdateSchedules', instance);
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
      setRemovedIds((prev) => new Set(prev).add(integration.id || ''));
      showToast('delete');
      await refetch();
    }
  };

  const handleRunIntegration = async (integration: IntegrationPackInstance) => {
    const recordUrls = await runAllProcesses(integration.environmentId || '', integration.id || '');
    if (recordUrls && !executionError) {
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

  const showSearch = boomiConfig?.components?.[componentKey]?.integrations?.search?.show ?? true;
  const showAdd = boomiConfig?.components?.[componentKey]?.integrations?.addButton?.show ?? true;
  const showType = boomiConfig?.components?.[componentKey]?.integrations?.viewTypeButton?.show ?? true;

  const headerContent = (
    <>
      {showSearch && (
        <div className="flex-none pr-6 pt-4 pb-4">
          <SearchBar searchCallback={searchIntegrations}/>
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
        <ul
          role="list"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8"
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
      {!isLoading && totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={(page) => goToPage(page)}
          />
      )}
    </>
  ) : (
    <div className="">
      <table className='w-full table-auto rounded-lg shadow-sm'>
        <thead className="boomi-table-header">
          <tr>
            <th className="py-3 px-4 text-left text-sm font-semibold w-1/6">Name</th>
            <th className="py-3 text-left text-sm font-semibold w-3/6 w-full">Description</th>
            <th className="py-3 text-left text-sm font-semibold w-1/6">Execution History</th>
            {(boomiConfig?.components?.[componentKey]?.integrations?.integration?.showControls ?? true) && (
              <th className="py-3 px-4"></th>
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
      {!isLoading && totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={(page) => goToPage(page)}
          />
      )}
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
      <Modal
        isOpen={isOpen}
        title={`${boomiConfig?.components?.[componentKey]?.form?.addIntegration?.title || 'Add Integration'}`}
        description={boomiConfig?.components?.[componentKey]?.form?.addIntegration?.description || 'Add a new integration to your environment. Note: This will not deploy the integration, it will only create the integration instance.'}
        onClose={() => setIsOpen(false)}
        onSubmit={handleSubmit}
        submitLabel="Create Integration"
      >
        <AddIntegrationForm ref={formRef} componentKey={componentKey} />
      </Modal>
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
