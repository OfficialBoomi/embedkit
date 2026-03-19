/**
 * @file AgentActions.tsx
 * @component AgentActions
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
  AiOutlineDelete,
} from 'react-icons/ai';
import DropdownMenu from '../ui/DropdownMenu';
import { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { Menu } from '@headlessui/react';

/**
 * @interface AgentActionsProps
 *
 * @description
 * Props for the `AgentActions` component.
 *
 * @property {IntegrationPack} integration - The integration pack associated with these actions.
 * @property {() => void} onRunNow - Called to run the integration immediately.
 * @property {() => void} onDeleteIntegration - Called to delete the integration.
 */
interface AgentActionsProps {
  onRunNow: () => void;
  onDeleteIntegration: () => void;
}

const AgentActions: React.FC<AgentActionsProps> = ({
  onRunNow,
  onDeleteIntegration,
}) => {
  return (
    <DropdownMenu>
      <Menu.Item>
        {({ active }) => (
          <button
            onClick={onRunNow}
            className="boomi-menu-item"
            data-headlessui-state={active ? 'active' : undefined}
          >
            <AiOutlinePlayCircle className="boomi-menu-icon" />
            Run Agent
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
            Delete Agent
          </button>
        )}
      </Menu.Item>
    </DropdownMenu>
  );
};

export default AgentActions;
