/**
 * @file AgentListLauncher.tsx
 * @component AgentListLauncher
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Launcher pill that opens an Agent List inside a modal. Selecting an agent
 * renders that agent UI within the same modal.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { usePlugin } from '../../context/pluginContext';
import AjaxLoader from '../ui/AjaxLoader';
import Button from '../ui/Button';
import SearchBar from '../ui/SearchBar';
import Pagination from '../ui/Pagination';
import AgentChatGPTLayout from './AgentChatGPTLayout';
import ModalShell from './layout/ModalShell';
import { useAgentStatus } from '../../hooks/agent/useAgentStatus';

export type AgentListLauncherProps = {
  agentIds: string[];
};

type ListItem = {
  agentId: string;
  name: string;
  description?: string;
  icon?: string;
  hideIcon?: boolean;
  buttonLabel?: string;
};

const PAGE_SIZE = 10;

const ActiveAgentView: React.FC<{
  agentId: string;
  onHeaderActionsChange: (actions: ReactNode | null) => void;
}> = ({ agentId, onHeaderActionsChange }) => {
  const { boomiConfig } = usePlugin();
  const agentCfg = boomiConfig?.agents?.[agentId];
  if (!agentCfg) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4">
        <p className="text-sm opacity-70">Agent config not found.</p>
      </div>
    );
  }

  const environmentId = agentCfg.environmentId ?? '';
  const transport = agentCfg.transport;
  const agentName =
    agentCfg.label ||
    agentCfg.installAsName ||
    agentCfg.ui?.pageTitle ||
    agentCfg.ui?.welcome?.title ||
    agentId;

  const { instance, installed, loading } = useAgentStatus(
    agentId,
    environmentId,
    String(agentName || 'Agent'),
    transport
  );

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4">
        <AjaxLoader message="Preparing agent..." />
      </div>
    );
  }
  if (!instance || !installed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4">
        <AjaxLoader message="Preparing agent..." />
        <p className="text-sm opacity-70">This agent is not fully installed yet.</p>
      </div>
    );
  }

  const integration = {
    id: instance?.id ?? agentId,
    integrationPackId: agentId,
    environmentId,
    installationType: 'MULTI',
  } as IntegrationPackInstance;

  return <AgentChatGPTLayout integration={integration} onHeaderActionsChange={onHeaderActionsChange} />;
};

const AgentListLauncher: React.FC<AgentListLauncherProps> = ({ agentIds }) => {
  const { boomiConfig } = usePlugin();
  const [open, setOpen] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [headerActions, setHeaderActions] = useState<ReactNode | null>(null);

  const listCfg = (boomiConfig as any)?.components?.agentList ?? {};
  const launcherCfg = listCfg?.launcher ?? {};
  const modalCfg = listCfg?.modal ?? {};
  const welcomeCfg = listCfg?.welcome ?? {};
  const headerCfg = listCfg?.header ?? {};
  const searchCfg = listCfg?.search ?? {};

  const launcherPosition = launcherCfg?.position || { corner: 'bottom-right', offsetX: 24, offsetY: 40 };
  const shape = launcherCfg?.shape || 'pill';
  const label = launcherCfg?.label || 'Find an Agent';
  const customIcon = launcherCfg?.icon;
  const hideIcon = launcherCfg?.hideIcon;

  const launcherStyle = useMemo<CSSProperties>(() => {
    const base: CSSProperties = { position: 'fixed', zIndex: 999998 };
    if (!launcherPosition || 'corner' in launcherPosition) {
      const corner = launcherPosition?.corner ?? 'bottom-right';
      const ox = launcherPosition?.offsetX ?? 24;
      const oy = launcherPosition?.offsetY ?? 24;
      if (corner.includes('bottom')) base.bottom = oy;
      if (corner.includes('top')) base.top = oy;
      if (corner.includes('right')) base.right = ox;
      if (corner.includes('left')) base.left = ox;
      return base;
    }
    base.left = launcherPosition.x;
    base.top = launcherPosition.y;
    return base;
  }, [launcherPosition]);

  const modalSize = {
    w: modalCfg?.width ?? 980,
    h: modalCfg?.height ?? 720,
  };

  const modalPosition = modalCfg?.position;
  const modalPositionStyle = useMemo<CSSProperties | undefined>(() => {
    if (!modalPosition) return undefined;

    const base: CSSProperties = {
      position: 'fixed',
      zIndex: 999999,
    };

    if ('corner' in modalPosition) {
      const corner = modalPosition.corner ?? 'bottom-right';
      const ox = modalPosition.offsetX ?? 24;
      const oy = modalPosition.offsetY ?? 24;
      if (corner.includes('bottom')) base.bottom = oy;
      if (corner.includes('top')) base.top = oy;
      if (corner.includes('right')) base.right = ox;
      if (corner.includes('left')) base.left = ox;
      return base;
    }

    base.left = modalPosition.x;
    base.top = modalPosition.y;
    return base;
  }, [modalPosition]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!activeAgentId) setHeaderActions(null);
  }, [activeAgentId]);

  const closeModal = useCallback(() => {
    if (activeAgentId) {
      setActiveAgentId(null);
      return;
    }
    setOpen(false);
  }, [activeAgentId]);

  const listItems = useMemo<ListItem[]>(() => {
    const cfgAgents = boomiConfig?.agents ?? {};
    const uniq = Array.from(new Set(agentIds ?? []));
    return uniq.flatMap((agentId) => {
      const cfg = cfgAgents[agentId];
      if (!cfg) return [];
      const name =
        cfg.label ||
        cfg.installAsName ||
        cfg.ui?.pageTitle ||
        cfg.ui?.welcome?.title ||
        agentId;
      const description =
        cfg.ui?.pageDescription ||
        cfg.ui?.welcome?.subtitle ||
        undefined;
      return [{
        agentId,
        name: String(name || agentId),
        description: description ? String(description) : undefined,
        buttonLabel: typeof cfg.buttonLabel === 'string' ? cfg.buttonLabel : undefined,
        icon: cfg.icon,
        hideIcon: cfg.hideIcon,
      }];
    });
  }, [agentIds, boomiConfig]);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return listItems;
    return listItems.filter((agent) => {
      const name = agent.name.toLowerCase();
      const desc = agent.description?.toLowerCase() ?? '';
      return agent.agentId.toLowerCase().includes(term) || name.includes(term) || desc.includes(term);
    });
  }, [listItems, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeAgentCfg = activeAgentId ? boomiConfig?.agents?.[activeAgentId] : undefined;
  const activeAgentName =
    activeAgentCfg?.label ||
    activeAgentCfg?.installAsName ||
    activeAgentCfg?.ui?.pageTitle ||
    activeAgentCfg?.ui?.welcome?.title ||
    activeAgentId ||
    'Agent';

  const renderList = () => (
    <div className="w-full h-full p-4">
      {(headerCfg?.show ?? true) && (
        <div className="space-y-1 mb-4">
          <h2 className="text-lg font-semibold">
            {headerCfg?.title || welcomeCfg?.title || 'Agents'}
          </h2>
          <p className="text-sm opacity-70">
            {headerCfg?.description || welcomeCfg?.subtitle || 'Select an agent to start chatting.'}
          </p>
        </div>
      )}

      {(searchCfg?.show ?? true) && (
        <div className="mb-4">
          <SearchBar searchCallback={(val) => { setSearchTerm(val); setCurrentPage(1); }} />
        </div>
      )}

      <ul
        role="list"
        className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6"
      >
        {visible.length > 0 ? (
          visible.map((agent) => {
            const icon = agent.hideIcon ? '' : (agent.icon ?? '🤖');
            return (
              <li key={agent.agentId} className="boomi-card">
                <div className="flex gap-4 p-4">
                  <div className="text-2xl">{icon}</div>
                  <div className="flex flex-col w-full">
                    <h3 className="text-base font-semibold break-words truncate overflow-hidden pr-2">
                      {agent.name}
                    </h3>
                    <p className="text-xs mt-1 opacity-70 break-words overflow-hidden">
                      {agent.description || agent.agentId}
                    </p>
                  </div>
                </div>
                <div className="flex w-full p-2 justify-end items-center gap-x-2 relative overflow-visible">
                  <Button
                    toggle={false}
                    primary
                    showIcon={false}
                    label={agent.buttonLabel || 'Launch'}
                    onClick={() => setActiveAgentId(agent.agentId)}
                  />
                </div>
              </li>
            );
          })
        ) : (
          <div className="col-span-full flex justify-center items-center">
            <p className="text-gray-500 text-xs">No agents found.</p>
          </div>
        )}
      </ul>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-end">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
        style={launcherStyle}
        className={
          shape === 'circle'
            ? 'w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg hover:scale-[1.03] transition-transform'
            : 'px-4 h-10 rounded-full bg-blue-600 text-white shadow-lg hover:scale-[1.02] transition-transform'
        }
      >
        {(() => {
          const icon = hideIcon ? '' : (customIcon ?? '🤖');
          if (shape === 'circle') return icon || '';
          return (
            <>
              {icon && <span className="mr-2">{icon}</span>}
              <span>{label}</span>
            </>
          );
        })()}
      </button>

      {open && (
        <ModalShell size={modalSize} style={modalPositionStyle}>
          <div className="boomi-agent-overlay__inner">
            <div className="boomi-agent-overlay__header">
              <div className="boomi-agent-overlay__title">
                {activeAgentId ? activeAgentName : (welcomeCfg?.title || 'Agents')}
              </div>
              <div className="boomi-agent-overlay__header-actions">
                {activeAgentId ? headerActions : null}
                <button
                  type="button"
                  aria-label="Close"
                  className="boomi-agent-overlay__close"
                  onClick={closeModal}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="boomi-agent-overlay__body">
              {activeAgentId
                ? <ActiveAgentView agentId={activeAgentId} onHeaderActionsChange={setHeaderActions} />
                : renderList()}
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
};

export default AgentListLauncher;
