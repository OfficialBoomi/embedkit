/**
 * @file ExecutionHistoryActions.tsx
 * @component ExecutionHistoryActions
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a dropdown menu with actions related to execution history entries.
 *
 * @return {JSX.Element} The rendered dropdown action menu.
 */

import {
  AiOutlineInfo
} from 'react-icons/ai';
import { Menu } from '@headlessui/react';
import DropdownMenu from '../ui/DropdownMenu';

/**
 * @interface ExecutionHistoryActionsProps
 *
 * @description
 * Props for the `ExecutionHistoryActions` component.
 *
 * @property {() => void} onViewDetails - Callback invoked when the "View Details" action is clicked.
 */
interface ExecutionHistoryActionsProps {
  onViewDetails: () => void;
}

const ExecutionHistoryActions: React.FC<ExecutionHistoryActionsProps> = ({
  onViewDetails
}) => {
  return (
    <DropdownMenu>
      <Menu.Item>
        {({ active }) => (
          <button
            onClick={onViewDetails}
            className="boomi-menu-item"
            data-headlessui-state={active ? 'active' : undefined}
          >
            <AiOutlineInfo className="boomi-menu-icon" />
            View Details
          </button>
        )}
      </Menu.Item>
    </DropdownMenu>
  );
};

export default ExecutionHistoryActions;
