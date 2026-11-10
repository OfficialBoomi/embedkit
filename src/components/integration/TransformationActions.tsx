/**
 * @file TransformationActions.tsx
 * @component MappingFunctionActions
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders action controls for a mapping transformation within a Boomi integration.
 * Supports editing and deleting transformations via callback handlers passed as props. A Cross Reference
 * Lookup that does its own lookup also gets an item that opens its cross reference table.
 *
 * @return {JSX.Element} The rendered transformation action controls.
 */

import {
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineTable,
} from 'react-icons/ai';
import { Menu } from '@headlessui/react';
import DropdownMenu from '../ui/DropdownMenu';

/**
 * @interface MappingFunctionActionsProps
 *
 * @description
 * Props for the `MappingFunctionActions` component.
 *
 * @property {() => void} [onOpenCrossReference] - Callback invoked when "Open Cross Reference Table" is chosen. The
 *   item shows only when it is given, and comes before the others.
 * @property {() => void} [onEditTransformation] - Callback invoked when edit is requested. Omit it for
 *   platform-defined functions (CurrentDate, UserDefined, ...) that the editor cannot author; the Edit item is hidden.
 * @property {() => void} onDeleteTransformation - Callback invoked when delete is requested.
 */
interface MappingFunctionActionsProps {
  onOpenCrossReference?: () => void;
  onEditTransformation?: () => void;
  onDeleteTransformation: () => void;
}

const MappingFunctionActions: React.FC<MappingFunctionActionsProps> = ({
  onOpenCrossReference,
  onEditTransformation,
  onDeleteTransformation,
}) => {
  return (
    <DropdownMenu>
      {onOpenCrossReference && (
        <Menu.Item>
          {({ active }) => (
            <button
              onClick={onOpenCrossReference}
              className="boomi-menu-item"
              data-headlessui-state={active ? 'active' : undefined}
            >
              <AiOutlineTable className="boomi-menu-icon" />
              Open Cross Reference Table
            </button>
          )}
        </Menu.Item>
      )}
      {onEditTransformation && (
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
      )}
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
