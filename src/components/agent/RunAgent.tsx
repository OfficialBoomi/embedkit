/**
 * @file OpenAgent.tsx
 * @component OpenAgent
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 *
 * @return {JSX.Element} The rendered agent component.
 */

import {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
} from 'react';
import { usePlugin } from '../../context/pluginContext';
import { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { useAgentStatus } from '../../hooks/agent/useAgentStatus';
import AgentChatGPTLayout from './AgentChatGPTLayout';
import AjaxLoader from '../ui/AjaxLoader';
import AgentPage from './layout/AgentPage';
import logger from '../../logger.service';

/**
 * @interface UpdateSchedulesProps
 *
 * @description
 * Props for the `UpdateSchedules` component.
 *
 * @property {boolean} [componentKey] - Unique key for the component instance
 * @property {IntegrationPack} integration - The integration pack to update schedules for.
 * @property {(val: boolean) => void} [setIsLoading] - Optional callback to set loading state externally.
 * @property {() => void} [onSubmit] - Optional callback invoked after a successful submit.
 * @property {() => void} [onBack] - Optional callback invoked to navigate back in wizard mode.
 * @property {boolean} active - Whether this component is currently active/visible.
 * @property {boolean} wizard - Indicates if the component is used inside a wizard flow.
 */
export interface RunAgentProps {
  componentKey: string 
  integration: IntegrationPackInstance;
  setIsLoading?: (val: boolean) => void;
  onSubmit?: () => void;
  onBack?: () => void;
}

const RunAgent: React.FC<RunAgentProps> = ({
  componentKey,
  integration, 
  setIsLoading, 
  onSubmit, 
  onBack, 
}) => {
  const { setPageIsLoading, boomiConfig, renderComponent } = usePlugin();
  const name = integration.integrationPackOverrideName ? integration.integrationPackName : 'Agent'
  const transport = integration.integrationPackId
    ? boomiConfig?.agents?.[integration.integrationPackId]?.transport
    : undefined;
  const { instance, installed, loading } = useAgentStatus(
    integration.integrationPackId || '', 
    integration.environmentId || '', 
    name || 'Agent',
    transport
  );

  const bodyContent = (
    <AgentChatGPTLayout integration={integration} />
  );

  return (
    <>
      {loading ? (
        <div className="flex justify-center items-center pt-6 m-6">
          <AjaxLoader message="Loading maps..." />
        </div>
      ) : (
        <AgentPage
          integration={integration}
          componentName='runAgent'
          isRootNavigation={false}
          title={`${integration.integrationPackOverrideName}`}
          description={integration.integrationPackDescription || ''}
          headerContent={<></>}
          bodyContent={bodyContent}
          footerContent={<></>}
          levelOne="My Integrations"
          callbackOne={onBack}
        />
      )}
    </>
  );
};
export default RunAgent;
