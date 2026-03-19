/**
 * @file AdminLayout.tsx
 * @license BSD-2-Clause
 *
 * Opinionated admin shell with a left rail and main content area. The left rail
 * hosts a logo slot, nav buttons with icons, and a logout action that tears down
 * the plugin. The main area renders the active admin panel.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AiOutlineDatabase, AiOutlineGlobal } from 'react-icons/ai';
import { FiLogOut, FiMessageSquare } from 'react-icons/fi';
import Cors from '../cors/Cors';
import Agents from '../agents/Agents';
import RedisAdmin from '../redis/RedisAdmin';

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  render: () => React.ReactNode;
};

type AdminLayoutProps = {
  componentKey: string;
  primaryAccountId?: string;
  logo?: React.ReactNode;
  /** Optional image source to render if no custom ReactNode is provided. */
  logoSrc?: string;
  logoText?: string;
  onLogout?: () => void;
};

const AdminLayout: React.FC<AdminLayoutProps> = ({
  componentKey,
  primaryAccountId,
  logo,
  logoSrc,
  logoText = 'EmbedKit Admin',
  onLogout,
}) => {
  const defaultNav = useMemo<NavItem[]>(
    () => [
      {
        id: 'cors',
        label: 'CORS',
        icon: <AiOutlineGlobal className="h-5 w-5" />,
        render: () => (
          <Cors componentKey={`${componentKey}:cors`} primaryAccountId={primaryAccountId} />
        ),
      },
      {
        id: 'agents',
        label: 'Projects',
        icon: <FiMessageSquare className="h-5 w-5" />,
        render: () => (
          <Agents componentKey={`${componentKey}:agents`} primaryAccountId={primaryAccountId} />
        ),
      },
      {
        id: 'redis',
        label: 'Cache',
        icon: <AiOutlineDatabase className="h-5 w-5" />,
        render: () => <RedisAdmin componentKey={`${componentKey}:redis`} />,
      },
    ],
    [componentKey, primaryAccountId]
  );

  const [activeId, setActiveId] = useState(defaultNav[0]?.id ?? '');

  useEffect(() => {
    if (!defaultNav.find((n) => n.id === activeId)) {
      setActiveId(defaultNav[0]?.id ?? '');
    }
  }, [defaultNav, activeId]);

  const active = defaultNav.find((n) => n.id === activeId) ?? defaultNav[0];

  const handleLogout = async () => {
    try {
      const mod = await import('../../../main');
      mod.DestroyPlugin({ clearAuth: true, removeHost: true });
    } catch (err) {
      console.error('Failed to destroy plugin', err);
    }

    try {
      onLogout?.();
    } catch (err) {
      console.error('AdminLayout onLogout callback failed', err);
    }
  };

  return (
    <div className="boomi-admin-shell">
      <aside className="boomi-admin-sidebar">
        <div className="boomi-admin-logo">
          {logo
            ? logo
            : logoSrc
            ? <img src={logoSrc} alt={logoText} className="max-h-10 w-auto mx-auto" />
            : <span className="boomi-admin-logo-text">{logoText}</span>}
        </div>
        <nav className="boomi-admin-nav">
          {defaultNav.map((item) => {
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveId(item.id)}
                className={`boomi-admin-nav-button ${isActive ? 'is-active' : ''}`}
              >
                <span className="boomi-admin-nav-icon">{item.icon}</span>
                <span className="boomi-admin-nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="boomi-admin-logout">
          <button type="button" onClick={handleLogout} className="boomi-admin-logout-button">
            <FiLogOut className="h-5 w-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="boomi-admin-main">
        <div className="boomi-admin-main-inner">{active?.render()}</div>
      </main>
    </div>
  );
};

export default AdminLayout;
