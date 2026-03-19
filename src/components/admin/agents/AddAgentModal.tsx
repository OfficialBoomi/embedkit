import { useCallback, useEffect, useRef, useState } from 'react';
import { AiOutlineDelete } from 'react-icons/ai';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import JsonEditorField from './JsonEditorField';
import ConfigBuilderForm, { type ConfigBuilderFormHandle } from './ConfigBuilderForm';
import Button from '../../ui/Button';

export type AddAgentPayload = {
  agentId: string;
  boomiAgentId?: string;
  label?: string;
  allowedOrigins?: string[];
  config?: Record<string, unknown> | null;
};

type AddAgentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: AddAgentPayload) => Promise<void> | void;
  isSaving?: boolean;
  defaultOrigins?: string[];
  availableAgents?: Array<{ id: string; label: string }>;
};

function isValidOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const AddAgentModal: React.FC<AddAgentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSaving,
  defaultOrigins,
  availableAgents,
}) => {
  const [label, setLabel] = useState('');
  const [labelError, setLabelError] = useState<string | null>(null);
  const [labelTouched, setLabelTouched] = useState(false);
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [configRaw, setConfigRaw] = useState('');
  const latestConfigRef = useRef<Record<string, unknown> | null>(null);
  const configBuilderRef = useRef<ConfigBuilderFormHandle>(null);

  const handleConfigChange = useCallback((nextConfig: Record<string, unknown>) => {
    latestConfigRef.current = nextConfig;
    setConfigRaw((prev) => {
      const nextRaw = JSON.stringify(nextConfig, null, 2);
      return nextRaw !== prev ? nextRaw : prev;
    });
  }, []);
  const [embedType, setEmbedType] = useState<'single' | 'tiles' | 'list'>('single');
  const [selectedSingleAgentId, setSelectedSingleAgentId] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [originsError, setOriginsError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configTab, setConfigTab] = useState<'builder' | 'json'>('builder');

  const buildAgentsStub = (ids: string[], mode: 'modal' | 'full') => {
    const useIds = ids.length > 0 ? ids : ['agent-id'];
    return useIds.reduce<Record<string, unknown>>((acc, id) => {
      acc[id] = {
        transport: 'boomi-direct',
        ui: {
          mode,
          modal: { width: 500, height: 600, position: { corner: 'bottom-right', offsetX: 20, offsetY: 100 } },
          sidebar: { show: mode === 'full', width: 280 },
          welcome: {
            title: "Let's Talk",
            subtitle: 'Ask me about your Boomi deployment.',
          },
        },
      };
      return acc;
    }, {});
  };

  const buildConfigStub = (type: 'single' | 'tiles' | 'list', ids: string[]) => {
    const base: Record<string, unknown> = {
      transport: 'boomi-direct',
      theme: {
        allowThemes: true,
        defaultTheme: 'boomi',
      },
      cssVarsByTheme: {
        oem: {
          '--boomi-root-bg-color': '#0b1220',
          '--boomi-root-fg-color': '#e5e7eb',
          '--boomi-page-bg-color': '#0b1220',
          '--boomi-page-fg-color': '#e5e7eb',
          '--boomi-header-bg-color': 'rgba(15, 23, 42, 0.8)',
          '--boomi-header-fg-color': '#e5e7eb',
          '--boomi-btn-primary-bg': '#2563eb',
          '--boomi-btn-primary-fg': '#ffffff',
          '--boomi-card-bg': '#0f172a',
          '--boomi-card-border': '#1f2937',
          '--boomi-menu-bg': '#0f172a',
          '--boomi-menu-fg': '#e5e7eb',
          '--boomi-modal-bg': '#0f172a',
          '--boomi-modal-fg': '#e5e7eb',
          '--boomi-input-bg': '#0b1220',
          '--boomi-input-fg': '#e5e7eb',
        },
      },
    };

    if (type === 'list') {
      base.components = {
        agentList: {
          launcher: {
            position: { corner: 'bottom-right', offsetX: 20, offsetY: 40 },
            shape: 'pill',
            label: 'Find an Agent',
            icon: 'bot',
            hideIcon: false,
          },
          modal: { width: 500, height: 600, position: { corner: 'bottom-right', offsetX: 20, offsetY: 100 } },
          welcome: { title: 'Agents', subtitle: 'Search for an agent and click to launch.' },
        },
      };
    }

    const agentIds = ids.length > 0 ? ids : ['agent-id'];
    base.agents = buildAgentsStub(agentIds, type === 'single' ? 'modal' : 'full');
    return base;
  };

  const stubIds =
    embedType === 'single'
      ? (selectedSingleAgentId ? [selectedSingleAgentId] : [])
      : selectedAgentIds;
  const configStubText = JSON.stringify(buildConfigStub(embedType, stubIds), null, 2);

  useEffect(() => {
    if (!isOpen) return;
    setLabel('');
    setLabelError(null);
    setLabelTouched(false);
    setAllowedOrigins([]);
    setConfigRaw('');
    setEmbedType('single');
    setSelectedSingleAgentId('');
    setSelectedAgentIds([]);
    setAgentError(null);
    setOriginsError(null);
    setConfigError(null);
    setConfigTab('builder');
  }, [isOpen]);

  // Pre-select first agent once the list loads, but only if nothing is selected yet
  useEffect(() => {
    if (!isOpen || !availableAgents?.length) return;
    setSelectedSingleAgentId((prev) => prev || availableAgents[0].id);
    setSelectedAgentIds((prev) => prev.length ? prev : [availableAgents[0].id]);
  }, [isOpen, availableAgents]);

  useEffect(() => {
    if (embedType === 'single') {
      if (!selectedSingleAgentId && selectedAgentIds[0]) {
        setSelectedSingleAgentId(selectedAgentIds[0]);
      }
    } else if (selectedAgentIds.length === 0 && selectedSingleAgentId) {
      setSelectedAgentIds([selectedSingleAgentId]);
    }
  }, [embedType, selectedAgentIds, selectedSingleAgentId]);

  const toggleAgentId = (id: string) => {
    setSelectedAgentIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const createProjectId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `project_${crypto.randomUUID()}`;
    }
    return `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  };

  const handleSubmit = async () => {
    if (!label.trim()) {
      setLabelTouched(true);
      setLabelError('Project name is required.');
      return;
    }
    setLabelError(null);
    const selectedIds =
      embedType === 'single'
        ? (selectedSingleAgentId ? [selectedSingleAgentId] : [])
        : selectedAgentIds;
    if (!selectedIds.length) {
      setAgentError('Select at least one agent');
      return;
    }
    setAgentError(null);

    let config: Record<string, unknown> | null | undefined;
    if (configTab === 'builder') {
      config = configBuilderRef.current?.getConfig() ?? undefined;
    } else {
      const cfg = configRaw.trim();
      if (cfg) {
        try {
          config = JSON.parse(cfg);
        } catch {
          setConfigError('Config must be valid JSON');
          return;
        }
      }
    }
    setConfigError(null);

    const configBase = (config && typeof config === 'object') ? { ...config } : {};
    const projectCfg = (configBase as any).project && typeof (configBase as any).project === 'object'
      ? { ...(configBase as any).project }
      : {};
    (configBase as any).project = { ...projectCfg, embedType, agentIds: selectedIds };

    const dedupedOrigins = Array.from(
      new Set(allowedOrigins.map((origin) => origin.trim()).filter(Boolean))
    );
    if (!dedupedOrigins.length) {
      setOriginsError('At least one allowed origin is required.');
      return;
    }
    for (const origin of dedupedOrigins) {
      if (!isValidOrigin(origin)) {
        setOriginsError(`Invalid origin (must be http/https): ${origin}`);
        return;
      }
    }
    setOriginsError(null);

    const projectId = createProjectId();
    if (embedType === 'single' && selectedSingleAgentId) {
      const agents = { ...((configBase as any).agents ?? {}) };
      if (agents[selectedSingleAgentId] && !agents[projectId]) {
        agents[projectId] = agents[selectedSingleAgentId];
        (configBase as any).agents = agents;
      }
    }
    console.log('[AddAgentModal] submitting configBase:', JSON.stringify(configBase, null, 2));
    await onSubmit({
      agentId: projectId,
      boomiAgentId: embedType === 'single' ? selectedSingleAgentId : undefined,
      label: label.trim() || undefined,
      allowedOrigins: dedupedOrigins,
      config: configBase,
    });
  };

  const addOriginRow = () => {
    setAllowedOrigins((prev) => [...prev, '']);
  };

  const handleOriginChange = (idx: number, value: string) => {
    setAllowedOrigins((prev) => prev.map((item, i) => (i === idx ? value : item)));
  };

  const removeOrigin = (idx: number) => {
    setAllowedOrigins((prev) => prev.filter((_, i) => i !== idx));
  };

  // Creating new origins happens on the CORS page.

  return (
    <Modal
      isOpen={isOpen}
      title="Add Project"
      description="Create a new embedded agent group and its allowed embed origins."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isSaving ? 'Saving...' : 'Create Project'}
      showSaveButton={!isSaving}
    >
      <div className="boomi-card p-4 space-y-2">
        <div className="text-sm font-semibold">Project Summary</div>
        <div className="text-xs opacity-80">
          Embed type: <strong>{embedType === 'single' ? 'Single Agent' : embedType === 'tiles' ? 'Multi-Agent (Tiles)' : 'Multi-Agent (List)'}</strong>
        </div>
        <div className="text-xs opacity-80">
          Selected agents: <strong>{embedType === 'single' ? (selectedSingleAgentId ? 1 : 0) : selectedAgentIds.length}</strong>
        </div>
        <div className="text-xs opacity-70">
          You can start with the form below and optionally layer in advanced JSON config.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Input
            formName="agentAdd"
            label="Project Name"
            required
            inputName="name"
            readOnly={false}
            value={label}
            onChange={(e) => { setLabel(e.target.value); if (labelError) setLabelError(null); }}
            onBlur={() => { setLabelTouched(true); if (!label.trim()) setLabelError('Project name is required.'); }}
            placeholder="Customer Support Project"
          />
          {labelTouched && labelError && <div className="boomi-form-error">{labelError}</div>}

          <label className="boomi-form-label">
            Embed Type
            <select
              className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
              value={embedType}
              onChange={(e) => setEmbedType(e.target.value as 'single' | 'tiles' | 'list')}
            >
              <option value="single">Single Agent</option>
              <option value="tiles">Multi-Agent (Tiles)</option>
              <option value="list">Multi-Agent (Pill + Modal List)</option>
            </select>
          </label>

          {embedType === 'single' ? (
            <label className="boomi-form-label">
              Agent
              <select
                className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                value={selectedSingleAgentId}
                onChange={(e) => setSelectedSingleAgentId(e.target.value)}
              >
                {(availableAgents ?? []).length === 0 && (
                  <option value="">No agents available</option>
                )}
                {(availableAgents ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.label}
                  </option>
                ))}
              </select>
              {agentError && <div className="text-xs text-red-500 mt-1">{agentError}</div>}
            </label>
          ) : (
            <div>
              <label className="boomi-form-label">Agents</label>
              <div className="boomi-input w-full rounded-md p-2 text-sm space-y-2 max-h-48 overflow-auto">
                {(availableAgents ?? []).length === 0 ? (
                  <div className="text-xs opacity-70">No agents available</div>
                ) : (
                  (availableAgents ?? []).map((agent) => (
                    <label key={agent.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedAgentIds.includes(agent.id)}
                        onChange={() => toggleAgentId(agent.id)}
                      />
                      <span className="text-xs">{agent.label}</span>
                    </label>
                  ))
                )}
              </div>
              {agentError && <div className="text-xs text-red-500 mt-1">{agentError}</div>}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="boomi-form-label">Allowed Origins</label>
            <div className="text-xs opacity-70">
              Select origins from your CORS list. If you don’t see one you need, add it first in the CORS page.
            </div>
            <div className="space-y-2">
              {allowedOrigins.length === 0 && (
                <div className="text-xs opacity-70">No origins selected.</div>
              )}
              {allowedOrigins.map((origin, idx) => {
                const selectedSet = new Set(
                  allowedOrigins.map((item) => item.trim()).filter(Boolean)
                );
                const options = (defaultOrigins ?? []).filter(
                  (opt) => opt === origin || !selectedSet.has(opt)
                );
                const hasOriginOption = options.includes(origin);
                return (
                  <div key={`${origin}-${idx}`} className="flex items-center gap-2">
                    <select
                      className="boomi-input w-full rounded-md p-2 text-sm"
                      value={origin}
                      onChange={(e) => handleOriginChange(idx, e.target.value)}
                    >
                      {!origin && <option value="">Select an origin</option>}
                      {hasOriginOption ? null : origin ? (
                        <option value={origin}>{origin}</option>
                      ) : null}
                      {options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-red-500 text-lg cursor-pointer"
                      onClick={() => removeOrigin(idx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') removeOrigin(idx);
                      }}
                      aria-label="Remove origin"
                    >
                      <AiOutlineDelete />
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex">
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label="Add Allowed Origin"
                onClick={addOriginRow}
              />
            </div>
            {originsError && <div className="text-xs text-red-500">{originsError}</div>}
            <div className="text-xs opacity-70">
              Add new origins from the CORS page before selecting them here.
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">UI Configuration</div>
            <div className="text-xs opacity-70">
              Optional. Use JSON to customize themes, layout, and agent UI beyond the form inputs.
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--boomi-card-bg)] p-1 border border-[var(--boomi-card-border)]">
            <button
              type="button"
              className={`px-3 py-1 text-xs rounded-full ${configTab === 'builder' ? 'boomi-btn-primary' : 'opacity-70'}`}
              onClick={() => setConfigTab('builder')}
            >
              Builder
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-xs rounded-full ${configTab === 'json' ? 'boomi-btn-primary' : 'opacity-70'}`}
              onClick={() => setConfigTab('json')}
            >
              JSON
            </button>
          </div>
        </div>
        {configTab === 'builder' ? (
          <ConfigBuilderForm
            ref={configBuilderRef}
            embedType={embedType}
            agentIds={embedType === 'single' ? (selectedSingleAgentId ? [selectedSingleAgentId] : []) : selectedAgentIds}
            configRaw={configRaw}
            onChangeConfig={handleConfigChange}
            syncFromConfig={false}
            availableAgents={availableAgents}
          />
        ) : (
          <>
            <JsonEditorField
              label="Config (JSON)"
              value={configRaw}
              placeholder={configStubText}
              error={configError}
              onChange={setConfigRaw}
            />
            <div className="flex justify-end">
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label="Insert Starter Config"
                onClick={() => setConfigRaw(configStubText)}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default AddAgentModal;
