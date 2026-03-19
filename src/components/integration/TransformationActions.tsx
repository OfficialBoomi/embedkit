/**
 * @file TransformationActions.tsx
 * @component MappingFunctionActions
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders action controls for a mapping transformation within a Boomi integration.
 * Supports editing and deleting transformations via callback handlers passed as props.
 *
 * @return {JSX.Element} The rendered transformation action controls.
 */

import {
  AiOutlineEdit,
  AiOutlineDelete,
} from 'react-icons/ai';
import { Menu } from '@headlessui/react';
import DropdownMenu from '../ui/DropdownMenu';

/**
 * @interface MappingFunctionActionsProps
 *
 * @description
 * Props for the `MappingFunctionActions` component.
 *
 * @property {() => void} onEditTransformation - Callback invoked when edit is requested.
 * @property {() => void} onDeleteTransformation - Callback invoked when delete is requested.
 */
interface MappingFunctionActionsProps {
  onEditTransformation: () => void;
  onDeleteTransformation: () => void;
}

const MappingFunctionActions: React.FC<MappingFunctionActionsProps> = ({
  onEditTransformation,
  onDeleteTransformation,
}) => {
  return (
    <DropdownMenu>
      <Menu.Item>
        {({ active }) => (
          <button
            onClick={onEditTransformation}
            className="boomi-menu-item"
            data-headlessui-state={active ? 'active' : undefined}
          >
            <AiOutlineEdit className="boomi-menu-icon" />
            Edit Transformation
          </button>
        )}
      </Menu.Item>
      <Menu.Item>
        {({ active }) => (
          <button
            onClick={onDeleteTransformation}
            className="boomi-menu-item"
            data-headlessui-state={active ? 'active' : undefined}
          >
            <AiOutlineDelete className="boomi-menu-icon" />
            Delete Transformation
          </button>
        )}
      </Menu.Item>
    </DropdownMenu>
  );
};

export default MappingFunctionActions;
