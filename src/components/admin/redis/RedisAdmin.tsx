/**
 * @file RedisAdmin.tsx
 * @component RedisAdmin
 * @license BSD-2-Clause
 *
 * Admin UI shell for Redis key management (sessions + key table).
 * This is the entry point wired into the AdminLayout nav.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Menu } from '@headlessui/react';
import { AiOutlineDelete, AiOutlineEdit, AiOutlineEye } from 'react-icons/ai';
import SwalCore from 'sweetalert2/dist/sweetalert2.all.js';
import Chart from 'chart.js/auto';
import { usePlugin } from '../../../context/pluginContext';
import { useAdminRedisService } from '../../../service/admin/redis.service';
import DropdownMenu from '../../ui/DropdownMenu';
import Button from '../../ui/Button';
import AjaxLoader from '../../ui/AjaxLoader';
import SearchBar from '../../ui/SearchBar';
import RedisKeyViewModal from './RedisKeyViewModal';
import RedisKeyEditModal from './RedisKeyEditModal';

type RedisAdminProps = {
  componentKey: string;
};

const RedisAdmin: React.FC<RedisAdminProps> = ({ componentKey }) => {
  const { tenantId } = usePlugin();
  const tenantLabel = tenantId ? `Tenant: ${tenantId}` : 'Tenant scoped';
  const {
    listSessions,
    listSessionsAll,
    listKeys,
    listKeysAll,
    listSubAccounts,
    listTenants,
    listKeyTypes,
    getKeyDetails,
    deleteKey,
    clearTenant,
    clearSubAccount,
    revokeSessions,
    updateKey,
  } = useAdminRedisService();
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);
  const [sessions, setSessions] = useState<{ issuedAt?: number }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [keys, setKeys] = useState<
    {
      key: string;
      type: string;
      ttl: number | null;
      valuePreview: string;
      subAccountId?: string | null;
      tenantId?: string | null;
    }[]
  >([]);
  const [keyType, setKeyType] = useState<string>('all');
  const [subAccountId, setSubAccountId] = useState<string>('');
  const [subAccounts, setSubAccounts] = useState<string[]>([]);
  const [allowedKeyTypes, setAllowedKeyTypes] = useState<string[] | null>(null);
  const [keyTypesReady, setKeyTypesReady] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [tenantIdFilter, setTenantIdFilter] = useState<string>('');
  const [tenants, setTenants] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | undefined | null>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyDetails, setKeyDetails] = useState<{
    key: string;
    type: string;
    ttl: number | null;
    redisType: string;
    value: string | null;
    editable?: boolean;
  } | null>(null);
  const [isLoadingKeyDetails, setIsLoadingKeyDetails] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [revealKeyValue, setRevealKeyValue] = useState(false);
  const revealTimeoutRef = useRef<number | null>(null);

  const swalModal = useMemo(
    () =>
      SwalCore.mixin({
        target: document.body,
        customClass: {
          container: 'boomi-swal',
          popup: 'boomi-swal-popup',
          confirmButton: 'swal2-confirm',
          cancelButton: 'swal2-cancel',
          actions: 'boomi-swal-actions',
        },
        showClass: { popup: 'swal2-show boomi-swal-in' },
        hideClass: { popup: 'swal2-hide boomi-swal-out' },
      }),
    []
  );

  const keyTypes = useMemo(
    () => [
      { label: 'All', value: 'all' },
      { label: 'Refresh tokens', value: 'refresh-jti' },
      { label: 'Sessions', value: 'user-sessions' },
      { label: 'Boomi creds', value: 'boomi-cred' },
      { label: 'Cred refs', value: 'boomi-cred-jtis' },
      { label: 'Nonces', value: 'nonce' },
      { label: 'Nonce map', value: 'nonce-map' },
      { label: 'Tenant creds', value: 'tenant-creds' },
      { label: 'CORS (global)', value: 'cors-global' },
      { label: 'CORS (tenant)', value: 'cors-tenant' },
      { label: 'Super admin flag', value: 'super-admin-flag' },
      { label: 'Chat sessions (user)', value: 'chat-user-sessions' },
      { label: 'Chat sessions (tenant)', value: 'chat-tenant-sessions' },
      { label: 'Chat meta', value: 'chat-session-meta' },
      { label: 'Chat messages', value: 'chat-session-messages' },
      { label: 'Chat status', value: 'chat-session-status' },
      { label: 'Chat stream', value: 'chat-session-stream' },
    ],
    []
  );
  const keyTypeLabels = useMemo(
    () => new Map(keyTypes.filter((opt) => opt.value !== 'all').map((opt) => [opt.value, opt.label])),
    [keyTypes]
  );

  const filteredKeys = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return keys;
    return keys.filter((item) => item.key.toLowerCase().includes(term));
  }, [keys, searchTerm]);

  const series = useMemo(() => {
    const now = Date.now();
    const hours = 12;
    const buckets: { label: string; count: number; ts: number }[] = [];
    for (let i = hours - 1; i >= 0; i -= 1) {
      const ts = now - i * 60 * 60 * 1000;
      const label = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      buckets.push({ label, count: 0, ts });
    }

    sessions.forEach((s) => {
      if (!s.issuedAt) return;
      const deltaHours = Math.floor((now - s.issuedAt) / (60 * 60 * 1000));
      if (deltaHours < 0 || deltaHours >= hours) return;
      const idx = hours - 1 - deltaHours;
      if (buckets[idx]) buckets[idx].count += 1;
    });

    return {
      labels: buckets.map((b) => b.label),
      values: buckets.map((b) => b.count),
    };
  }, [sessions]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    const fetchSessions = isSuperAdmin ? listSessionsAll : listSessions;
    fetchSessions({
      tenantId: isSuperAdmin ? tenantIdFilter || undefined : undefined,
      subAccountId: subAccountId.trim() || undefined,
      limit: 500,
      signal: controller.signal,
    })
      .then((res) => setSessions(res.items ?? []))
      .catch(() => setSessions([]))
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [isSuperAdmin, tenantIdFilter, subAccountId, listSessions, listSessionsAll]);

  useEffect(() => {
    const controller = new AbortController();
    listSubAccounts(isSuperAdmin ? tenantIdFilter || undefined : undefined, controller.signal)
      .then((res) => setSubAccounts(res.items ?? []))
      .catch(() => setSubAccounts([]));
    return () => controller.abort();
  }, [isSuperAdmin, tenantIdFilter, listSubAccounts]);

  useEffect(() => {
    const controller = new AbortController();
    listKeyTypes(controller.signal)
      .then((res) => {
        setAllowedKeyTypes(res.items ?? []);
        setIsSuperAdmin(Boolean(res.isSuperAdmin));
        setKeyTypesReady(true);
      })
      .catch(() => {
        setAllowedKeyTypes(null);
        setKeyTypesReady(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const controller = new AbortController();
    listTenants(controller.signal)
      .then((res) => setTenants(res.items ?? []))
      .catch(() => setTenants([]));
    return () => controller.abort();
  }, [isSuperAdmin, listTenants]);

  const filteredKeyTypes = useMemo(() => {
    if (!keyTypesReady) return [{ label: 'All', value: 'all' }];
    if (!allowedKeyTypes) return keyTypes;
    const allowed = new Set(allowedKeyTypes);
    return keyTypes.filter((opt) => opt.value === 'all' || allowed.has(opt.value));
  }, [allowedKeyTypes, keyTypes, keyTypesReady]);

  useEffect(() => {
    if (!keyTypesReady || !allowedKeyTypes) return;
    if (keyType === 'all') return;
    if (!allowedKeyTypes.includes(keyType)) {
      setKeyType('all');
    }
  }, [keyTypesReady, allowedKeyTypes, keyType]);

  const fetchKeys = (targetCursor?: string | null) => {
    const controller = new AbortController();
    setIsLoadingKeys(true);
    const fetchKeysFn = isSuperAdmin ? listKeysAll : listKeys;
    fetchKeysFn({
      tenantId: isSuperAdmin ? tenantIdFilter || undefined : undefined,
      type: keyType === 'all' ? undefined : keyType,
      subAccountId: subAccountId.trim() || undefined,
      cursor: targetCursor || undefined,
      limit: 50,
      signal: controller.signal,
    })
      .then((res) => {
        setKeys(res.items ?? []);
        setNextCursor(res.nextCursor ?? null);
        setCursor(targetCursor ?? undefined);
      })
      .catch(() => setKeys([]))
      .finally(() => setIsLoadingKeys(false));
    return () => controller.abort();
  };

  useEffect(() => {
    setCursorHistory([]);
    setCursor(undefined);
    setNextCursor(null);
    fetchKeys(undefined);
  }, [keyType, subAccountId, tenantIdFilter, isSuperAdmin]);

  const handleNext = () => {
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, cursor ?? '']);
    fetchKeys(nextCursor);
  };

  const handlePrev = () => {
    setCursorHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next.pop();
      fetchKeys(last || undefined);
      return next;
    });
  };

  const handleView = (item: { key: string; type: string; ttl: number | null; valuePreview: string }) => {
    setKeyDetails(null);
    setSelectedKey(item.key);
    setRevealKeyValue(false);
    setViewModalOpen(true);
  };

  const handleDelete = async (item: { key: string }) => {
    const result = await swalModal.fire({
      title: 'Delete key?',
      text: 'This action cannot be undone.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;
    await deleteKey(item.key);
    fetchKeys(cursor);
  };

  const handleRevokeSessions = async (item: { subAccountId?: string | null }) => {
    const subId = item.subAccountId?.trim();
    if (!subId) {
      await swalModal.fire({
        title: 'Missing sub account',
        text: 'This session record does not include a sub account id.',
        confirmButtonText: 'OK',
      });
      return;
    }
    const result = await swalModal.fire({
      title: 'Revoke sessions?',
      text: `This will revoke all sessions for sub account ${subId}.`,
      showCancelButton: true,
      confirmButtonText: 'Revoke',
      cancelButtonText: 'Cancel',
    });
    if (!result.isConfirmed) return;
    await revokeSessions(subId);
    fetchKeys(cursor);
  };

  const handleEdit = (item: { key: string }) => {
    setKeyDetails(null);
    setSelectedKey(item.key);
    setRevealKeyValue(false);
    setEditModalOpen(true);
  };

  const scheduleRevealTimeout = useCallback(() => {
    if (revealTimeoutRef.current) {
      window.clearTimeout(revealTimeoutRef.current);
    }
    revealTimeoutRef.current = window.setTimeout(() => {
      setRevealKeyValue(false);
    }, 30000);
  }, []);

  const ActionsMenu = ({ item }: { item: { key: string; type: string; ttl: number | null; valuePreview: string; subAccountId?: string | null } }) => (
    <DropdownMenu>
      <Menu.Item>
        {({ active }) => (
          <button
            className="boomi-menu-item"
            data-headlessui-state={active ? 'active' : undefined}
            onClick={() => handleView(item)}
          >
            <AiOutlineEye className="boomi-menu-icon" />
            View
          </button>
        )}
      </Menu.Item>
      {isSuperAdmin && item.type !== 'user-sessions' && (
        <>
          <div className="boomi-menu-divider" />
          <Menu.Item>
            {({ active }) => (
              <button
                className="boomi-menu-item"
                data-headlessui-state={active ? 'active' : undefined}
                onClick={() => handleEdit(item)}
              >
                <AiOutlineEdit className="boomi-menu-icon" />
                Edit
              </button>
            )}
          </Menu.Item>
        </>
      )}
      <div className="boomi-menu-divider" />
      {item.type === 'user-sessions' ? (
        <Menu.Item>
          {({ active }) => (
            <button
              className="boomi-menu-item boomi-menu-item--danger"
              data-headlessui-state={active ? 'active' : undefined}
              onClick={() => handleRevokeSessions(item)}
            >
              <AiOutlineDelete className="boomi-menu-icon" />
              Revoke sessions
            </button>
          )}
        </Menu.Item>
      ) : (
        <Menu.Item>
          {({ active }) => (
            <button
              className="boomi-menu-item boomi-menu-item--danger"
              data-headlessui-state={active ? 'active' : undefined}
              onClick={() => handleDelete(item)}
            >
              <AiOutlineDelete className="boomi-menu-icon" />
              Delete
            </button>
          )}
        </Menu.Item>
      )}
    </DropdownMenu>
  );

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const accent = rootStyle.getPropertyValue('--boomi-accent').trim() || '#6366f1';

    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Active Sessions',
            data: series.values,
            borderColor: accent,
            backgroundColor: `${accent}26`,
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });

    return () => {
      chartInstance.current?.destroy();
      chartInstance.current = null;
    };
  }, [series]);

  useEffect(() => {
    if (!selectedKey || (!viewModalOpen && !editModalOpen)) return;
    const controller = new AbortController();
    setIsLoadingKeyDetails(true);
    getKeyDetails(selectedKey, { reveal: revealKeyValue, signal: controller.signal })
      .then((res) => setKeyDetails(res))
      .catch(() => setKeyDetails(null))
      .finally(() => setIsLoadingKeyDetails(false));
    return () => controller.abort();
  }, [selectedKey, viewModalOpen, editModalOpen, revealKeyValue, getKeyDetails]);

  useEffect(() => {
    if (!viewModalOpen) {
      if (revealTimeoutRef.current) window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
      return;
    }
    if (!revealKeyValue) {
      if (revealTimeoutRef.current) window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
      return;
    }
    scheduleRevealTimeout();
    return () => {
      if (revealTimeoutRef.current) window.clearTimeout(revealTimeoutRef.current);
    };
  }, [revealKeyValue, scheduleRevealTimeout, viewModalOpen]);

  const handleSaveKey = async (payload: { key: string; value: string; ttlSeconds?: number }) => {
    setIsSavingKey(true);
    try {
      await updateKey(payload.key, payload.value, payload.ttlSeconds);
      setEditModalOpen(false);
      setSelectedKey(null);
      fetchKeys(cursor);
    } finally {
      setIsSavingKey(false);
    }
  };

  return (
    <div className="w-full h-full p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Cache</h1>
        <p className="text-sm opacity-70">{tenantLabel}</p>
      </div>

      <div className="flex flex-col gap-6">
        <RedisKeyViewModal
          isOpen={viewModalOpen}
          isLoading={isLoadingKeyDetails}
          details={keyDetails}
          revealEnabled={keyDetails?.type === 'tenant-creds'}
          isRevealed={revealKeyValue}
          onReveal={() => {
            setRevealKeyValue(true);
            scheduleRevealTimeout();
          }}
          onActivity={() => {
            if (revealKeyValue) scheduleRevealTimeout();
          }}
          onClose={() => {
            setViewModalOpen(false);
            setSelectedKey(null);
            setRevealKeyValue(false);
          }}
        />
        <RedisKeyEditModal
          isOpen={editModalOpen}
          isSaving={isSavingKey}
          details={keyDetails}
          canEdit={Boolean(keyDetails?.editable) && (keyDetails?.type !== 'tenant-creds' || revealKeyValue)}
          revealEnabled={keyDetails?.type === 'tenant-creds'}
          isRevealed={revealKeyValue}
          onReveal={() => setRevealKeyValue(true)}
          onActivity={() => {}}
          onClose={() => {
            setEditModalOpen(false);
            setSelectedKey(null);
            setRevealKeyValue(false);
          }}
          onSubmit={handleSaveKey}
        />
        <section className="boomi-card p-5 space-y-3">
          <h2 className="text-lg font-semibold">Active Sessions</h2>
          <p className="text-sm opacity-70">
            Chart.js panel will surface live session counts by tenant/sub account.
          </p>
          <div className="h-48 rounded-lg border border-dashed border-current/10 relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-sm opacity-60">
                Loading sessions...
              </div>
            )}
            <canvas ref={chartRef} className="w-full h-full" />
          </div>
        </section>

        <section className="boomi-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Keys</h2>
              <p className="text-sm opacity-70">
                Filter by key type and sub account id. Values are obfuscated by default.
              </p>
            </div>
            <div className="flex gap-2">
              <Button toggle={false} primary label="Refresh" onClick={() => fetchKeys(cursor)} />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 mt-4">
            <div className="min-w-[220px]">
              <SearchBar
                searchCallback={(val) => setSearchTerm(val)}
              />
            </div>
            <label className="text-xs font-semibold">
              Key type
              <select
                className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                value={keyType}
                onChange={(e) => setKeyType(e.target.value)}
              >
                {filteredKeyTypes.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {isSuperAdmin && (
              <label className="text-xs font-semibold">
                Tenant
                <select
                  className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                  value={tenantIdFilter}
                  onChange={(e) => {
                    setTenantIdFilter(e.target.value);
                    setSubAccountId('');
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
            <label className="text-xs font-semibold">
              Sub account
              <select
                className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                value={subAccountId}
                onChange={(e) => setSubAccountId(e.target.value)}
              >
                <option value="">All</option>
                {subAccounts.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex w-full flex-wrap justify-end gap-2 md:w-auto">
              <button
                type="button"
                className="boomi-btn-secondary px-3 py-2 rounded-md text-sm font-semibold border"
                onClick={async () => {
                  const result = await swalModal.fire({
                    title: 'Clear tenant keys?',
                    text: 'This removes all Redis keys for this tenant and its sub accounts.',
                    showCancelButton: true,
                    confirmButtonText: 'Clear',
                    cancelButtonText: 'Cancel',
                  });
                  if (!result.isConfirmed) return;
                  await clearTenant();
                  fetchKeys(undefined);
                }}
              >
                Clear tenant (all subs)
              </button>
              <button
                type="button"
                className="boomi-btn-secondary px-3 py-2 rounded-md text-sm font-semibold border"
                onClick={async () => {
                  const subId = subAccountId.trim();
                  if (!subId) {
                    await swalModal.fire({
                      title: 'Select a sub account',
                      text: 'Choose a sub account before clearing.',
                      confirmButtonText: 'OK',
                    });
                    return;
                  }
                  const result = await swalModal.fire({
                    title: 'Clear sub account keys?',
                    text: `This removes all Redis keys for sub account ${subId}.`,
                    showCancelButton: true,
                    confirmButtonText: 'Clear',
                    cancelButtonText: 'Cancel',
                  });
                  if (!result.isConfirmed) return;
                  await clearSubAccount(subId);
                  fetchKeys(undefined);
                }}
              >
                Clear sub account
              </button>
            </div>
          </div>
          <div className="">
            <table className="w-full table-auto rounded-lg shadow-sm">
              <thead className="boomi-table-header">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-semibold">Key</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold">Type</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold">TTL</th>
                  {isSuperAdmin && (
                    <th className="py-3 px-4 text-left text-sm font-semibold">Tenant</th>
                  )}
                  <th className="py-3 px-4 text-left text-sm font-semibold">Sub</th>
                  <th className="py-3 px-4 text-right text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoadingKeys ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 6 : 5}>
                      <div className="flex justify-center items-center py-6">
                        <AjaxLoader />
                      </div>
                    </td>
                  </tr>
                ) : filteredKeys.length > 0 ? (
                  filteredKeys.map((item) => {
                    const displayKey =
                      item.type === 'user-sessions' && item.subAccountId
                        ? `session:${item.subAccountId}`
                        : item.key;
                    return (
                      <tr key={item.key} className="boomi-table-row overflow-visible">
                        <td
                          className="py-3 px-4 text-xs max-w-[360px] truncate"
                          title={item.key}
                        >
                          {displayKey}
                        </td>
                        <td className="py-3 px-4 text-xs">{keyTypeLabels.get(item.type) ?? item.type}</td>
                        <td className="py-3 px-4 text-xs">{item.ttl ?? '—'}</td>
                        {isSuperAdmin && (
                          <td className="py-3 px-4 text-xs">{item.tenantId ?? '—'}</td>
                        )}
                        <td className="py-3 px-4 text-xs">{item.subAccountId ?? '—'}</td>
                        <td className="py-3 px-4 text-xs text-right overflow-visible relative">
                          <div className="flex justify-end">
                            <ActionsMenu item={item} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={isSuperAdmin ? 6 : 5}>
                      <div className="flex justify-center items-center py-4 text-xs opacity-60">
                        No keys found.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center text-xs">
            <Button
              toggle={false}
              primary={false}
              label="Previous"
              onClick={handlePrev}
              disabled={cursorHistory.length === 0}
            />
            <Button
              toggle={false}
              primary={false}
              label="Next"
              onClick={handleNext}
              disabled={!nextCursor}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default RedisAdmin;
