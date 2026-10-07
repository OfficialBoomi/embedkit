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
  /** When set, the whole card is a button that calls this (click, Enter or Space). */
  onActivate?: () => void;
  /** Accessible name for the clickable card, e.g. "Edit Salesforce Sync". */
  activateLabel?: string;
  /** Extra classes on the card, e.g. the 1.7 UI modifier. */
  className?: string;
}

const IntegrationItem: React.FC<IntegrationItemProps> = ({
  integration, 
  isAgent, 
  children,
  onActivate,
  activateLabel,
  className,
}) => {
  const shimmerRef = useRandomShimmer(integration.id); // stable per id

  const clickable = !!onActivate;
  const handleClick = () => {
    // Ignore the click that ends a text selection inside the card.
    if (window.getSelection()?.toString()) return;
    onActivate?.();
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate?.();
    }
  };

  return (
    <li
      ref={isAgent ? (shimmerRef as any) : undefined}
      className={`boomi-card boomi-integration-card ${isAgent ? 'boomi-card--agent boomi--agent-shimmer boomi-integration-card--agent' : ''}${clickable ? ' boomi-integration-card--clickable' : ''}${className ? ` ${className}` : ''}`}
      {...(clickable
        ? { role: 'button', tabIndex: 0, 'aria-label': activateLabel, onClick: handleClick, onKeyDown: handleKeyDown }
        : {})}
    >
      {children}
    </li>
  );
};

export default IntegrationItem;