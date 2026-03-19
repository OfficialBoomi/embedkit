/**
 * @file AgentPage.tsx
 * @component AgentPage
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A high-level layout wrapper that structures plugin views into a consistent page format,
 * including header, breadcrumb navigation, optional error handling, content body, and footer.
 *
 * This component combines various reusable layout pieces such as Header, Footer, Breadcrumb,
 * and Body, and supports a split-view mode for flexible content layouts.
 *
 * @return {JSX.Element} A fully structured plugin page with consistent layout, error handling, and navigation.
 */

import React, { useEffect } from 'react';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { usePlugin } from '../../../context/pluginContext';
import { UIError } from '../../../types/ui';
import Body from './AgentBody';
import Breadcrumb from '../../ui/Breadcrumb';
import Footer from '../../core/Footer';
import Header from '../../core/Header';
import Spinner from '../../ui/Spinner';

/**
 * @interface PageProps
 * 
 * @description
 * Props for the `Page` component.
 * 
 * @property {boolean} isRootNavigation - Indicates whether this page is at the root level of navigation.
 * @property {React.ReactNode} title - The main title of the page, shown in the header.
 * @property {boolean} [isTitleEditable] - If true, enables editable title behavior.
 * @property {string} description - A short description shown below the title in the header.
 * @property {UIError} [error] - Optional error object; if present, the Body will render an error state.
 * @property {React.ReactNode} [headerContent] - Optional custom content rendered in the header.
 * @property {React.ReactNode} [bodyContent] - Default content to render in the body (if not using split view).
 * @property {React.ReactNode} [footerContent] - Content to render in the footer section.
 * @property {string} [levelOne] - Optional breadcrumb level one label.
 * @property {string} [levelTwo] - Optional breadcrumb level two label.
 * @property {string} [levelThree] - Optional breadcrumb level three label.
 * @property {() => void} [callbackOne] - Optional callback function for level one breadcrumb.
 * @property {() => void} [callbackTwo] - Optional callback function for level two breadcrumb.
 * @property {() => void} [callbackThree] - Optional callback function for level three breadcrumb.
 */
interface AgentPageProps {
  integration: IntegrationPackInstance;
  componentName: string;
  isRootNavigation: boolean;
  title: string;
  isTitleEditable?: boolean;
  description: string;
  error?: UIError;
  headerContent?: React.ReactNode;
  bodyContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  levelOne?: string;
  levelTwo?: string;
  levelThree?: string;
  callbackOne?: () => void;
  callbackTwo?: () => void;
  callbackThree?: () => void;

}

const Page: React.FC<AgentPageProps> = ({
  integration,
  componentName,
  isRootNavigation,
  headerContent,
  bodyContent,
  title,
  description,
  error,
  footerContent,
  levelOne,
  levelTwo,
  levelThree,
  callbackOne,
  callbackTwo,
  callbackThree,

}) => {
  const { boomiConfig, pageIsLoading, setPageIsLoading } = usePlugin();
  const integrationPackId = integration.integrationPackId || '';
  const showHeader = boomiConfig?.agents?.[integrationPackId]?.ui?.pageShowHeader ?? true;

  useEffect(() => {
    setPageIsLoading(false);
  }, []);

  return (
    <div
      className="
        w-full h-full min-h-0 flex flex-col
        [background-color:var(--boomi-page-bg-color)]
        [color:var(--boomi-page-fg-color)]
      "
    >
      {pageIsLoading && <Spinner message="working on your request..." />}

      {/* was: <div> ... */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!isRootNavigation && (
          <Breadcrumb
            levelOneCallback={callbackOne || (() => {})}
            levelTwoCallback={callbackTwo || (() => {})}
            levelThreeCallback={callbackThree || (() => {})}
            levelOneText={levelOne || 'Back'}
            levelTwoText={levelTwo || ''}
            levelThreeText={levelThree || ''}
          />
        )}

        {showHeader && (
          <Header
            componentKey={integrationPackId}
            componentName={componentName}
            title={title}
            description={description}
          >
            {headerContent}
          </Header>
        )}

        <Body error={error}>{bodyContent}</Body>

        <Footer>{footerContent}</Footer>
      </div>
    </div>
  );

};

export default Page;
