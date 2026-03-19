/**
 * @file SessionActions.tsx
 * @component SessionActions
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a dropdown menu with actions related to an agent session,
 *
 * @return {JSX.Element} The rendered dropdown action menu.
 */

import {
  AiOutlinePlayCircle,
  AiOutlineCalendar,
  AiOutlineLink,
  AiOutlineApartment,
  AiOutlineDelete,
} from 'react-icons/ai';
import DropdownMenu from '../ui/DropdownMenu';
import { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { Menu } from '@headlessui/react';

/**
 * @interface SessionActionsProps
 *
 * @description
 * Props for the `SessionActions` component.
 *
 * @property {string} sessionId - Session ID for the agent session.
 * @property {() => void} onDelete - Called to delete the session.
 */
interface SessionActionsProps {
  sessionId: string;
  onDeleteSession: () => void;
}

const SessionActions: React.FC<SessionActionsProps> = ({
  sessionId,
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
            Delete Agent
          </button>
        )}
      </Menu.Item>
    </DropdownMenu>
  );
};

export default SessionActions;
