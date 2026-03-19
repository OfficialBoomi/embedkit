/**
 * @file AgentBody.tsx
 * @component AgentBody
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A flexible layout container component used across the plugin UI for consistent structure and styling.
 * Supports optional error display via a `Notification` component and an optional split-view layout with
 * customizable left and right content areas.
 * 
 * @return {JSX.Element} A styled layout container supporting optional error and split-view display.
 */

import React from 'react';
import { UIError } from '../../../types/ui';
import Dialog from '../../ui/Dialog';

/**
 * @interface AgentBodyProps
 * 
 * @description
 * Props for the `Body` component.
 * 
 * @property {UIError} [error] - Optional error object; when provided, a `Notification` component is rendered.
 * @property {React.ReactNode} [children] - Content rendered when `split` is false.
 */
interface AgentBodyProps {
  error?: UIError;
  children?: React.ReactNode;
}

const AgentBody: React.FC<AgentBodyProps> = ({ error, children }) => {
  const baseClasses = 'w-full h-full flex-1 min-h-0 flex flex-col';
  return (
    <div className={baseClasses}>
      {error ? (
        <Dialog error={error} />
      ) : (
        children
      )}
    </div>
  );
};

export default AgentBody;
