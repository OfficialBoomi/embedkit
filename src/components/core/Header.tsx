/**
 * @file Header.tsx
 * @component Header
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 * 
 * @description
 * Renders a customizable header section within a plugin layout.
 * Accepts a title, optional description, and arbitrary child content.
 * The `componentName` prop is used to apply custom plugin configuration styles.
 * 
 * @return {JSX.Element} A header block containing the title, description, and children.
 */

import React, { ReactNode, isValidElement } from 'react';
import DOMPurify from 'dompurify';
import { usePlugin } from '../../context/pluginContext';
import logger from '../../logger.service';

/**
 * @interface HeaderProps
 * 
 * @description
 * Props for the `Header` component.
 * 
 * @property {React.ReactNode} [title] - Main title content to display in the header.
 * @property {string} [description] - Optional description (HTML allowed) rendered below the title.
 * @property {React.ReactNode} [children] - Additional custom content to display in the header.
  * @property {string} [key] - Unique key for the component instance
 */
interface HeaderProps {
  componentKey: string;
  componentName: string;
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ 
  componentKey, 
  title, 
  description, 
  children, 
  componentName }) => {
  const { boomiConfig } = usePlugin();
  const showTitleFlag = boomiConfig?.components?.[componentKey]?.[componentName]?.header?.showTitle ?? true;
  const showDescFlag =
    boomiConfig?.components?.[componentKey]?.[componentName]?.header?.showDescription ?? true;
  const showEither = showTitleFlag || showDescFlag;

  return (
    <div
      className="
        pt-2 pb-2 sm:flex sm:items-center text-left border-b
        [background-color:var(--boomi-header-bg-color)]
        [color:var(--boomi-header-fg-color)]
        [border-color:var(--boomi-header-border-color)]
        [box-shadow:var(--boomi-header-shadow)]
        [display:var(--boomi-show-header,1)_==_1?block:none]
        z-10
      "
    >
      <div className="sm:flex-auto pl-8 pb-3">
        {showEither && (
          <>
            {showTitleFlag && (
              <div className="flex items-center gap-2 pb-2">
                <h1 className='text-2xl leading-6'>
                  {title}
                </h1>
              </div>
            )}
            {showDescFlag && (
              <p className='text-sm'
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(description ?? '')
                }}
              />
            )}
          </>
        )}
        {children && (
          <div
            className='flex'>
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default Header;
