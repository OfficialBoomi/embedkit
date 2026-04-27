/**
 * @file AgentTiles.tsx
 * @component AgentTiles
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Public embed list for launching multiple agents in a tiles/table view.
 * Mirrors the Admin Agents layout but only allows launching agents.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { AiOutlineAppstore, AiOutlineTable } from 'react-icons/ai';
import { usePlugin } from '../../context/pluginContext';
import Button from '../ui/Button';
import SearchBar from '../ui/SearchBar';
import Pagination from '../ui/Pagination';
import AjaxLoader from '../ui/AjaxLoader';
import AgentChatGPTLayout from './AgentChatGPTLayout';
import ModalShell from './layout/ModalShell';
import { useAgentStatus } from '../../hooks/agent/useAgentStatus';

export type AgentTilesProps = {
  agentIds: string[];
};

type TileItem = {
  agentId: string;
  name: string;
  description?: string;
};

const PAGE_SIZE = 10;

const AgentOverlay: React.FC<{
  agentId: string;
  onClose: () => void;
}> = ({ agentId, onClose }) => {
  const { boomiConfig } = usePlugin();
  const agentCfg = boomiConfig?.agents?.[agentId];
  const uiConfig = agentCfg?.ui;
  const transport = agentCfg?.transport;
  const environmentId = agentCfg?.environmentId ?? '';
  const label =
    agentCfg?.label ||
    agentCfg?.installAsName ||
    uiConfig?.pageTitle ||
    uiConfig?.welcome?.title ||
    'Agent';
  const { instance, installed, loading } = useAgentStatus(
    agentId,
    environmentId,
    label,
    transport
  );
  const [headerActions, setHeaderActions] = useState<ReactNode | null>(null);

  const modeSetting = uiConfig?.mode ?? 'full';
  const modalSize = {
    w: uiConfig?.modal?.width ?? 980,
    h: uiConfig?.modal?.height ?? 720,
  };
  const modalPosition = uiConfig?.modal?.position;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  const integration = useMemo<IntegrationPackInstance>(() => {
    return {
      id: instance?.id ?? agentId,
      integrationPackId: agentId,
      environmentId,
      installationType: 'MULTI',
    };
  }, [agentId, environmentId, instance?.id]);

  const overlayContent = () => {
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
          <p className="text-sm text-[color-mix(in_srgb,var(--boomi-page-fg-color,#f8fafc) 80%,transparent)]">
            This agent is not fully installed yet. Configure it to start chatting.
          </p>
        </div>
      );
    }
    return <AgentChatGPTLayout integration={integration} onHeaderActionsChange={setHeaderActions} />;
  };

  if (modeSetting === 'modal') {
    return (
      <ModalShell size={modalSize} style={modalPositionStyle}>
        <div className="boomi-agent-overlay__inner">
          <div className="boomi-agent-overlay__header">
            <div className="boomi-agent-overlay__title">{label || 'Agent'}</div>
            <div className="boomi-agent-overlay__header-actions">
              {headerActions}
              <button
                type="button"
                aria-label="Close agent"
                className="boomi-agent-overlay__close"
                onClick={onClose}
              >
                ✕
              </button>
            </div>
          </div>
          <div className="boomi-agent-overlay__body">
            {overlayContent()}
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <div className="boomi-agent-overlay boomi-agent-overlay--full">
      <div className="boomi-agent-overlay__header">
        <div className="boomi-agent-overlay__title">{label || 'Agent'}</div>
        <button
          type="button"
          aria-label="Close agent"
          className="boomi-agent-overlay__close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="boomi-agent-overlay__body">
        {overlayContent()}
      </div>
    </div>
  );
};

// Inline chat view for page-mode agents — no overlay, just chat in the container.
const InlineAgentView: React.FC<{ agentId: string; onBack: () => void }> = ({ agentId, onBack }) => {
  const { boomiConfig } = usePlugin();
  const agentCfg = boomiConfig?.agents?.[agentId];
  const environmentId = agentCfg?.environmentId ?? '';
  const transport = agentCfg?.transport;
  const label =
    agentCfg?.label ||
    agentCfg?.installAsName ||
    agentCfg?.ui?.pageTitle ||
    agentCfg?.ui?.welcome?.title ||
    'Agent';
  const { instance, installed, loading } = useAgentStatus(agentId, environmentId, String(label), transport);
  const [headerActions, setHeaderActions] = useState<ReactNode | null>(null);

  const integration = useMemo<IntegrationPackInstance>(() => ({
    id: instance?.id ?? agentId,
    integrationPackId: agentId,
    environmentId,
    installationType: 'MULTI',
  }), [agentId, environmentId, instance?.id]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="boomi-agent-overlay__header">
        <button type="button" className="boomi-agent-overlay__close" onClick={onBack} aria-label="Back to agents list">
          ← Back
        </button>
        <div className="boomi-agent-overlay__title">{String(label)}</div>
        <div className="boomi-agent-overlay__header-actions">{headerActions}</div>
      </div>
      <div className="boomi-agent-overlay__body flex-1 min-h-0">
        {loading || !instance || !installed
          ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4">
              <AjaxLoader message="Preparing agent..." />
            </div>
          )
          : <AgentChatGPTLayout integration={integration} onHeaderActionsChange={setHeaderActions} />
        }
      </div>
    </div>
  );
};

const AgentTiles: React.FC<AgentTilesProps> = ({ agentIds }) => {
  const { boomiConfig, componentKey } = usePlugin();
  const storageKey = `embed-agents-view:${componentKey || 'public'}`;
  const listCfg =
    (boomiConfig as any)?.components?.agentTiles ??
    (boomiConfig as any)?.components?.agentList ??
    {};
  const headerCfg = listCfg?.header ?? {};
  const searchCfg = listCfg?.search ?? {};
  const viewToggleCfg = listCfg?.viewToggle ?? {};

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewType, setViewType] = useState<'on' | 'off'>('off');
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'on' || stored === 'off') setViewType(stored);
    } catch {}
  }, [storageKey]);

  const updateViewType = useCallback(() => {
    setViewType((prev) => {
      const next = prev === 'on' ? 'off' : 'on';
      try { localStorage.setItem(storageKey, next); } catch {}
      return next;
    });
  }, [storageKey]);

  const tiles = useMemo<TileItem[]>(() => {
    const uniq = Array.from(new Set(agentIds ?? []));
    return uniq.map((agentId) => {
      const cfg = boomiConfig?.agents?.[agentId];
      const name =
        cfg?.label ||
        cfg?.installAsName ||
        cfg?.ui?.pageTitle ||
        cfg?.ui?.welcome?.title ||
        agentId;
      const description =
        cfg?.ui?.pageDescription ||
        cfg?.ui?.welcome?.subtitle ||
        undefined;
      return {
        agentId,
        name: String(name || agentId),
        description: description ? String(description) : undefined,
      };
    });
  }, [agentIds, boomiConfig]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return tiles;
    return tiles.filter((agent) => {
      const name = agent.name.toLowerCase();
      const desc = agent.description?.toLowerCase() ?? '';
      return agent.agentId.toLowerCase().includes(term) || name.includes(term) || desc.includes(term);
    });
  }, [tiles, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Page mode: show agent inline (replacing tile grid) when an agent is active
  const activeAgentMode = activeAgentId
    ? (boomiConfig?.agents?.[activeAgentId]?.ui?.mode ?? 'full')
    : null;
  if (activeAgentId && activeAgentMode === 'page') {
    return <InlineAgentView agentId={activeAgentId} onBack={() => setActiveAgentId(null)} />;
  }

  return (
    <>
      {activeAgentId && (
        <AgentOverlay agentId={activeAgentId} onClose={() => setActiveAgentId(null)} />
      )}

      <div className="w-full h-full p-6">
        {(headerCfg?.show ?? true) && (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">
              {headerCfg?.title || 'Agents'}
            </h1>
            <p className="text-sm opacity-70">
              {headerCfg?.description || 'Launch an agent to start chatting.'}
            </p>
          </div>
        )}

        <div className="flex items-end gap-3 mb-4 mt-4">
          <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
            {(searchCfg?.show ?? true) && (
              <div className="min-w-[220px]">
                <SearchBar searchCallback={(val) => { setSearchTerm(val); setCurrentPage(1); }} />
              </div>
            )}
          </div>
          {(viewToggleCfg?.show ?? true) && (
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
              <Button
                toggle
                primary={false}
                viewLoc={storageKey}
                onClass="flex w-full justify-center rounded-md px-2 py-2 text-xs font-semibold leading-6 shadow-md transition-colors duration-100"
                showIcon
                label="View"
                icon={<AiOutlineTable className="h-5 w-5" />}
                onIcon={<AiOutlineAppstore className="h-5 w-5" />}
                onClick={updateViewType}
              />
            </div>
          )}
        </div>

        {viewType === 'off' ? (
          <>
            <ul
              role="list"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8"
            >
              {visible.length > 0 ? (
                visible.map((agent) => {
                  const secondary = agent.description?.trim() || agent.agentId;
                  return (
                    <li key={agent.agentId} className="boomi-card">
                      <div className="flex gap-4 p-4">
                        <div className="flex flex-col w-full">
                          <h3 className="text-base font-semibold break-words truncate overflow-hidden pr-2">
                            {agent.name}
                          </h3>
                          <p className="text-xs mt-1 opacity-70 break-words overflow-hidden">
                            {secondary}
                          </p>
                        </div>
                      </div>
                      <div className="flex w-full p-2 justify-end items-center gap-x-2 relative overflow-visible">
                        <Button
                          toggle={false}
                          primary
                          showIcon={false}
                          label="Launch"
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
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => setCurrentPage(page)}
              />
            )}
          </>
        ) : (
          <>
            <table className="w-full table-auto rounded-lg shadow-sm">
              <thead className="boomi-table-header">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-semibold">Agent</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold">Name</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold">Agent ID</th>
                  <th className="py-3 px-4 text-right text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.length > 0 ? (
                  visible.map((agent) => (
                    <tr key={agent.agentId} className="boomi-table-row">
                      <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-xs break-words">{agent.name}</td>
                      <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-xs break-words">
                        {agent.description || '—'}
                      </td>
                      <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-xs break-words">
                        {agent.agentId}
                      </td>
                      <td className="py-4 pl-4 pr-3 text-xs sm:pl-2">
                        <div className="flex justify-end">
                          <Button
                            toggle={false}
                            primary
                            showIcon={false}
                            label="Launch"
                            onClick={() => setActiveAgentId(agent.agentId)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      <div className="flex justify-center items-center py-4">
                        <p className="text-gray-500 text-xs">No agents found.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="mt-4 flex justify-end">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default AgentTiles;
