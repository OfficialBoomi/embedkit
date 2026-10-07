/**
 * @file ConfigureIntegration.tsx
 * @component ConfigureIntegration
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a step-based form to configure and deploy a new integration.
 * Handles environment selection, schedule setup, connection config,
 * and map/field setup across multiple wizard steps.
 *
 * @return {JSX.Element} A multi-step configuration form for integrations.
 */

import { 
  useState, 
  useRef, 
  useEffect} 
  from 'react';
import { usePlugin } from '../../context/pluginContext';
import { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { useRunAllProcesses } from '../../hooks/execution-request/useRunAllProcesses'
import Page from '../core/Page';
import ToastNotification from '../ui/ToastNotification';
import UpdateMaps from './UpdateMaps';
import UpdateConnections, { UpdateConnectionsRef } from './UpdateConnections';
import UpdateSchedules, { UpdateScheduleRef } from './UpdateSchedules';
import Wizard from '../ui/Wizard';
import AjaxLoader from '../ui/AjaxLoader';
import { useEnvironmentExtensionsService } from '../../service/environmentExtensions.service';
import { useMapExtensionsService } from '../../service/mapExtensions.service';
import { BrowseSessionStore } from '../../utils/browseSessionStore';
import logger from '../../logger.service';

type WizardStep = 'connections' | 'maps' | 'schedule';
import { emitEmbedKitEvent } from '../../events.service';

/**
 * @interface ConfigureIntegrationProps
 *
 * @description
 * Props for the `ConfigureIntegration` component.
 *
 * @property {boolean} [componentKey] - Unique key for the component instance
 * @property {IntegrationPack} integration - The integration pack to configure.
 * @property {number} [indexPage] - Optional initial page index to open in the wizard.
 * @property {() => void} onBack - Callback to navigate back or cancel the flow.
 * @property {(id: string) => void} onDelete - Callback to delete an integration by its ID.
 */
export interface ConfigureIntegrationProps {
  componentKey: string 
  integration: IntegrationPackInstance;
  indexPage?: number;
  simple?: boolean;
  onBack: () => void;
  hostId?: string;
}

const ConfigureIntegration: React.FC<ConfigureIntegrationProps> = ({
  componentKey,
  integration,
  simple,
  onBack,
  hostId
}) => {
  const { boomiConfig, setPageIsLoading, renderComponent } = usePlugin();
  const [currentStep, setCurrentStep] = useState(0);
  // Steps with something to configure; null while checking. Schedule is always last.
  const [steps, setSteps] = useState<WizardStep[] | null>(null);
  const { fetchEnvironmentExtensions } = useEnvironmentExtensionsService();
  const { getMapExtensions } = useMapExtensionsService();
  const fetchExtRef = useRef(fetchEnvironmentExtensions);
  fetchExtRef.current = fetchEnvironmentExtensions;
  const getMapsRef = useRef(getMapExtensions);
  getMapsRef.current = getMapExtensions;

  useEffect(() => {
    let cancelled = false;
    const isSingleInstall = integration.installationType === 'SINGLE';
    const environmentId = integration.environmentId || '';
    const integrationPackInstanceId = integration.id || '';
    (async () => {
      const [ext, maps] = await Promise.allSettled([
        fetchExtRef.current({ integrationPackInstanceId, environmentId, isSingleInstall } as any),
        getMapsRef.current({ integrationPackInstanceId, environmentId, isSingleInstall }),
      ]);
      // A failed check keeps the step, so the step itself shows the error.
      const hasConnections = ext.status !== 'fulfilled' || ((ext.value as any)?.combined ?? []).some((e: any) =>
        (e?.connections?.connection?.length ?? 0) > 0 ||
        (e?.processProperties?.ProcessProperty ?? []).some((p: any) => (p?.ProcessPropertyValue?.length ?? 0) > 0));
      const hasMaps = maps.status !== 'fulfilled' || BrowseSessionStore.attachSessionsAndPrune(maps.value ?? []).length > 0;
      if (ext.status === 'rejected') logger.warn('Wizard: connection check failed; keeping the step', ext.reason);
      if (maps.status === 'rejected') logger.warn('Wizard: map check failed; keeping the step', maps.reason);
      if (cancelled) return;
      setSteps([...(hasConnections ? ['connections' as const] : []), ...(hasMaps ? ['maps' as const] : []), 'schedule']);
      setCurrentStep(0);
    })();
    return () => { cancelled = true; };
  }, [integration.id, integration.environmentId, integration.installationType]);
  const step: WizardStep = steps?.[currentStep] ?? 'schedule';
  const updateConnectionsRef = useRef<UpdateConnectionsRef>(null);
  const updateScheduleRef = useRef<UpdateScheduleRef>(null);
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('Integration updated successfully!');
  const {
    error: executionError,
    runAllProcesses,
  } = useRunAllProcesses();
  const connStepKey = `${integration.id}:${step === 'connections' ? 'active' : 'hidden'}`;
  const schedStepKey = `${integration.id}:${step === 'schedule' ? 'active' : 'hidden'}`;

  const pageFor: Record<WizardStep, React.ReactElement> = {
    connections: (
      <UpdateConnections
        componentKey={componentKey}
        key={`update-connections-${connStepKey}`}
        ref={updateConnectionsRef}
        integration={integration}
        setIsLoading={setPageIsLoading}
        active={step === 'connections'}
        wizard={true}
      />
    ),
    maps: (
      <UpdateMaps
        componentKey={componentKey}
        key="map-fields-maps"
        integration={integration}
        setIsLoading={setPageIsLoading}
        active={step === 'maps'}
        wizard={true}
      />
    ),
    schedule: (
      <UpdateSchedules
        componentKey={componentKey}
        key={`update-schedule-${schedStepKey}`}
        ref={updateScheduleRef}
        integration={integration}
        setIsLoading={setPageIsLoading}
        active={step === 'schedule'}
        wizard={true}
      />
    ),
  };
  const labelFor: Record<WizardStep, string> = {
    connections: 'Make Connections',
    maps: 'Map Fields',
    schedule: 'Set Schedule / Run',
  };
  const wizardPages = (steps ?? []).map((s) => pageFor[s]);
  const labels = (steps ?? []).map((s) => labelFor[s]);


  const handleContinue = async () => {
    switch (step) {
      case 'connections': {
        const isValid = await updateConnectionsRef.current?.submit?.();
        if (!isValid) return;
        setCurrentStep((prev) => prev + 1);
        setUpdateMessage('Connections updated successfully!');
        setShowUpdateToast(true);
        break;
      }

      case 'maps': {
        setCurrentStep((prev) => prev + 1);
        setUpdateMessage('Mappings updated successfully!');
        setShowUpdateToast(true);
        break;
      }

      case 'schedule': {
        const isValid = await updateScheduleRef.current?.submit?.();
        if (!isValid) return;
        renderComponent?.({
          component: 'Integrations',
          props: { 
            componentKey: componentKey || 'integrationsMain'
          },
        });
        break;
      }

      default:
        // no-op
        break;
    }
  };

  const handleCancel = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    } else {
      onBack();
    }
  };



  const handleRunNow = async () => {
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
      setShowUpdateToast(true)
      setUpdateMessage('Integration process(s) started successfully!');
    } else if (executionError){
    }
  };

  useEffect(() => {
    if (currentStep === 0) {
      setShowUpdateToast(false);
    }
  }, [currentStep]);

  const bodyContent = steps === null && !simple ? (
    <div className="flex justify-center items-center py-10"><AjaxLoader /></div>
  ) : simple ? (
    <UpdateConnections
      componentKey={componentKey}
      ref={updateConnectionsRef}
      integration={integration}
      setIsLoading={setPageIsLoading}
      active={true}
      wizard={true}
      simple={simple}
    />
  ) : (
    <>
      <Wizard
        numPagesToShow={wizardPages?.length}
        activePage={currentStep}
        labels={labels}
        wizardPages={wizardPages}
        hasAlternateAction={true}
        showAlternateActionIndex={wizardPages?.length - 1}
        alternateActionButtonText={'Run Now'}
        onContinue={handleContinue}
        onCancel={handleCancel}
        onAlternateAction={handleRunNow}
      />
    </>
  );

return (
  <>
    {showUpdateToast && <ToastNotification type="success" content={updateMessage} />}
    <Page
      componentKey={componentKey || 'integrationsMain'}
      componentName='configureIntegration'
      isRootNavigation={false}
      title={`Configure - ${integration.integrationPackOverrideName || integration.integrationPackName || ''}`}
      description={integration.integrationPackDescription || ''}
      bodyContent={bodyContent}
      levelOne="My Integrations"
      callbackOne={onBack}
    />
  </>
);

};

export default ConfigureIntegration;
