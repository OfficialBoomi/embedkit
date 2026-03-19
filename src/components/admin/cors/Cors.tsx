/**
 * @file Cors.tsx
 * @component Cors
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Admin UI for managing tenant-specific CORS origins with the same card/table
 * toggle, search, and pagination patterns used by Integrations.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineTable,
  AiOutlineAppstore,
} from 'react-icons/ai';
import { Menu } from '@headlessui/react';
import { usePlugin } from '../../../context/pluginContext';
import { useFetchCorsConfig } from '../../../hooks/admin/cors/useFetchCorsConfig';
import { useUpdateCors } from '../../../hooks/admin/cors/useUpdateCors';
import { useDeleteCors } from '../../../hooks/admin/cors/useDeleteCors';
import AddCorsModal from './AddCorsModal';
import EditCorsModal from './EditCorsModal';
import DeleteCorsModal from './DeleteCorsModal';
import AjaxLoader from '../../ui/AjaxLoader';
import Button from '../../ui/Button';
import Pagination from '../../ui/Pagination';
import SearchBar from '../../ui/SearchBar';
import ToastNotification from '../../ui/ToastNotification';
import logger from '../../../logger.service';
import DropdownMenu from '../../ui/DropdownMenu';
import { useAdminRedisService } from '../../../service/admin/redis.service';
import { useHttp } from '../../../service/http';

export type CorsProps = {
  componentKey: string;
  /** Explicit primaryAccountId; falls back to any value present on boomiConfig if available. */
  primaryAccountId?: string;
};

const PAGE_SIZE = 12;

