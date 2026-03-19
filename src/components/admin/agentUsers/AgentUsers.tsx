/**
 * @file AgentUsers.tsx
 * @component AgentUsers
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Admin UI for mapping user_id to Boomi credentials.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu } from '@headlessui/react';
import {
  AiOutlinePlus,
  AiOutlineDelete,
  AiOutlineTable,
  AiOutlineAppstore,
} from 'react-icons/ai';
import { usePlugin } from '../../../context/pluginContext';
import { useAgentUsersService, type AgentUserItem } from '../../../service/admin/agentUsers.service';
import AddAgentUserModal, { type AddAgentUserPayload } from './AddAgentUserModal';
import DeleteAgentUserModal from './DeleteAgentUserModal';
import EditAgentUserModal, { type EditAgentUserPayload } from './EditAgentUserModal';
import Button from '../../ui/Button';
import SearchBar from '../../ui/SearchBar';
import Pagination from '../../ui/Pagination';
import AjaxLoader from '../../ui/AjaxLoader';
import ToastNotification from '../../ui/ToastNotification';
import DropdownMenu from '../../ui/DropdownMenu';
import logger from '../../../logger.service';

export type AgentUsersProps = {
  componentKey: string;
  primaryAccountId?: string;
};

const PAGE_SIZE = 12;

const AgentUsers: React.FC<AgentUsersProps> = ({ componentKey, primaryAccountId: primaryAccountIdProp }) => {
  const { boomiConfig, tenantId: ctxTenantId, setPageIsLoading } = usePlugin();
  const primaryAccountId = primaryAccountIdProp ?? ctxTenantId ?? (boomiConfig as any)?.tenantId;
  const storageKey = `agent-users-view:${componentKey}`;

  const { listAgentUsers, createAgentUser, deleteAgentUser } = useAgentUsersService();

  const [items, setItems] = useState<AgentUserItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewType, setViewType] = useState<'on' | 'off'>('off');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AgentUserItem | null>(null);

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
      setError('primaryAccountId is required to manage user mappings.');
      return null;
    }
    return primaryAccountId;
  };

  const fetchUsers = useCallback(async () => {
    const par = ensurePrimary();
    if (!par) return;
    setIsLoading(true);
    setError(null);
    try {
      const resp = await listAgentUsers({ primaryAccountId: par });
      setItems(resp.items ?? []);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load user mappings';
      logger.error({ err: e }, '[AgentUsers] list failed');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [listAgentUsers, primaryAccountId]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const label = item.label?.toLowerCase() ?? '';
      return (
        item.userId.toLowerCase().includes(term) ||
        item.boomiApiUserName.toLowerCase().includes(term) ||
        label.includes(term)
      );
    });
  }, [items, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleAdd = async (payload: AddAgentUserPayload) => {
    const par = ensurePrimary();
    if (!par) return;
    setIsCreating(true);
    setPageIsLoading(true);
    try {
      await createAgentUser({ primaryAccountId: par, ...payload });
      await fetchUsers();
      setAddModalOpen(false);
      showToast('add');
    } catch (e: any) {
      logger.error({ err: e }, '[AgentUsers] create failed');
      setError(e?.message || 'Failed to create user mapping');
    } finally {
      setIsCreating(false);
      setPageIsLoading(false);
    }
  };

  const handleEdit = async (payload: EditAgentUserPayload) => {
    const par = ensurePrimary();
    if (!par) return;
    setIsCreating(true);
    setPageIsLoading(true);
    try {
      await createAgentUser({ primaryAccountId: par, ...payload });
      await fetchUsers();
      setEditModalOpen(false);
      setSelectedUser(null);
      showToast('edit');
    } catch (e: any) {
      logger.error({ err: e }, '[AgentUsers] edit failed');
      setError(e?.message || 'Failed to update user mapping');
    } finally {
      setIsCreating(false);
      setPageIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUserId) return;
    const par = ensurePrimary();
    if (!par) return;
    setIsDeleting(true);
    setPageIsLoading(true);
    try {
      await deleteAgentUser({ primaryAccountId: par, userId: selectedUserId });
      await fetchUsers();
      setDeleteModalOpen(false);
      setSelectedUserId(null);
      showToast('delete');
    } catch (e: any) {
      logger.error({ err: e }, '[AgentUsers] delete failed');
      setError(e?.message || 'Failed to delete user mapping');
    } finally {
      setIsDeleting(false);
      setPageIsLoading(false);
    }
  };

  const ActionsMenu = ({ user }: { user: AgentUserItem }) => (
    <DropdownMenu>
      <Menu.Item>
        {({ active }) => (
          <button
            onClick={() => { setSelectedUserId(user.userId); setDeleteModalOpen(true); }}
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

  const errorMsg = error || null;

  return (
    <>
      {toasts.add && <ToastNotification type="success" content="User created." />}
      {toasts.edit && <ToastNotification type="success" content="User updated." />}
      {toasts.delete && <ToastNotification type="success" content="User deleted." />}

      <AddAgentUserModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAdd}
        isSaving={isCreating}
      />

      <EditAgentUserModal
        isOpen={editModalOpen}
        userId={selectedUser?.userId ?? null}
        boomiAccountId={selectedUser?.boomiAccountId ?? null}
        boomiApiUserName={selectedUser?.boomiApiUserName ?? null}
        label={selectedUser?.label ?? null}
        onClose={() => { setEditModalOpen(false); setSelectedUser(null); }}
        onSubmit={handleEdit}
        isSaving={isCreating}
      />

      <DeleteAgentUserModal
        isOpen={deleteModalOpen}
        userId={selectedUserId}
        onClose={() => { setDeleteModalOpen(false); setSelectedUserId(null); }}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />

      <div className="w-full h-full p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm opacity-70">Only required if you want to scope agent access by user.</p>
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
              label="Add User"
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
                visible.map((user) => (
                  <li key={user.userId} className="boomi-card">
                    <div className="flex gap-4 p-4">
                      <div className="flex flex-col w-full">
                        <h3 className="text-base font-semibold break-words truncate overflow-hidden pr-2">
                          {user.label?.trim() || 'Unnamed User'}
                        </h3>
                        <p className="text-xs mt-1 opacity-70 break-words overflow-hidden">{user.userId}</p>
                      </div>
                    </div>
                    <div className="flex w-full p-2 justify-end items-center gap-x-2 relative overflow-visible">
                      <Button
                        toggle={false}
                        primary={true}
                        showIcon={false}
                        label="Edit"
                        onClick={() => { setSelectedUser(user); setEditModalOpen(true); }}
                      />
                      <ActionsMenu user={user} />
                    </div>
                  </li>
                ))
              ) : (
                <div className="col-span-full flex justify-center items-center">
                  <p className="text-gray-500 text-xs">No user mappings found.</p>
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
                  <th className="py-3 px-4 text-left text-sm font-semibold">Name</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold">User ID</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold">Boomi Account ID</th>
                  <th className="py-3 px-4 text-right text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="flex justify-center items-center py-6"><AjaxLoader /></div>
                    </td>
                  </tr>
                ) : visible.length > 0 ? (
                  visible.map((user) => (
                    <tr key={user.userId} className="boomi-table-row">
                      <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-xs break-words">{user.label?.trim() || 'Unnamed User'}</td>
                      <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-xs break-words">{user.userId}</td>
                      <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-xs break-words">{user.boomiAccountId}</td>
                      <td className="py-4 pl-4 pr-3 text-xs sm:pl-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            toggle={false}
                            primary={true}
                            showIcon={false}
                            label="Edit"
                            onClick={() => { setSelectedUser(user); setEditModalOpen(true); }}
                          />
                          <ActionsMenu user={user} />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      <div className="flex justify-center items-center py-4">
                        <p className="text-gray-500 text-xs">No user mappings found.</p>
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

export default AgentUsers;
