/**
 * @file ExecutionHistoryActions.tsx
 * @component IntegrationActions
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a dropdown menu with actions related to an integration pack,
 * including running, editing, deleting, and viewing history.
 *
 * @return {JSX.Element} The rendered dropdown action menu.
 */

import {
  AiOutlinePlayCircle,
  AiOutlineCalendar,
  AiOutlineLink,
  AiOutlineApartment,
  AiOutlineDelete,
  AiOutlineLineChart
} from 'react-icons/ai';
import DropdownMenu from '../ui/DropdownMenu';
import { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { Menu } from '@headlessui/react';

/**
 * @interface IntegrationActionsProps
 *
 * @description
 * Props for the `IntegrationActions` component.
 *
 * @property {IntegrationPack} integration - The integration pack associated with these actions.
 * @property {() => void} onRunNow - Called to run the integration immediately.
 * @property {() => void} onEditSchedule - Called to edit the integration's schedule.
 * @property {() => void} onEditConnections - Called to edit the integration's connections.
 * @property {() => void} onEditMap - Called to edit the integration's field mappings.
 * @property {() => void} onDeleteIntegration - Called to delete the integration.
 * @property {() => void} onShowHistory - Called to show the integration's execution history.
 */
interface IntegrationActionsProps {
  integration: IntegrationPackInstance;
  isSingle?: boolean;
  simple?: boolean;
  onRunNow: () => void;
  onEditSchedule: () => void;
  onEditConnections: () => void;
  onEditMap: () => void;
  onDeleteIntegration: () => void;
  onShowHistory: () => void;
}

const IntegrationActions: React.FC<IntegrationActionsProps> = ({
  integration,
  isSingle,
  simple,
  onRunNow,
  onEditSchedule,
  onEditConnections,
  onEditMap,
  onDeleteIntegration,
  onShowHistory,
}) => {
  return (
    <DropdownMenu>
      {!isSingle && (
        <>
          <Menu.Item>
            {({ active }) => (
              <button
                onClick={onEditConnections}
                className="boomi-menu-item"
                data-headlessui-state={active ? 'active' : undefined}
              >
                <AiOutlineLink className="boomi-menu-icon" />
                Edit Connections
              </button>
            )}
          </Menu.Item>
          {!simple && (
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={onEditMap}
                  className="boomi-menu-item"
                  data-headlessui-state={active ? 'active' : undefined}
                >
                  <AiOutlineApartment className="boomi-menu-icon" />
                  Edit Map(s)
                </button>
              )}
            </Menu.Item>
          )}
        </>
      )}
      {!simple && (
        <>
          <Menu.Item>
            {({ active }) => (
              <button
                onClick={onEditSchedule}
                className="boomi-menu-item"
                data-headlessui-state={active ? 'active' : undefined}
              >
                <AiOutlineCalendar className="boomi-menu-icon" />
                Edit Schedule
              </button>
            )}
          </Menu.Item>
          <Menu.Item>
            {({ active }) => (
              <button
                onClick={onEditSchedule}
                className="boomi-menu-item"
                data-headlessui-state={active ? 'active' : undefined}
              >
                <AiOutlineCalendar className="boomi-menu-icon" />
                Edit Schedule
              </button>
            )}
          </Menu.Item>
        </>
      )}

      <Menu.Item>
        {({ active }) => (
          <button
            onClick={onRunNow}
            className="boomi-menu-item"
            data-headlessui-state={active ? 'active' : undefined}
          >
            <AiOutlinePlayCircle className="boomi-menu-icon" />
            Run Now
          </button>
        )}
      </Menu.Item>

      <Menu.Item>
        {({ active }) => (
          <button
            onClick={onShowHistory}
            className="boomi-menu-item"
            data-headlessui-state={active ? 'active' : undefined}
          >
            <AiOutlineLineChart className="boomi-menu-icon" />
            Execution History
          </button>
        )}
      </Menu.Item>

      <div className="boomi-menu-divider" />

      <Menu.Item>
        {({ active }) => (
          <button
            onClick={onDeleteIntegration}
            className="boomi-menu-item boomi-menu-item--danger"
            data-headlessui-state={active ? 'active' : undefined}
          >
            <AiOutlineDelete className="boomi-menu-icon" />
            Delete Integration
          </button>
        )}
      </Menu.Item>
    </DropdownMenu>
  );
};

export default IntegrationActions;
