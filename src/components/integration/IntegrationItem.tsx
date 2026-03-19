/**
 * @file IntegrationItem.tsx
 * @component IntegrationItem
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a Boomi integration pack with action controls.
 * Supports editing, deleting, running, viewing execution history,
 *
 * @return {JSX.Element} 
 */

import React from 'react';
import { useRandomShimmer } from '../../hooks/ui/useRandomShimmer';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';

interface IntegrationItemProps {
  integration: IntegrationPackInstance;
  isAgent: boolean;
  children?: React.ReactNode;
}

const IntegrationItem: React.FC<IntegrationItemProps> = ({
  integration, 
  isAgent, 
  children
}) => {
  const shimmerRef = useRandomShimmer(integration.id); // stable per id

  return (
    <li
      ref={isAgent ? (shimmerRef as any) : undefined}
      className={`boomi-card ${isAgent ? 'boomi-card--agent boomi--agent-shimmer' : ''}`}
    >
      {children}
    </li>
  );
};

export default IntegrationItem;