/**
 * @file Agents.tsx
 * @component Agents
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Admin UI for managing public Agent embeds.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu } from '@headlessui/react';
import {
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineEye,
  AiOutlineTable,
  AiOutlineAppstore,
  AiOutlineEdit,
} from 'react-icons/ai';
import { usePlugin } from '../../../context/pluginContext';
import {
  useAgentsService,
  type PublicAgentItem,
  type AvailableBoomiAgent,
} from '../../../service/admin/agents.service';
import { useCorsService } from '../../../service/admin/cors.service';
import AddAgentModal, { type AddAgentPayload } from './AddAgentModal';
import DeleteAgentModal from './DeleteAgentModal';
import EditAgentModal, { type EditAgentPayload } from './EditAgentModal';
import TokenModal from './TokenModal';
import Button from '../../ui/Button';
import SearchBar from '../../ui/SearchBar';
import Pagination from '../../ui/Pagination';
import AjaxLoader from '../../ui/AjaxLoader';
import ToastNotification from '../../ui/ToastNotification';
import DropdownMenu from '../../ui/DropdownMenu';
import logger from '../../../logger.service';

export type AgentsProps = {
  componentKey: string;
  primaryAccountId?: string;
};

const PAGE_SIZE = 10;

const Agents: React.FC<AgentsProps> = ({ componentKey, primaryAccountId: primaryAccountIdProp }) => {
  const { boomiConfig, tenantId: ctxTenantId, setPageIsLoading } = usePlugin();
  const primaryAccountId = primaryAccountIdProp ?? ctxTenantId ?? (boomiConfig as any)?.tenantId;
  const storageKey = `agents-view:${componentKey}`;

  const { listAgents, listAvailableAgents, createAgent, deleteAgent } = useAgentsService();
  const { getCorsConfig, createCorsConfig, updateCorsConfig } = useCorsService();

  const [agents, setAgents] = useState<PublicAgentItem[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AvailableBoomiAgent[]>([]);
  const [defaultOrigins, setDefaultOrigins] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewType, setViewType] = useState<'on' | 'off'>('off');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<PublicAgentItem | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [toasts, setToasts] = useState({
    add: false,
    edit: false,
    delete: false,
  });

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

  const showToast = (key: keyof typeof toasts) => {
    setToasts((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setToasts((prev) => ({ ...prev, [key]: false })), 3000);
  };

  const ensurePrimary = (): string | null => {
    if (!primaryAccountId) {
      setError('primaryAccountId is required to manage agents.');
      return null;
    }
    return primaryAccountId;
  };

  const fetchAgents = useCallback(async () => {
    const par = ensurePrimary();
    if (!par) return;
    setIsLoading(true);
    setError(null);
    try {
      const resp = await listAgents({ primaryAccountId: par, includeDetails: true });
      setAgents(resp.items ?? []);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load agents';
      logger.error({ err: e }, '[Agents] list failed');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [listAgents, primaryAccountId]);

  const fetchDefaultOrigins = useCallback(async () => {
    const par = ensurePrimary();
    if (!par) return;
    try {
      const resp = await getCorsConfig({ primaryAccountId: par });
      setDefaultOrigins(resp.allowedOrigins ?? []);
    } catch (e: any) {
      if (e?.status === 404) {
        setDefaultOrigins([]);
        return;
      }
      logger.error({ err: e }, '[Agents] cors list failed');
      setDefaultOrigins([]);
    }
  }, [getCorsConfig, primaryAccountId]);

  const addCorsOrigin = useCallback(async (origin: string) => {
    const par = ensurePrimary();
    if (!par) return;
    const next = Array.from(new Set([...(defaultOrigins ?? []), origin]));
    try {
      const resp = await updateCorsConfig({ primaryAccountId: par, allowedOrigins: next });
      setDefaultOrigins(resp.allowedOrigins ?? next);
    } catch (e: any) {
      if (e?.status === 404) {
        const resp = await createCorsConfig({ primaryAccountId: par, allowedOrigins: next });
        setDefaultOrigins(resp.allowedOrigins ?? next);
        return;
      }
      throw e;
    }
  }, [createCorsConfig, updateCorsConfig, defaultOrigins, primaryAccountId]);

  const fetchAvailableAgents = useCallback(async () => {
    const par = ensurePrimary();
    if (!par) return;
    try {
      const resp = await listAvailableAgents({ primaryAccountId: par });
      setAvailableAgents(resp.items ?? []);
    } catch (e: any) {
      logger.error({ err: e }, '[Agents] available list failed');
      setAvailableAgents([]);
    }
  }, [listAvailableAgents, primaryAccountId]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    void fetchDefaultOrigins();
  }, [fetchDefaultOrigins]);

  useEffect(() => {
    void fetchAvailableAgents();
  }, [fetchAvailableAgents]);

  useEffect(() => {
    if (!addModalOpen) return;
    void fetchAvailableAgents();
  }, [addModalOpen, fetchAvailableAgents]);

  useEffect(() => {
    if (!editModalOpen) return;
    void fetchAvailableAgents();
  }, [editModalOpen, fetchAvailableAgents]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return agents;
    return agents.filter((agent) => {
      const label = agent.label?.toLowerCase() ?? '';
      return agent.agentId.toLowerCase().includes(term) || label.includes(term);
    });
  }, [agents, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const availableAgentOptions = useMemo(() => {
    return availableAgents.map((agent) => ({
      id: agent.id,
      label: agent.name || agent.id,
    }));
  }, [availableAgents]);

  const handleAdd = async (payload: AddAgentPayload) => {
    const par = ensurePrimary();
    if (!par) return;
    setIsCreating(true);
    setPageIsLoading(true);
    try {
      const resp = await createAgent({
        primaryAccountId: par,
        agentId: payload.agentId,
        boomiAgentId: payload.boomiAgentId,
        label: payload.label,
        allowedOrigins: payload.allowedOrigins,
        config: payload.config,
        createToken: true,
      });
      await fetchAgents();
      setAddModalOpen(false);
      showToast('add');
      const newTokenId =
        resp.createdToken?.tokenId ||
        resp.agent.publicTokenIds?.[resp.agent.publicTokenIds.length - 1] ||
        null;
      setSelectedAgentId(resp.agent.agentId);
      setSelectedTokenId(newTokenId);
      setTokenModalOpen(true);
    } catch (e: any) {
      logger.error({ err: e }, '[Agents] create failed');
      setError(e?.message || 'Failed to create agent');
    } finally {
      setIsCreating(false);
      setPageIsLoading(false);
    }
  };

  const handleEdit = async (payload: EditAgentPayload) => {
    const par = ensurePrimary();
    if (!par) return;
    setIsCreating(true);
    setPageIsLoading(true);
    try {
      await createAgent({
        primaryAccountId: par,
        agentId: payload.agentId,
        boomiAgentId: selectedAgent?.boomiAgentId,
        label: payload.label,
        allowedOrigins: payload.allowedOrigins,
        config: payload.config,
      });
      await fetchAgents();
      setEditModalOpen(false);
      setSelectedAgent(null);
      showToast('edit');
    } catch (e: any) {
      logger.error({ err: e }, '[Agents] edit failed');
      setError(e?.message || 'Failed to update agent');
    } finally {
      setIsCreating(false);
      setPageIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAgentId) return;
    const par = ensurePrimary();
    if (!par) return;
    setIsDeleting(true);
    setPageIsLoading(true);
    try {
      await deleteAgent({ primaryAccountId: par, agentId: selectedAgentId });
      await fetchAgents();
      setDeleteModalOpen(false);
      setSelectedAgentId(null);
      showToast('delete');
    } catch (e: any) {
      logger.error({ err: e }, '[Agents] delete failed');
      setError(e?.message || 'Failed to delete agent');
    } finally {
      setIsDeleting(false);
      setPageIsLoading(false);
    }
  };

  const ActionsMenu = ({ agent }: { agent: PublicAgentItem }) => {
    const tokenId = agent.publicTokenIds?.[agent.publicTokenIds.length - 1] || null;
    return (
      <DropdownMenu>
        <Menu.Item>
          {({ active }) => (
            <button
              onClick={() => { setSelectedAgent(agent); setEditModalOpen(true); }}
              className="boomi-menu-item"
              data-headlessui-state={active ? 'active' : undefined}
            >
              <AiOutlineEdit className="boomi-menu-icon" />
              Edit
            </button>
          )}
        </Menu.Item>
        <Menu.Item>
          {({ active }) => (
            <button
              onClick={() => {
                setSelectedAgentId(agent.agentId);
                setSelectedTokenId(tokenId);
                setTokenModalOpen(true);
              }}
              className="boomi-menu-item"
              data-headlessui-state={active ? 'active' : undefined}
            >
              <AiOutlineEye className="boomi-menu-icon" />
              View Embed
            </button>
          )}
        </Menu.Item>
        <div className="boomi-menu-divider" />
        <Menu.Item>
          {({ active }) => (
            <button
              onClick={() => { setSelectedAgentId(agent.agentId); setDeleteModalOpen(true); }}
              className="boomi-menu-item boomi-menu-item--danger"
              data-headlessui-state={active ? 'active' : undefined}
              disabled={isDeleting}
            >
              <AiOutlineDelete className="boomi-menu-icon" />
              Delete
            </button>
          )}
        </Menu.Item>
      </DropdownMenu>
    );
  };

  const errorMsg = error || null;

  return (
    <>
      {toasts.add && <ToastNotification type="success" content="Agent created." />}
      {toasts.edit && <ToastNotification type="success" content="Agent updated." />}
      {toasts.delete && <ToastNotification type="success" content="Agent deleted." />}

      <AddAgentModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAdd}
        isSaving={isCreating}
        defaultOrigins={defaultOrigins}
        availableAgents={availableAgentOptions}
      />

      <EditAgentModal
        isOpen={editModalOpen}
        agentId={selectedAgent?.agentId ?? null}
        label={selectedAgent?.label ?? null}
        allowedOrigins={selectedAgent?.allowedOrigins ?? null}
        defaultOrigins={defaultOrigins}
        config={selectedAgent?.config ?? null}
        onAddOrigin={addCorsOrigin}
        onClose={() => { setEditModalOpen(false); setSelectedAgent(null); }}
        onSubmit={handleEdit}
        isSaving={isCreating}
        availableAgents={availableAgentOptions}
      />

      <DeleteAgentModal
        isOpen={deleteModalOpen}
        agentId={selectedAgentId}
        onClose={() => { setDeleteModalOpen(false); setSelectedAgentId(null); }}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />

      <TokenModal
        isOpen={tokenModalOpen}
        agentId={selectedAgentId}
        tokenId={selectedTokenId}
        agents={agents}
        primaryAccountId={primaryAccountId ?? undefined}
        onTokenGenerated={(id) => setSelectedTokenId(id)}
        onClose={() => {
          setTokenModalOpen(false);
          setSelectedTokenId(null);
        }}
      />

      <div className="w-full h-full p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm opacity-70">
            Create and manage embedded agent groups, including tokens, allowed origins, and launch options.
          </p>
        </div>

        <div className="flex items-end gap-3 mb-4 mt-4">
          <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
            <div className="min-w-[220px]">
              <SearchBar searchCallback={(val) => { setSearchTerm(val); setCurrentPage(1); }} />
            </div>
          </div>
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
            <Button
              toggle={false}
              primary
              showIcon
              label="Add Project"
              icon={<AiOutlinePlus className="h-5 w-5" />}
              onClick={() => setAddModalOpen(true)}
            />
          </div>
        </div>

        {errorMsg && (
          <div className="boomi-notice boomi-notice--error text-sm">{errorMsg}</div>
        )}

        {viewType === 'off' ? (
          <>
            <ul
              role="list"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8"
            >
              {isLoading ? (
                <div className="col-span-full flex justify-center items-center"><AjaxLoader /></div>
              ) : visible.length > 0 ? (
                visible.map((agent) => {
                  const displayName = agent.label?.trim() || 'Untitled Agent';
                  return (
                    <li key={agent.agentId} className="boomi-card">
                      <div className="flex gap-4 p-4">
                        <div className="flex flex-col w-full">
                          <h3 className="text-base font-semibold break-words truncate overflow-hidden pr-2">
                            {displayName}
                          </h3>
                          <p className="text-xs mt-1 opacity-70 break-words overflow-hidden">{agent.agentId}</p>
                        </div>
                      </div>
                      <div className="flex w-full p-2 justify-end items-center gap-x-2 relative overflow-visible">
                        <Button
                          toggle={false}
                          primary={true}
                          showIcon={false}
                          label="Edit"
                          onClick={() => { setSelectedAgent(agent); setEditModalOpen(true); }}
                        />
                        <ActionsMenu agent={agent} />
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
            {!isLoading && totalPages > 1 && (
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
                {isLoading ? (
                  <tr>
                    <td colSpan={3}>
                      <div className="flex justify-center items-center py-6"><AjaxLoader /></div>
                    </td>
                  </tr>
                ) : visible.length > 0 ? (
                  visible.map((agent) => {
                    const displayName = agent.label?.trim() || 'Untitled Agent';
                    return (
                      <tr key={agent.agentId} className="boomi-table-row">
                        <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-xs break-words">{displayName}</td>
                        <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-xs break-words">{agent.agentId}</td>
                        <td className="py-4 pl-4 pr-3 text-xs sm:pl-2">
                          <div className="flex justify-end">
                            <ActionsMenu agent={agent} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3}>
                      <div className="flex justify-center items-center py-4">
                        <p className="text-gray-500 text-xs">No agents found.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {!isLoading && totalPages > 1 && (
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

export default Agents;
