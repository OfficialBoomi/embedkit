/**
 * @file Integration.tsx
 * @component Integration
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a Boomi integration pack with action controls.
 * Supports editing, deleting, running, viewing execution history,
 * and viewing details of execution records.
 *
 * @return {JSX.Element} The rendered integration pack component with controls and execution timeline.
 */

import React, { useState, useCallback } from 'react';
import { usePlugin } from '../../context/pluginContext';
import { componentMap } from '../../main';
import { ExecutionRecord } from '@boomi/embedkit-sdk';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import Button from '../ui/Button';
import ExecutionTimeline from './ExecutionTimeline';
import AgentActions from '../agent/AgentActions';
import IntegrationActions from './IntegrationActions';
import SwalNotification from '../ui/SwalNotification';
import IntegrationItem from './IntegrationItem';

/**
 * @interface IntegrationProps
 *
 * @description
 * Props for the `Integration` component.
 *
 * @property {IntegrationPackInstance} integration - The integration pack to display.
 * @property {'on' | 'off'} viewType - The view mode of the integration (`'on'` or `'off'`).
 * @property {(componentName: keyof typeof componentMap, integration: IntegrationPackInstance) => void} onEditClick - Called when the edit button is clicked.
 * @property {(integration: IntegrationPackInstance) => void} onShowHistory - Called to show execution history.
 * @property {(integration: IntegrationPackInstance) => void} onDeleteClick - Called when the delete action is triggered.
 * @property {(integration: IntegrationPackInstance) => void} onRunClick - Called to run the integration.
 * @property {(record: ExecutionRecord) => void} onViewDetails - Called to view details of a specific execution record.
 */
interface IntegrationProps {
  componentKey: string;
  integration: IntegrationPackInstance;
  viewType: 'on' | 'off';
  showUpdateControls?: boolean;
  simple?: boolean;
  onEditClick: (
    componentName: keyof typeof componentMap,
    integration: IntegrationPackInstance
  ) => void;
  onShowHistory: (integration: IntegrationPackInstance) => void;
  onDeleteClick: (integration: IntegrationPackInstance) => void;
  onRunClick: (integration: IntegrationPackInstance) => void;
  onViewDetails: (record: ExecutionRecord) => void;
}

