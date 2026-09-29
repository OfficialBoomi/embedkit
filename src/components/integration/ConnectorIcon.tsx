/**
 * @file ConnectorIcon.tsx
 * @component ConnectorIcon
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Small monochrome glyph for a connector kind, keyed by the SDK's
 * `connectorIconKey()` output (salesforce, sftp, http, database, ...).
 * Unknown kinds fall back to a two-letter badge so every connector still
 * renders. Colors come from the theme via `currentColor`.
 */
import React from 'react';

type Glyph = React.ReactNode;

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** 24x24 glyphs. Deliberately simple silhouettes rather than brand marks. */
const GLYPHS: Record<string, Glyph> = {
  salesforce: <path {...stroke} d="M7 16a3.5 3.5 0 0 1-.5-7 4 4 0 0 1 7.2-1.6A3.5 3.5 0 0 1 19 10a3 3 0 0 1-1 6H7z" />,
  http: <g {...stroke}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17" /></g>,
  webservice: <g {...stroke}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M8 12h8M8 9h5M8 15h6" /></g>,
  sftp: <g {...stroke}><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v2" /></g>,
  ftp: <g {...stroke}><path d="M4 7h16v11H4z" /><path d="M8 7V4h8v3M9 13h6M12 10v6" /></g>,
  database: <g {...stroke}><ellipse cx="12" cy="6" rx="7.5" ry="3" /><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" /></g>,
  netsuite: <g {...stroke}><path d="M4 5h9v9H4zM11 10h9v9h-9z" /></g>,
  workday: <g {...stroke}><path d="M4 8c2.5 6 5 6 8 0 3 6 5.5 6 8 0" /><path d="M6 15h12" /></g>,
  sap: <g {...stroke}><path d="M3 7h18l-6 10H3z" /><path d="M8 11h4M8 14h3" /></g>,
  successfactors: <g {...stroke}><circle cx="12" cy="12" r="8.5" /><path d="M8 12l3 3 5-6" /></g>,
  ldap: <g {...stroke}><circle cx="12" cy="6" r="2.5" /><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M12 8.5v3M12 11.5l-4.5 3.5M12 11.5l4.5 3.5" /></g>,
  mail: <g {...stroke}><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></g>,
  disk: <g {...stroke}><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></g>,
  boomi: <g {...stroke}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /></g>,
  queue: <g {...stroke}><rect x="3.5" y="9" width="4" height="6" rx="1" /><rect x="10" y="9" width="4" height="6" rx="1" /><rect x="16.5" y="9" width="4" height="6" rx="1" /></g>,
  kafka: <g {...stroke}><circle cx="12" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="12" r="2" /><path d="M12 7v10M8 12h8" /></g>,
  aws: <g {...stroke}><path d="M6 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5-1 4 4 0 0 1 2 9H6z" /><path d="M7 19c3 1.5 7 1.5 10 0" /></g>,
  azure: <g {...stroke}><path d="M10 4l-6 15h6l2-4 6 4L10 4z" /></g>,
  google: <g {...stroke}><circle cx="12" cy="12" r="8.5" /><path d="M12 12h6.5M12 12V5.5" /></g>,
  quickbooks: <g {...stroke}><circle cx="12" cy="12" r="8.5" /><path d="M9 8v8a3 3 0 0 1 0-6h1M15 16V8a3 3 0 0 1 0 6h-1" /></g>,
  servicenow: <g {...stroke}><circle cx="12" cy="12" r="8.5" /><path d="M7.5 14a4.5 4.5 0 1 1 9 0" /></g>,
  slack: <g {...stroke}><path d="M9 4v7M15 13v7M4 15h7M13 9h7" /></g>,
  zendesk: <g {...stroke}><path d="M4 18l7-9v9zM13 6l7 9V6z" /></g>,
  hubspot: <g {...stroke}><circle cx="15" cy="14" r="4" /><path d="M15 10V5M15 5h-4M6 19l5-3" /></g>,
  shopify: <g {...stroke}><path d="M6 8l2-3h8l2 3v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" /><path d="M9 11a3 3 0 0 0 6 0" /></g>,
  snowflake: <g {...stroke}><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /></g>,
  mongodb: <g {...stroke}><path d="M12 3c4 4 5 8 3 12s-3 5-3 6c0-1-1-2-3-6s-1-8 3-12z" /></g>,
  odata: <g {...stroke}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /></g>,
  edi: <g {...stroke}><path d="M5 5h14v14H5z" /><path d="M8 9h8M8 12h8M8 15h5" /></g>,
  as2: <g {...stroke}><path d="M4 12h16M14 6l6 6-6 6" /></g>,
  generic: <g {...stroke}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 12h6" /></g>,
};

export interface ConnectorIconProps {
  /** Icon key from the SDK (connectorIconKey). */
  iconKey?: string;
  /** Connector name for the tooltip and the fallback badge. */
  name?: string;
  /** Connector kind (subType) for the tooltip. */
  type?: string;
  size?: number;
  className?: string;
}

const initials = (s?: string) => {
  const parts = String(s ?? '').replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
};

const ConnectorIcon: React.FC<ConnectorIconProps> = ({ iconKey = 'generic', name, type, size = 20, className = '' }) => {
  const glyph = GLYPHS[iconKey];
  const title = [name, type && type !== name ? `(${type})` : ''].filter(Boolean).join(' ') || iconKey;
  return (
    <span
      className={`boomi-connector-icon ${className}`.trim()}
      title={title}
      aria-label={title}
      role="img"
      data-connector={iconKey}
      style={{ width: size, height: size }}
    >
      {glyph ? (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{glyph}</svg>
      ) : (
        <span className="boomi-connector-icon__badge" aria-hidden="true">{initials(type || name)}</span>
      )}
    </span>
  );
};

export default ConnectorIcon;
