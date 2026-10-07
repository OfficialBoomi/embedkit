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
import ConnectorStack from './ConnectorStack';
import { uiVersionAtLeast, UI_VERSIONS } from '../../utils/ui-version';

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
  const isAgent = !!integration.isAgent;
  const type = isAgent ? 'Agent' : (isSingle ? 'Single Install Integration' : 'Integration');
  // Environment chip: every in-scope attachment from the server (SDK `environments`), first name + "+N".
  // Chip and connector icons are 1.7 UI; components on an earlier uiVersion keep the old card.
  const catalogUi = uiVersionAtLeast(boomiConfig, componentKey, UI_VERSIONS.CATALOG);
  const showEnvironment = boomiConfig?.components?.[componentKey]?.integrations?.integration?.showEnvironment ?? catalogUi;
  const envRefs: Array<{ id: string; name?: string; classification?: string }> =
    ((integration as any).environments as Array<{ id: string; name?: string; classification?: string }> | undefined) ?? [];
  const primaryEnv = envRefs.find((e) => e.id === integration.environmentId) ?? envRefs[0];
  const otherEnvs = envRefs.filter((e) => e !== primaryEnv);
  // Unattached: the server reported the instance's environments and there are none
  // (an older server sends no list, so nothing is shown rather than a false warning).
  const unattached = Array.isArray((integration as any).environments) && envRefs.length === 0;
  const unattachedLabel: string =
    boomiConfig?.components?.[componentKey]?.integrations?.integration?.unattachedLabel ?? 'Unattached';
  const unattachedChip = (
    <span
      className="boomi-integration-card__env boomi-integration-card__env--unattached"
      title="Not attached to any environment. Attach it in the platform before running or editing it."
    >
      <span className="boomi-integration-card__env-name">{unattachedLabel}</span>
    </span>
  );
  const envChip = showEnvironment && unattached ? unattachedChip : showEnvironment && primaryEnv ? (
    <span
      className="boomi-integration-card__env"
      title={envRefs.map((e) => `${e.name ?? e.id}${e.classification ? ` (${e.classification})` : ''}`).join(', ')}
      data-classification={primaryEnv.classification?.toLowerCase()}
    >
      <span className="boomi-integration-card__env-name">{primaryEnv.name ?? primaryEnv.id}</span>
      {otherEnvs.length > 0 && <span className="boomi-integration-card__env-more">+{otherEnvs.length}</span>}
    </span>
  ) : null;

  // Connector icons for the pack (server attaches connectors[] when showConnectors is on).
  const cardCfg = boomiConfig?.components?.[componentKey]?.integrations?.integration ?? {};
  const showConnectors: boolean = cardCfg.showConnectors ?? catalogUi;
  const connectorIconSize: number = Number(cardCfg.connectorIconSize ?? 36) || 36;

  // Card layout. On the 1.7 UI the type row is off by default, the actions menu sits at the
  // right of the top visible row, and an integration card opens Edit when clicked instead of
  // showing an Edit button. Agent cards keep their Run Agent button.
  const showType: boolean = cardCfg.showType ?? !catalogUi;
  const showEdit: boolean = cardCfg.showEdit ?? true;
  const showControls: boolean = cardCfg.showControls ?? true;
  const showEditButton: boolean = isAgent || (cardCfg.editButton?.show ?? !catalogUi);
  const menuOnTop = catalogUi;
  const cardOpensEdit = !isAgent && showEdit && !showEditButton;
  const openEdit = () => onEditClick('ConfigureIntegration', integration);

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

  // Actions menu for the top row. Clicks and keys inside it never reach the clickable card.
  const topMenu = showControls ? (
    <div
      className="boomi-integration-card__menu"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {isAgent ? (
        <AgentActions
          onRunNow={() => onEditClick('RunAgent', integration)}
          onDeleteIntegration={handleDelete}
        />
      ) : (
        <IntegrationActions
          integration={integration}
          onRunNow={handleRunNow}
          simple={simple}
          onEditSchedule={() => onEditClick('UpdateSchedules', integration)}
          onEditConnections={() => onEditClick('UpdateConnections', integration)}
          onEditMap={() => onEditClick('UpdateMaps', integration)}
          onDeleteIntegration={handleDelete}
          onShowHistory={() => onShowHistory(integration)}
          {...(cardOpensEdit ? { onEdit: openEdit, editLabel: cardCfg.editButton?.label ?? 'Edit' } : {})}
        />
      )}
    </div>
  ) : null;

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
          className={catalogUi ? 'boomi-integration-card--ui-1-7' : undefined}
          onActivate={cardOpensEdit ? openEdit : undefined}
          activateLabel={`${cardCfg.editButton?.label ?? 'Edit'} ${title ?? ''}`.trim()}
        >
          {showType && (
            <div className="boomi-integration-card__header">
              <div className="boomi-integration-card__type">{type}</div>
              <div className="boomi-integration-card__header-extra">{menuOnTop && topMenu}</div>
            </div>
          )}

          <div className="boomi-integration-card__body">
            <div className={`boomi-integration-card__content${showConnectors ? ' boomi-integration-card__content--connectors' : ''}`}>
              <div className="boomi-integration-card__title-row">
                <h3 className="boomi-integration-card__title">
                  {title}
                </h3>
                {menuOnTop && !showType && topMenu}
              </div>
              <p className="boomi-integration-card__desc">
                {integration.integrationPackDescription}
              </p>
              {showConnectors && (
                <ConnectorStack
                  connectors={integration.connectors}
                  size={connectorIconSize}
                  className="boomi-integration-card__connectors"
                />
              )}
            </div>
          </div>

          {(!menuOnTop || envChip || (showEdit && showEditButton)) && (
          <div className={`boomi-integration-card__footer${catalogUi ? ' boomi-integration-card__footer--stacked' : ''}`}>
            {catalogUi && envChip && <div className="boomi-integration-card__env-row">{envChip}</div>}
            {(!catalogUi || (showEdit && showEditButton)) && (
            <div className="boomi-integration-card__actions">
              {!catalogUi && envChip}
              {showEdit && showEditButton && (
                // 1.6.1 card: the wrapper is layout-neutral so the button sits exactly where it did.
                <div
                  className={catalogUi ? 'boomi-integration-card__edit' : undefined}
                  style={catalogUi ? undefined : { display: 'contents' }}
                >
                  {isAgent ? (
                    <Button
                      toggle={false}
                      primary={true}
                      showIcon={false}
                      label={cardCfg.agentButton?.label ?? 'Run Agent'}
                      onClick={() => onEditClick('RunAgent', integration)}
                    />
                  ) : (
                    <Button
                      toggle={false}
                      primary={true}
                      showIcon={false}
                      label={cardCfg.editButton?.label ?? 'Edit'}
                      onClick={openEdit}
                    />
                  )}
                </div>
              )}
              {!menuOnTop && showControls && (
                <>
                  {isAgent ? (
                    <AgentActions
                      onRunNow={() => onEditClick('RunAgent', integration)}
                      onDeleteIntegration={handleDelete}
                    />
                  ) : (
                    <IntegrationActions
                      integration={integration}
                      onRunNow={handleRunNow}
                      simple={simple}
                      onEditSchedule={() => onEditClick('UpdateSchedules', integration)}
                      onEditConnections={() => onEditClick('UpdateConnections', integration)}
                      onEditMap={() => onEditClick('UpdateMaps', integration)}
                      onDeleteIntegration={handleDelete}
                      onShowHistory={() => onShowHistory(integration)}
                      {...(cardOpensEdit ? { onEdit: openEdit, editLabel: cardCfg.editButton?.label ?? 'Edit' } : {})}
                    />
                  )}
                </>
              )}
            </div>
            )}
          </div>
          )}
        </IntegrationItem>

      ) : viewType === 'on' ? (
        <tr key={integration.id} className={`boomi-table-row ${isAgent ? 'boomi-table-row--agent' : ''}`}>
          <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-sm break-words">{title}</td>
          <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-sm break-words">{integration.integrationPackDescription}</td>
          {showEnvironment && (
            <td
              className="py-4 pl-4 pr-3 text-xs whitespace-nowrap"
              title={envRefs.map((e) => `${e.name ?? e.id}${e.classification ? ` (${e.classification})` : ''}`).join(', ') || undefined}
            >
              {unattached ? unattachedChip : primaryEnv ? (primaryEnv.name ?? primaryEnv.id) : '—'}
              {otherEnvs.length > 0 && <span className="boomi-integration-card__env-more"> +{otherEnvs.length}</span>}
            </td>
          )}
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
