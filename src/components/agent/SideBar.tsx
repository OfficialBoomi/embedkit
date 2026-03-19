/**
 * @file SideBar.tsx
 * @component Sidebar
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Left rail listing chat sessions. Occupies full height and scrolls independently
 * from the main chat panel.
 */

import React, { useMemo, useState } from 'react';
import AjaxLoader from '../ui/AjaxLoader';
import Dialog from '../ui/Dialog';
import {
  FiPlus as Plus,
  FiSettings as Settings,
  FiMessageSquare as MessageSquare,
  FiTrash2 as Trash2,
  FiLogOut as LogOut,
  FiSearch as Search,
  FiChevronLeft as ChevronLeft,
} from 'react-icons/fi';
import AgentSessionActions from './AgentSessionActions';

type SidebarProps = {
  loading?: boolean;
  error?: string | null;
  threads: Array<{ id: string; title: string; lastAt?: string }>;
  activeId: string | null;
  onEditSettings: () => void;
  showSettings?: boolean;
  onSelect: (id: string) => void;
  onCreate?: () => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
};

const Sidebar: React.FC<SidebarProps> = ({
  loading, error, threads, activeId, onEditSettings, showSettings = true, onSelect, onCreate, onDelete,
}) => {

  return (
    <aside className="h-full min-h-0 overflow-y-auto border-r border-[var(--boomi-sidebar-border,var(--boomi-card-border))] boomi-scroll bg-[var(--boomi-sidebar-bg,var(--boomi-card-bg))] text-[var(--boomi-sidebar-fg,var(--boomi-page-fg-color))]">
      {/* Sticky header (no scroll) */}
      <div className="sticky top-0 z-10 bg-[var(--boomi-sidebar-header-bg,var(--boomi-sidebar-bg))] px-3 py-2 shadow-[var(--boomi-sidebar-header-shadow,0_1px_2px_rgba(0,0,0,0.08))]">
        <div className="flex gap-2">
          <button
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors border-[var(--boomi-sidebar-btn-border,var(--boomi-btn-primary-border))] bg-[var(--boomi-sidebar-btn-bg,var(--boomi-btn-primary-bg))] text-[var(--boomi-sidebar-btn-fg,var(--boomi-btn-primary-fg))] hover:bg-[var(--boomi-sidebar-btn-bg-hover,var(--boomi-btn-primary-bg-hover))]"
            onClick={() => void onCreate?.()}
          >
            <Plus size={16} /> New Chat
          </button>
          {showSettings && (
            <button
              className="inline-flex items-center justify-center rounded-lg border px-2 cursor-pointer transition-colors border-[var(--boomi-sidebar-secondary-btn-border,var(--boomi-btn-secondary-border))] bg-[var(--boomi-sidebar-secondary-btn-bg,var(--boomi-btn-secondary-bg))] text-[var(--boomi-sidebar-secondary-btn-fg,var(--boomi-btn-secondary-fg))] hover:bg-[var(--boomi-sidebar-secondary-btn-bg-hover,var(--boomi-btn-secondary-bg-hover))]"
              title="Settings"
              onClick={onEditSettings}
            >
              <Settings size={18}/>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content (no inner overflow needed) */}
      <div className="px-3 py-1">
        <div className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-[color-mix(in_srgb,var(--boomi-sidebar-fg,white) 70%,transparent)]">
          Chats
        </div>
        {loading && <div className="p-4"><AjaxLoader message="Loading chats…" /></div>}
        {error && <div className="p-4"><Dialog error={{ header: 'Load error', message: error, errorType: 'error' }} /></div>}
        {!loading && !error && threads.length === 0 && (
          <div className="p-4 text-sm opacity-70">No chats yet.</div>
        )}

        <ul className="space-y-1">
          {threads.map((t) => (
            <li key={t.id} className="group">
              <div
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg border transition ${
                  activeId === t.id
                    ? 'border-[var(--boomi-accent)] bg-[color-mix(in_srgb,var(--boomi-accent) 10%, transparent)]'
                    : 'border-[var(--boomi-card-border)] hover:bg-[var(--boomi-card-bg)]'
                }`}
              >
                {/* main clickable area (selects the thread) */}
                <button
                  className="flex items-center gap-2 text-left flex-1 min-w-0 text-xs"
                  onClick={() => onSelect(t.id)}
                  title={t.title}
                >
                  <MessageSquare size={16} className="opacity-80 shrink-0 " />
                  <span className="truncate">{t.title || 'Untitled chat'}</span>
                </button>

                {/* actions: kebab/ellipsis using AgentSessionActions dropdown */}
                <div
                  onClick={(e) => e.stopPropagation()}
                >
                  <AgentSessionActions
                    onDeleteSession={() => onDelete?.(t.id)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
};
export default Sidebar;
