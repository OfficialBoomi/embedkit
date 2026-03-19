/**
 * @file ExecutionHistory.tsx
 * @component ExecutionHistory
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Displays a list of execution records for a specific integration pack and
 * allows users to view detailed information about a selected execution via a modal.
 *
 * @return {JSX.Element} The rendered execution history view with modal detail support.
 */

import { useState } from 'react';
import { usePlugin } from '../../context/pluginContext';
import { ExecutionRecord } from '@boomi/embedkit-sdk';
import { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import ExecutionHistoryTable from './ExecutionHistoryTable';
import Modal from '../ui/Modal';
import Page from '../core/Page';
import ViewExecutionDetails from './ViewExecutionDetails';
import logger from '../../logger.service';

/**
 * @interface ExecutionHistoryProps
 *
 * @description
 * Props for the `ExecutionHistory` component.
 *
 * @property {boolean} [componentKey] - Unique key for the component instance
 * @property {IntegrationPack} integration - The integration pack whose execution history is shown.
 * @property {() => void} onBack - Callback function invoked when navigating back.
 */
export interface ExecutionHistoryProps {
  componentKey: string
  integration: IntegrationPackInstance;
  onBack: () => void;
}

const ExecutionHistory: React.FC<ExecutionHistoryProps> = ({
  componentKey,
  integration,
  onBack,
}) => {
  const { setPageIsLoading } = usePlugin();
  const [isViewingDetails, setIsViewingDetails] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ExecutionRecord | null>(null)

  const handleViewDetails = (record: ExecutionRecord) => {
    logger.debug('showing execution record:', record)
    setSelectedRecord(record);
    setIsViewingDetails(true);
  };

  const handleClose = () => {
    setIsViewingDetails(false);
    setSelectedRecord(null);
  };

  const bodyContent = (
    <>
      <div className="flex flex-col gap-4 p-4">
        <ExecutionHistoryTable 
          id={integration.id || ''}
          onViewDetails={handleViewDetails}
           />
      </div>
    </>
  );

  return (
    <>
      {isViewingDetails && (
        <Modal
          isOpen={isViewingDetails}
          title={'Execution History Details'}
          description="The details for this execution."
          onClose={() => setIsViewingDetails(false)}
          onSubmit={handleClose}
          submitLabel="Close"
        >
          {selectedRecord && (
            <ViewExecutionDetails record={selectedRecord} />
          )}
        </Modal>
      )}
      <Page
        componentKey={componentKey || 'integrationsMain'}
        componentName='executionHistory'
        isRootNavigation={false}
        title={`Execution History - ${integration.integrationPackOverrideName || integration.integrationPackName}`}
        description={integration.integrationPackDescription || ''}
        headerContent={<></>}
        bodyContent={bodyContent}
        footerContent={<></>}
        levelOne="My Integrations"
        callbackOne={onBack}
      />
    </>
  );
};

export default ExecutionHistory;

