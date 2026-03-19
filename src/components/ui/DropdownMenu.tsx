/**
 * @file DropdownMenu.tsx
 * @component DropdownMenu
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a container for dropdown menu content.
 * This component can wrap menu items, actions, or any custom elements to be displayed
 * when a dropdown is open. It is typically used in conjunction with a trigger component.
 *
 * @return {JSX.Element} The rendered dropdown menu container.
 */

import {
  ReactNode,
  useRef,
  Fragment,
} from 'react';
import { Menu, Transition } from '@headlessui/react';
import { AiOutlineMore } from 'react-icons/ai';

/**
 * @interface DropdownMenuProps
 *
 * @description
 * Props for the `DropdownMenu` component.
 *
 * @property {ReactNode} children - The content or elements to display inside the dropdown menu.
 */
interface DropdownMenuProps {
  children: ReactNode;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ children }) => {
  const triggerWrapperRef = useRef<HTMLDivElement | null>(null);

  return (
    <Menu as="div">
      {({ open }) => {
        const card = triggerWrapperRef.current?.closest('.boomi-card') as HTMLElement | null;
        if (card) {
          card.style.zIndex = open ? '1000' : '';
        }
        return (
          <div
            ref={triggerWrapperRef}
            className="relative overflow-visible"
            style={{ zIndex: open ? 500 : undefined }}
          >
            <Menu.Button className="-m-2.5 block p-2.5 outline-none focus:outline-none cursor-pointer z-[510] relative">
              <span className="sr-only">Open options</span>
              <AiOutlineMore className="h-6 w-6" aria-hidden="true" />
            </Menu.Button>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items
                static
                className="absolute right-0 mt-2 origin-top-right rounded-md py-2 boomi-menu z-[520] shadow-xl text-sm leading-5"
              >
                {children}
              </Menu.Items>
            </Transition>
          </div>
        );
      }}
    </Menu>
  );
};

export default DropdownMenu;
