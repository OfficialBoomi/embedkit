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
  const updateConnectionsRef = useRef<UpdateConnectionsRef>(null);
  const updateScheduleRef = useRef<UpdateScheduleRef>(null);
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('Integration updated successfully!');
  const {
    error: executionError,
    runAllProcesses,
  } = useRunAllProcesses();
 const connStepKey = `${integration.id}:${currentStep === 0 ? 'active' : 'hidden'}`;
 const schedStepKey = `${integration.id}:${currentStep === 2 ? 'active' : 'hidden'}`;

  const wizardPages = [
    <UpdateConnections
      componentKey={componentKey}
      key={`update-connections-${connStepKey}`}
      ref={updateConnectionsRef}
      integration={integration}
      setIsLoading={setPageIsLoading}
      active={currentStep === 0}
      wizard={true}
    />,
    <UpdateMaps
      componentKey={componentKey}
      key="map-fields-maps"
      integration={integration}
      setIsLoading={setPageIsLoading}
      active={currentStep === 1}
      wizard={true}
    />,
    <UpdateSchedules
      componentKey={componentKey}
      key={`update-schedule-${schedStepKey}`}
      ref={updateScheduleRef}
      integration={integration}
      setIsLoading={setPageIsLoading}
      active={currentStep === 2}
      wizard={true}
    />,
  ];

  const labels = [
    "Make Connections",
    "Map Fields",
    "Set Schedule / Run",
  ];


  const handleContinue = async () => {
    switch (currentStep) {
      case 0: {
        const isValid = await updateConnectionsRef.current?.submit?.();
        if (!isValid) return;
        setCurrentStep((prev) => prev + 1);
        setUpdateMessage('Connections updated successfully!');
        setShowUpdateToast(true);
        break;
      }

      case 1: {
        setCurrentStep(2);
        setUpdateMessage('Mappings updated successfully!');
        setShowUpdateToast(true);
        break;
      }

      case 2: {
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

  const bodyContent = simple ? (
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
      title={`Configure - ${integration.integrationPackOverrideName}`}
      description={integration.integrationPackDescription || ''}
      bodyContent={bodyContent}
      levelOne="My Integrations"
      callbackOne={onBack}
    />
  </>
);

};

export default ConfigureIntegration;