const Integration: React.FC<IntegrationProps> = ({
  componentKey,
  integration,
  viewType,
  showUpdateControls,
  simple,
  onEditClick,
  onShowHistory,
  onDeleteClick,
  onRunClick,
  onViewDetails
}) => {
  const { setPageIsLoading, boomiConfig } = usePlugin();
  const [showNotification, setShowNotification] = useState(false);
  const [showRunNotification, setShowRunNotification] = useState(false);
  const isSingle = !!integration.installationType && integration.installationType === 'SINGLE';
  const title = isSingle ? integration.integrationPackName : integration.integrationPackOverrideName;
  const showEdit = !isSingle;
  const isAgent = !!integration.isAgent;
  const type = isAgent ? 'Agent' : (isSingle ? 'Single Install Integration' : 'Integration');

  const handleDelete = () => setShowNotification(true);
  const handleRunNow = () => setShowRunNotification(true);

  const handleConfirmDelete = () => {
    setShowNotification(false);
    onDeleteClick(integration);
  };

  const handleConfirmRun = () => {
    setPageIsLoading(true);
    setShowRunNotification(false);
    onRunClick(integration);
  };

  const handleCancel = () => {
    setShowNotification(false);
    setShowRunNotification(false);
  };

  return (
    <>
      {showNotification && (
        <SwalNotification
          type="warning"
          title="Are you sure?"
          description="This action cannot be undone."
          showCancel
          confirmButtonText="Yes, delete it!"
          cancelButtonText="No, cancel"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancel}
        />
      )}
      {showRunNotification && (
        <SwalNotification
          type="warning"
          title="Are you sure?"
          description="This action will start all processes associated with this integration."
          showCancel
          confirmButtonText="Yes, run now!"
          cancelButtonText="No, cancel"
          onConfirm={handleConfirmRun}
          onCancel={handleCancel}
        />
      )}
      {viewType === 'off' ? (
        <IntegrationItem
          key={integration.id}
          integration={integration}
          isAgent={isAgent}
        >
          <div className="flex items-center pt-4">
            <div className="flex-1 pl-4 text-sm">{type}</div>
            <div className="flex-none justify-end pr-4"></div>
          </div>

          <div className="flex gap-4 p-4">
            <div className="flex flex-col w-full">
              <h3 className="text-xl font-semibold break-words truncate overflow-hidden pr-2">
                {title}
              </h3>
              <p className="text-xs mt-1 line-clamp-2 break-words overflow-hidden">
                {integration.integrationPackDescription}
              </p>
            </div>
          </div>

          <div className="flex w-full">
            <div className="flex p-2 justify-end items-center gap-x-2 w-full relative overflow-visible">
              {(boomiConfig?.components?.[componentKey]?.integrations?.integration?.showEdit ?? showEdit ?? true) && (
                <>
                  {isAgent ? (
                    <Button
                      toggle={false}
                      primary={true}
                      showIcon={false}
                      label={boomiConfig?.components?.[componentKey]?.integrations?.integration?.agentButton?.label ?? 'Run Agent'}
                      onClick={() => onEditClick('RunAgent', integration)}
                    />
                  ) : (
                    <Button
                      toggle={false}
                      primary={true}
                      showIcon={false}
                      label={boomiConfig?.components?.[componentKey]?.integrations?.integration?.editButton?.label ?? 'Edit'}
                      onClick={() => onEditClick('ConfigureIntegration', integration)}
                    />
                  )}
                </>
              )}
              {(boomiConfig?.components?.[componentKey]?.integrations?.integration?.showControls ?? true) && (
                <>
                  {isAgent ? (
                    <AgentActions
                      onRunNow={() => onEditClick('RunAgent', integration)}
                      onDeleteIntegration={handleDelete}
                    />
                  ) : (
                    <IntegrationActions
                      integration={integration}
                      isSingle={isSingle}
                      onRunNow={handleRunNow}
                      simple={simple}
                      onEditSchedule={() => onEditClick('UpdateSchedules', integration)}
                      onEditConnections={() => onEditClick('UpdateConnections', integration)}
                      onEditMap={() => onEditClick('UpdateMaps', integration)}
                      onDeleteIntegration={handleDelete}
                      onShowHistory={() => onShowHistory(integration)}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </IntegrationItem>

      ) : viewType === 'on' ? (
        <tr key={integration.id} className={`boomi-table-row ${isAgent ? 'boomi-table-row--agent' : ''}`}>
          <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-sm break-words">{title}</td>
          <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-sm break-words">{integration.integrationPackDescription}</td>
          <td className="py-4">
            <ExecutionTimeline
              id={integration.id || ''}
              showFooter={false}
              showHeader={false}
              onViewDetails={onViewDetails}
            />
          </td>
          {(boomiConfig?.components?.[componentKey]?.integrations?.integration?.showControls ?? true) && (
            <td className="flex px-4 pt-4 items-right text-right justify-end relative overflow-visible">
              {isAgent ? (
                <AgentActions
                  onRunNow={() => onEditClick('RunAgent', integration)}
                  onDeleteIntegration={handleDelete}
                />
              ) : (
                <IntegrationActions
                  integration={integration}
                  isSingle={isSingle}
                  onRunNow={handleRunNow}
                  simple={simple}
                  onEditSchedule={() => onEditClick('UpdateSchedules', integration)}
                  onEditConnections={() => onEditClick('UpdateConnections', integration)}
                  onEditMap={() => onEditClick('UpdateMaps', integration)}
                  onDeleteIntegration={handleDelete}
                  onShowHistory={() => onShowHistory(integration)}
                />
              )}

            </td>
          )}
        </tr>
      ) : null}
    </>
  );
};

export default Integration;
