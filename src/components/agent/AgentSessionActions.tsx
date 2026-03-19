/**
 * @file AgentSessionActions.tsx
 * @component AgentSessionActions
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Dropdown action menu for agent sessions.
 *
 * @return {JSX.Element} The rendered dropdown action menu.
 */

import {
  AiOutlineDelete,
} from 'react-icons/ai';
import DropdownMenu from '../ui/DropdownMenu';
import { Menu } from '@headlessui/react';

/**
 * @interface AgentSessionActionsProps
 *
 * @description
 * Props for the `AgentSessionActions` component.
 
 * @property {() => void} onDeleteSession - Called to delete a session
 */
interface AgentSessionActionsProps {
  onDeleteSession: () => void;
}

const AgentSessionActions: React.FC<AgentSessionActionsProps> = ({
  onDeleteSession,
}) => {
  return (
    <DropdownMenu>
      <Menu.Item>
        {({ active }) => (
          <button
            onClick={onDeleteSession}
            className="boomi-menu-item boomi-menu-item--danger"
            data-headlessui-state={active ? 'active' : undefined}
          >
            <AiOutlineDelete className="boomi-menu-icon" />
            Delete Chat
          </button>
        )}
      </Menu.Item>
    </DropdownMenu>
  );
};

export default AgentSessionActions;
