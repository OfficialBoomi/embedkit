/**
 * @file ConnectorStack.tsx
 * @component ConnectorStack
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * One fixed-height row of overlapping connector tiles, shared by the Add
 * Integration catalog cards and the installed integration cards. With more
 * connectors than `maxTiles`, the last tile becomes "+N".
 */
import React from 'react';
import type { CatalogConnector } from '../../utils/catalog-utils';
import ConnectorIcon from './ConnectorIcon';

export interface ConnectorStackProps {
  /** SDK PackConnector[] (structurally a CatalogConnector). */
  connectors?: CatalogConnector[];
  /** Icon art size in px. */
  size?: number;
  maxTiles?: number;
  /** Extra class for the placement (e.g. `boomi-catalog-connectors`). */
  className?: string;
  /** Shown when there are no connectors; omit to render nothing. */
  emptyLabel?: string;
}

const ConnectorStack: React.FC<ConnectorStackProps> = ({ connectors, size = 36, maxTiles = 4, className = '', emptyLabel }) => {
  const list = connectors ?? [];
  const style = { ['--boomi-connector-icon-art' as string]: `${size}px` } as React.CSSProperties;
  const cls = `boomi-connector-stack${className ? ` ${className}` : ''}`;
  if (!list.length) {
    if (emptyLabel === undefined) return null;
    return (
      <div className={`${cls} boomi-connector-stack--empty`} style={style}>
        <span className="boomi-catalog-muted">{emptyLabel}</span>
      </div>
    );
  }
  const overflow = list.length > maxTiles;
  const shown = overflow ? list.slice(0, maxTiles - 1) : list;
  const hidden = overflow ? list.slice(maxTiles - 1) : [];
  return (
    <div className={cls} aria-label="Connectors" style={style}>
      {shown.map((c) => (
        <ConnectorIcon
          key={`${c.iconKey}-${c.name}`}
          iconKey={c.iconKey}
          iconUrl={c.iconUrl}
          platformIconIsGeneric={c.platformIconIsGeneric}
          displayName={c.displayName}
          name={c.name}
          type={c.type}
          size={size}
        />
      ))}
      {overflow && (
        <span className="boomi-connector-icon boomi-connector-icon--more" title={hidden.map((c) => c.name).join(', ')}>
          +{hidden.length}
        </span>
      )}
    </div>
  );
};

export default ConnectorStack;
