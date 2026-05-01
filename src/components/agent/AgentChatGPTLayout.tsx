/**
 * @file AgentChatGPTLayout.tsx
 * @component AgentChatGPTLayout
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * ChatGPT-style layout that composes the sidebar (sessions list) and the main chat.
 * Honors a per-agent UI config (modal vs full) and computes per-session titles
 * from the first three words of the first user message.
 *
 * @return {JSX.Element} The rendered agent layout.
 */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { useAgentReady } from '../../hooks/agent/useAgentReady';
import { useAgentApi } from '../../hooks/agent/useAgentApi';
import { formatWhen } from '../../utils/ui-utils';
import Sidebar from './SideBar';
import MainChat from './MainChat';
import ConfigureAgent from './ConfigureAgent';
import ToastNotification from '../ui/ToastNotification';
import SwalNotification from '../ui/SwalNotification';
import { usePlugin } from '../../context/pluginContext';
import { FiSettings as Settings } from 'react-icons/fi';

export interface AgentChatGPTLayoutProps {
  integration: IntegrationPackInstance;
  onHeaderActionsChange?: (actions: React.ReactNode | null) => void;
}

function createMountSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const AgentChatGPTLayout: React.FC<AgentChatGPTLayoutProps> = ({ integration, onHeaderActionsChange }) => {
  const { boomiConfig } = usePlugin();
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [isConfigureSettings, setIsConfigureSettings] = useState(false);
  const [showUpdateToast, setShowUpdateToast] = useState(false);

  const agentCfg = boomiConfig?.agents?.[integration.integrationPackId ?? ''];
  const isBoomiDirect = agentCfg?.transport === 'boomi-direct';
  const sessionScope = agentCfg?.ui?.sessionScope ?? 'multi';
  const useMountSession = sessionScope === 'mount';
  const mountStorageKey = `boomi:mount-sid:${integration.integrationPackId ?? 'default'}`;
  const mountSessionIdRef = useRef<string | null>(null);
  if (!mountSessionIdRef.current) {
    // In mount mode, restore the same session across page reloads so history persists.
    // In multi mode, mountSessionId is unused, so we skip localStorage entirely.
    let sid: string | null = null;
    if (useMountSession) {
      try { sid = localStorage.getItem(mountStorageKey); } catch {}
    }
    if (!sid) {
      sid = createMountSessionId();
      if (useMountSession) {
        try { localStorage.setItem(mountStorageKey, sid); } catch {}
      }
    }
    mountSessionIdRef.current = sid;
  }
  const mountSessionId = mountSessionIdRef.current ?? '';

  // Multi mode: derive a stable browser-specific session ID from localStorage so
  // the same session survives close/reopen. Only used when sessionScope !== 'mount'.
  const multiDefaultStorageKey = `boomi:multi-sid:${integration.integrationPackId ?? 'default'}`;
  const multiDefaultSidRef = useRef<string | null>(null);
  if (!multiDefaultSidRef.current && !useMountSession) {
    let sid: string | null = null;
    try { sid = localStorage.getItem(multiDefaultStorageKey); } catch {}
    if (!sid) {
      sid = createMountSessionId();
      try { localStorage.setItem(multiDefaultStorageKey, sid); } catch {}
    }
    multiDefaultSidRef.current = sid;
  }

  const {
    sessions,
    sessionsLoading,
    sessionsError,
    createSession,
    deleteSession,
    sendMessage,
    sendMessageRich,
    messages,
    loading,
    busy,
    agentStatus,
    agentNote,
    chatError,
    activeSessionId,
    selectSession,
  } = useAgentApi({
    integration,
    sessionId: useMountSession ? mountSessionId : undefined,
    persistMode: useMountSession ? 'none' : 'modal',
    ensureSession: useMountSession,
  });
  const isSingle = integration.installationType === 'SINGLE';
  const { configured, loading: readyLoading, error: readyErr, fetchStatus } =
    useAgentReady(integration.id || '', integration.environmentId || '', isSingle, {
      debounceMs: 0,
      disabled: isBoomiDirect,
    });
  const mustConfigure = !isBoomiDirect && configured === false;
  const showConfigure = !isBoomiDirect && (mustConfigure || isConfigureSettings);
  const ranRef = useRef(false);
  const deletingRef = useRef(false);


  const onUpdateCompleted = async () => {
    setIsConfigureSettings(false);
    setShowUpdateToast(true);
    setTimeout(() => setShowUpdateToast(false), 3000);
    await fetchStatus(true);
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void fetchStatus();
  }, [fetchStatus]);

  // Multi mode: auto-create a session on first open (sessions empty after load)
  // so there is always a session ready with a stable per-browser ID. On close/reopen,
  // useAgentApi's E2 finds the session via localStorage[storageKey] and selects it.
  const autoCreateDoneRef = useRef(false);
  useEffect(() => {
    if (useMountSession) return;
    if (sessionsLoading) return;
    if (sessions.length > 0 || activeSessionId) return;
    if (autoCreateDoneRef.current) return;
    autoCreateDoneRef.current = true;
    void createSession(multiDefaultSidRef.current ?? undefined);
  }, [useMountSession, sessionsLoading, sessions, activeSessionId, createSession]);

  const sidebarItems = useMemo(
    () =>
      (sessions ?? []).map((s) => ({
        id: s.sessionId,
        title: formatWhen(s.createdAt) ?? 'Untitled chat',
        lastAt: s.lastAt,
      })),
    [sessions]
  );

  const sidebarCfg = agentCfg?.ui?.sidebar;
  const uiMode = agentCfg?.ui?.mode ?? 'full';
  const expandable = agentCfg?.expandable ?? false;
  const showSidebar = !useMountSession && sidebarCfg?.show !== false && (sidebarCfg?.width ?? 280) > 0;
  const sidebarWidth = Math.max(1, sidebarCfg?.width ?? 280);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const showHeaderConfigure =
    !isBoomiDirect &&
    uiMode === 'modal' &&
    !showSidebar &&
    !mustConfigure &&
    !!onHeaderActionsChange;

  useEffect(() => {
    if (!onHeaderActionsChange) return;
    if (showHeaderConfigure) {
      onHeaderActionsChange(
        <button
          type="button"
          onClick={() => setIsConfigureSettings((v) => !v)}
          className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition-colors border-[var(--boomi-sidebar-secondary-btn-border,var(--boomi-btn-secondary-border))] bg-[var(--boomi-sidebar-secondary-btn-bg,var(--boomi-btn-secondary-bg))] text-[var(--boomi-sidebar-secondary-btn-fg,var(--boomi-btn-secondary-fg))] hover:bg-[var(--boomi-sidebar-secondary-btn-bg-hover,var(--boomi-btn-secondary-bg-hover))]"
          title="Settings"
        >
          <Settings size={18} />
        </button>
      );
    } else {
      onHeaderActionsChange(null);
    }
    return () => onHeaderActionsChange(null);
  }, [onHeaderActionsChange, showHeaderConfigure]);

  return (
    <>
      {confirmingDelete && (
        <SwalNotification
          key={confirmingDelete}
          type="warning"
          title="Are you sure?"
          description="This action cannot be undone."
          showCancel
          confirmButtonText="Yes, delete it!"
          cancelButtonText="No, cancel"
          onConfirm={async () => {
            if (deletingRef.current) return;
            deletingRef.current = true;
            const deleted = confirmingDelete!;
            try {
              setConfirmingDelete(null);
              await deleteSession(deleted);
            } finally {
              deletingRef.current = false;
            }
          }}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}

      <div
        className="boomi-agent-workspace w-full h-full min-h-0 overflow-hidden grid"
        style={{
          gridTemplateColumns: showSidebar
          ? (sidebarCollapsed ? '40px minmax(0,1fr)' : `${sidebarWidth}px minmax(0,1fr)`)
          : '1fr',
          position: 'relative',
        }}
      >
        {showUpdateToast && <ToastNotification type="success" content="Setting successfully updated." />}

        {showSidebar && (
          <Sidebar
            loading={sessionsLoading}
            error={(sessionsError as any)?.message ?? null}
            threads={sidebarItems}
            activeId={activeSessionId}
            showSettings={!isBoomiDirect}
            expandable={expandable}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
            onEditSettings={() => { if (!mustConfigure) setIsConfigureSettings(v => !v); }}
            onSelect={(sid) => { if (!mustConfigure) selectSession(sid); }}
            onCreate={async () => {
              if (!mustConfigure) {
                const sid = await createSession();
                if (sid) selectSession(sid);
              }
            }}
            onDelete={(sid) => {
              if (!mustConfigure) setConfirmingDelete(sid);
            }}
          />
        )}

        {showConfigure ? (
          <div className="boomi-agent-configure-panel">
            <ConfigureAgent
              componentKey={integration.integrationPackId || ''}
              integration={integration}
              onSubmit={() => { onUpdateCompleted(); }}
              onCancel={() => { if (!mustConfigure) setIsConfigureSettings(false); }}
            />
          </div>
        ) : (
        <MainChat
          key={activeSessionId ?? 'empty'}
          integration={integration}
          sessionId={activeSessionId ?? ''}       
          messages={activeSessionId ? messages : []}
          busy={!!activeSessionId && busy}
          status={{
            state: agentStatus === 'working' ? 'working'
              : agentStatus === 'progress' ? 'progress'
              : agentStatus === 'error' ? 'error'
              : 'idle',
            note: agentNote
          }}
          emptyState={!activeSessionId || !messages.length}
          loading={loading}
          error={chatError}
          onSend={async (text) => {
            await sendMessage(text); 
          }}
          onSendRich={async ({ text, files }) =>
            sendMessageRich({
              data: text,
              files,
            })
          }
        />
        )}

        {!isBoomiDirect && !showSidebar && !mustConfigure && !showHeaderConfigure && (
          <button
            type="button"
            onClick={() => setIsConfigureSettings((v) => !v)}
            className="absolute top-3 right-3.5 z-20 inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition-colors border-[var(--boomi-sidebar-secondary-btn-border,var(--boomi-btn-secondary-border))] bg-[var(--boomi-sidebar-secondary-btn-bg,var(--boomi-btn-secondary-bg))] text-[var(--boomi-sidebar-secondary-btn-fg,var(--boomi-btn-secondary-fg))] hover:bg-[var(--boomi-sidebar-secondary-btn-bg-hover,var(--boomi-btn-secondary-bg-hover))]"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        )}
      </div>
    </>
  );
};

export default AgentChatGPTLayout;