const Cors: React.FC<CorsProps> = ({ componentKey, primaryAccountId: primaryAccountIdProp }) => {
  const { boomiConfig, tenantId: ctxTenantId, setPageIsLoading } = usePlugin();
  const primaryAccountId = primaryAccountIdProp ?? ctxTenantId ?? (boomiConfig as any)?.tenantId;
  const storageKey = `cors-view:${componentKey}`;

  const corsCfg = boomiConfig?.components?.[componentKey]?.cors;
  const showSearch = corsCfg?.search?.show ?? true;
  const showAdd = corsCfg?.addButton?.show ?? true;
  const showType = corsCfg?.viewTypeButton?.show ?? true;

  const http = useHttp();
  const { listTenants, listSubAccounts, listKeyTypes } = useAdminRedisService();
  const { allowedOrigins, refetch, isLoading, error } = useFetchCorsConfig({
    primaryAccountId,
    auto: Boolean(primaryAccountId),
  });
  const { updateCors, isUpdating, error: updateError } = useUpdateCors();
  const { deleteCors, isDeleting, error: deleteError } = useDeleteCors();

  const [origins, setOrigins] = useState<{ origin: string; tenantId: string }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [tenantIdFilter, setTenantIdFilter] = useState('');
  const [subAccountId, setSubAccountId] = useState('');
  const [tenants, setTenants] = useState<string[]>([]);
  const [subAccounts, setSubAccounts] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewType, setViewType] = useState<'on' | 'off'>('off');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editingOrigin, setEditingOrigin] = useState<string | null>(null);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [toasts, setToasts] = useState({
    add: false,
    edit: false,
    delete: false,
  });

  // hydrate view type from storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'on' || stored === 'off') setViewType(stored);
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    if (isSuperAdmin) return;
    if (!primaryAccountId) return;
    setOrigins(allowedOrigins.map((origin) => ({ origin, tenantId: primaryAccountId })));
  }, [allowedOrigins, isSuperAdmin, primaryAccountId]);

  useEffect(() => {
    const controller = new AbortController();
    listKeyTypes(controller.signal)
      .then((res) => setIsSuperAdmin(Boolean(res.isSuperAdmin)))
      .catch(() => setIsSuperAdmin(false));
    return () => controller.abort();
  }, [listKeyTypes]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const controller = new AbortController();
    listTenants(controller.signal)
      .then((res) => setTenants(res.items ?? []))
      .catch(() => setTenants([]));
    return () => controller.abort();
  }, [isSuperAdmin, listTenants]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const controller = new AbortController();
    const tenantId = tenantIdFilter || undefined;
    listSubAccounts(tenantId, controller.signal)
      .then((res) => setSubAccounts(res.items ?? []))
      .catch(() => setSubAccounts([]));
    return () => controller.abort();
  }, [isSuperAdmin, tenantIdFilter, listSubAccounts]);

  const fetchAllCorsConfigs = useCallback((signal?: AbortSignal) => {
    return http
      .get<{ items: { primaryAccountId: string; allowedOrigins: string[] }[] }>('/admin/cors', {
        signal,
      })
      .then((res) => {
        const items = (res?.items ?? []).flatMap((cfg) =>
          (cfg.allowedOrigins || []).map((origin) => ({
            origin,
            tenantId: cfg.primaryAccountId,
          }))
        );
        setOrigins(items);
      });
  }, [http]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const controller = new AbortController();
    fetchAllCorsConfigs(controller.signal).catch(() => setOrigins([]));
    return () => controller.abort();
  }, [isSuperAdmin, fetchAllCorsConfigs]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const byTenant = tenantIdFilter
      ? origins.filter((o) => o.tenantId === tenantIdFilter)
      : origins;
    if (!term) return byTenant;
    return byTenant.filter((o) => o.origin.toLowerCase().includes(term));
  }, [origins, searchTerm, tenantIdFilter]);

  const filteredBySub = useMemo(() => {
    if (!subAccountId) return filtered;
    return filtered;
  }, [filtered, subAccountId]);

  const totalPages = Math.max(1, Math.ceil(filteredBySub.length / PAGE_SIZE));
  const visible = filteredBySub.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const showToast = (key: keyof typeof toasts) => {
    setToasts((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setToasts((prev) => ({ ...prev, [key]: false })), 3000);
  };

  const ensurePrimary = (): string | null => {
    if (!primaryAccountId) {
      setLocalError('primaryAccountId is required to manage CORS.');
      return null;
    }
    return primaryAccountId;
  };

  const ensureTenantForMutation = (): string | null => {
    if (!isSuperAdmin) return ensurePrimary();
    if (!tenantIdFilter) {
      setLocalError('Select a tenant to modify CORS configuration.');
      return null;
    }
    return tenantIdFilter;
  };

  const updateTableView = useCallback(() => {
    setViewType((prev) => {
      const next = prev === 'on' ? 'off' : 'on';
      try { localStorage.setItem(storageKey, next); } catch {}
      return next;
    });
  }, [storageKey]);

  const handleAdd = async (origin: string) => {
    const par = ensureTenantForMutation();
    if (!par) return;
    const next = Array.from(new Set([...origins.filter((o) => o.tenantId === par).map((o) => o.origin), origin]));
    setPageIsLoading(true);
    try {
      const resp = await updateCors({ primaryAccountId: par, allowedOrigins: next });
      if (!isSuperAdmin) {
        setOrigins(resp.allowedOrigins.map((o) => ({ origin: o, tenantId: par })));
      }
      setAddModalOpen(false);
      showToast('add');
      if (isSuperAdmin) {
        await fetchAllCorsConfigs();
      } else {
        await refetch();
      }
    } catch (e) {
      logger.error({ err: e }, '[Cors] add failed');
    } finally {
      setPageIsLoading(false);
    }
  };

  const handleEdit = async (updatedOrigin: string) => {
    if (!editingOrigin) return;
    const par = isSuperAdmin ? editingTenantId || ensureTenantForMutation() : ensurePrimary();
    if (!par) return;
    const next = origins
      .filter((o) => o.tenantId === par)
      .map((o) => (o.origin === editingOrigin ? updatedOrigin : o.origin));
    const deduped = Array.from(new Set(next));
    setPageIsLoading(true);
    try {
      const resp = await updateCors({ primaryAccountId: par, allowedOrigins: deduped });
      if (!isSuperAdmin) {
        setOrigins(resp.allowedOrigins.map((o) => ({ origin: o, tenantId: par })));
      }
      setEditModalOpen(false);
      setEditingOrigin(null);
      setEditingTenantId(null);
      showToast('edit');
      if (isSuperAdmin) {
        await fetchAllCorsConfigs();
      } else {
        await refetch();
      }
    } catch (e) {
      logger.error({ err: e }, '[Cors] edit failed');
    } finally {
      setPageIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editingOrigin) return;
    const par = isSuperAdmin ? editingTenantId || ensureTenantForMutation() : ensurePrimary();
    if (!par) return;
    const remaining = origins
      .filter((o) => o.tenantId === par)
      .map((o) => o.origin)
      .filter((o) => o !== editingOrigin);
    setPageIsLoading(true);
    try {
      if (remaining.length === 0) {
        await deleteCors({ primaryAccountId: par });
        if (!isSuperAdmin) setOrigins([]);
      } else {
        const resp = await updateCors({ primaryAccountId: par, allowedOrigins: remaining });
        if (!isSuperAdmin) {
          setOrigins(resp.allowedOrigins.map((o) => ({ origin: o, tenantId: par })));
        }
      }
      setDeleteModalOpen(false);
      setEditingOrigin(null);
      setEditingTenantId(null);
      showToast('delete');
      if (isSuperAdmin) {
        await fetchAllCorsConfigs();
      } else {
        await refetch();
      }
    } catch (e) {
      logger.error({ err: e }, '[Cors] delete failed');
    } finally {
      setPageIsLoading(false);
    }
  };


  const ActionsMenu = ({ origin, tenantId }: { origin: string; tenantId: string }) => (
    <DropdownMenu>
      <Menu.Item>
        {({ active }) => (
          <button
            onClick={() => { setEditingOrigin(origin); setEditingTenantId(tenantId); setEditModalOpen(true); }}
            className="boomi-menu-item"
            data-headlessui-state={active ? 'active' : undefined}
          >
            <AiOutlineEdit className="boomi-menu-icon" />
            Edit
          </button>
        )}
      </Menu.Item>
      <div className="boomi-menu-divider" />
      <Menu.Item>
        {({ active }) => (
          <button
            onClick={() => { setEditingOrigin(origin); setEditingTenantId(tenantId); setDeleteModalOpen(true); }}
            className="boomi-menu-item boomi-menu-item--danger"
            data-headlessui-state={active ? 'active' : undefined}
          >
            <AiOutlineDelete className="boomi-menu-icon" />
            Delete
          </button>
        )}
      </Menu.Item>
    </DropdownMenu>
  );

  const errorMsg = localError || error || updateError || deleteError || null;

  return (
    <>
      {toasts.add && <ToastNotification type="success" content="Origin added." />}
      {toasts.edit && <ToastNotification type="success" content="Origin updated." />}
      {toasts.delete && <ToastNotification type="success" content="Origin deleted." />}

      <AddCorsModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAdd}
        isSaving={isUpdating}
        serverError={addModalOpen ? updateError : null}
      />

      <EditCorsModal
        isOpen={editModalOpen}
        origin={editingOrigin}
        onClose={() => { setEditModalOpen(false); setEditingOrigin(null); }}
        onSubmit={handleEdit}
        isSaving={isUpdating}
        serverError={editModalOpen ? updateError : null}
      />

      <DeleteCorsModal
        isOpen={deleteModalOpen}
        origin={editingOrigin}
        onClose={() => { setDeleteModalOpen(false); setEditingOrigin(null); }}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />

      <div className="w-full h-full p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">CORS Configuration</h1>
          <p className="text-sm opacity-70">Manage allowed origins for this tenant.</p>
        </div>

        <div className="flex items-end gap-3 mb-4 mt-4">
          <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
            <div className={`min-w-[220px]${isSuperAdmin ? ' pt-6' : ''}`}>
              <SearchBar searchCallback={(val) => { setSearchTerm(val); setCurrentPage(1); }} />
            </div>
            {isSuperAdmin && (
              <label className="text-xs font-semibold">
                Tenant
                <select
                  className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                  value={tenantIdFilter}
                  onChange={(e) => {
                    setTenantIdFilter(e.target.value);
                    setSubAccountId('');
                    setCurrentPage(1);
                  }}
                >
                  <option value="">All</option>
                  {tenants.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            {showType && (
              <Button
                toggle
                primary={false}
                viewLoc={storageKey}
                onClass="flex w-full justify-center rounded-md px-2 py-2 text-xs font-semibold leading-6 shadow-md transition-colors duration-100"
                showIcon
                label={corsCfg?.viewTypeButton?.label}
                icon={<AiOutlineTable className="h-5 w-5" />}
                onIcon={<AiOutlineAppstore className="h-5 w-5" />}
                onClick={updateTableView}
              />
            )}
            {showAdd && (
              <Button
                toggle={false}
                primary
                showIcon
                label={`Add ${corsCfg?.addButton?.label ?? ''}`.trim()}
                icon={<AiOutlinePlus className="h-5 w-5" />}
                onClick={() => setAddModalOpen(true)}
              />
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="boomi-notice boomi-notice--error text-sm">
            {errorMsg}
          </div>
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
                  visible.map((item) => (
                    <li key={`${item.tenantId}:${item.origin}`} className="boomi-card boomi-cors-card">
                      <div className="flex gap-4 p-4">
                        <div className="flex flex-col w-full">
                          <h3 className="text-base font-semibold break-words truncate overflow-hidden pr-2">
                            {item.origin}
                          </h3>
                          <p className="text-xs mt-1 line-clamp-2 break-words overflow-hidden">
                            Origin allowed for tenant {item.tenantId}.
                          </p>
                        </div>
                      </div>
                      <div className="flex w-full p-2 justify-end items-center gap-x-2 relative overflow-visible">
                        <Button
                          toggle={false}
                          primary={true}
                          showIcon={false}
                          label={corsCfg?.editButton?.label ?? 'Edit'}
                          onClick={() => { setEditingOrigin(item.origin); setEditingTenantId(item.tenantId); setEditModalOpen(true); }}
                        />
                        <ActionsMenu origin={item.origin} tenantId={item.tenantId} />
                      </div>
                    </li>
                  ))
              ) : (
                <div className="col-span-full flex justify-center items-center">
                  <p className="text-gray-500 text-xs">No allowed origins found.</p>
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
                  <th className="py-3 px-4 text-left text-sm font-semibold w-3/4">Origin</th>
                  {isSuperAdmin && (
                    <th className="py-3 px-4 text-left text-sm font-semibold">Tenant</th>
                  )}
                  <th className="py-3 px-4 text-right text-sm font-semibold w-1/4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 3 : 2}>
                      <div className="flex justify-center items-center py-6"><AjaxLoader /></div>
                    </td>
                  </tr>
                ) : visible.length > 0 ? (
                  visible.map((item) => (
                    <tr key={`${item.tenantId}:${item.origin}`} className="boomi-table-row">
                      <td className="py-4 pl-4 pr-3 text-xs sm:pl-2 max-w-md break-words">{item.origin}</td>
                      {isSuperAdmin && (
                        <td className="py-4 pl-4 pr-3 text-xs sm:pl-2">{item.tenantId}</td>
                      )}
                      <td className="py-4 pl-4 pr-3 text-xs sm:pl-2">
                        <div className="flex justify-end">
                          <ActionsMenu origin={item.origin} tenantId={item.tenantId} />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={isSuperAdmin ? 3 : 2}>
                      <div className="flex justify-center items-center py-4">
                        <p className="text-gray-500 text-xs">No allowed origins found.</p>
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

export default Cors;
