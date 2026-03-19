import { useEffect, useState } from 'react';
import { AiOutlineDelete, AiOutlinePlus } from 'react-icons/ai';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import JsonEditorField from './JsonEditorField';
import ConfigBuilderForm from './ConfigBuilderForm';
import Button from '../../ui/Button';

export type EditAgentPayload = {
  agentId: string;
  label?: string;
  allowedOrigins?: string[];
  config?: Record<string, unknown> | null;
};

type EditAgentModalProps = {
  isOpen: boolean;
  agentId: string | null;
  label?: string | null;
  allowedOrigins?: string[] | null;
  defaultOrigins?: string[];
  onAddOrigin?: (origin: string) => Promise<string[] | void> | void;
  config?: Record<string, unknown> | null;
  onClose: () => void;
  onSubmit: (payload: EditAgentPayload) => Promise<void> | void;
  isSaving?: boolean;
  availableAgents?: Array<{ id: string; label: string }>;
};

function isValidOrigin(origin: string): boolean {
  if (origin.trim().toLowerCase() === 'null') return true;
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const EditAgentModal: React.FC<EditAgentModalProps> = ({
  isOpen,
  agentId,
  label,
  allowedOrigins,
  defaultOrigins,
  onAddOrigin,
  config,
  onClose,
  onSubmit,
  isSaving,
  availableAgents,
}) => {
  const [labelValue, setLabelValue] = useState('');
  const [allowedOriginList, setAllowedOriginList] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState('');
  const [isAddingOrigin, setIsAddingOrigin] = useState(false);
  const [configRaw, setConfigRaw] = useState('');
  const [configBuilderKey, setConfigBuilderKey] = useState(0);
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

  const deriveProjectInfo = () => {
    try {
      const parsed = configRaw.trim() ? JSON.parse(configRaw) : null;
      const project = parsed && typeof parsed === 'object' ? (parsed as any).project : null;
      const embedType = typeof project?.embedType === 'string' ? project.embedType : 'single';
      const agentIds = Array.isArray(project?.agentIds) ? project.agentIds.filter(Boolean) : [];
      return { embedType, agentIds };
    } catch {
      return { embedType: 'single', agentIds: [] as string[] };
    }
  };

  const projectInfo = deriveProjectInfo();
  const stubIds = projectInfo.agentIds.length > 0 ? projectInfo.agentIds : (agentId ? [agentId] : []);
  const configStubText = JSON.stringify(
    buildConfigStub(projectInfo.embedType as 'single' | 'tiles' | 'list', stubIds),
    null,
    2
  );

  useEffect(() => {
    if (isOpen) {
      setLabelValue(label ?? '');
      const initialOrigins =
        (allowedOrigins && allowedOrigins.length ? allowedOrigins : defaultOrigins) ?? [];
      setAllowedOriginList(initialOrigins);
      setNewOrigin('');
      setConfigRaw(config ? JSON.stringify(config, null, 2) : '');
      setConfigBuilderKey((k) => k + 1);
      setOriginsError(null);
      setConfigError(null);
      setConfigTab('builder');
    }
  }, [isOpen, label, config, allowedOrigins, defaultOrigins]);

  const handleSubmit = async () => {
    if (!agentId) return;

    let parsedConfig: Record<string, unknown> | null | undefined = undefined;
    const cfg = configRaw.trim();
    if (cfg) {
      try {
        parsedConfig = JSON.parse(cfg);
      } catch {
        setConfigError('Config must be valid JSON');
        return;
      }
    }
    setConfigError(null);

    const dedupedOrigins = Array.from(
      new Set(allowedOriginList.map((origin) => origin.trim()).filter(Boolean))
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

    if (parsedConfig && agentId) {
      const project = (parsedConfig as any).project;
      const embedType = project?.embedType;
      const boomiAgentId = Array.isArray(project?.agentIds) ? project.agentIds[0] : null;
      if (embedType === 'single' && boomiAgentId) {
        const agents = { ...((parsedConfig as any).agents ?? {}) };
        if (agents[boomiAgentId] && !agents[agentId]) {
          agents[agentId] = agents[boomiAgentId];
          (parsedConfig as any).agents = agents;
        }
      }
    }

    await onSubmit({
      agentId,
      label: labelValue.trim() || undefined,
      allowedOrigins: dedupedOrigins,
      config: parsedConfig,
    });
  };

  const addOriginRow = () => {
    const options = defaultOrigins ?? [];
    const selectedSet = new Set(
      allowedOriginList.map((item) => item.trim()).filter(Boolean)
    );
    const next = options.find((opt) => !selectedSet.has(opt)) ?? '';
    setAllowedOriginList((prev) => [...prev, next]);
  };

  const handleOriginChange = (idx: number, value: string) => {
    setAllowedOriginList((prev) => prev.map((item, i) => (i === idx ? value : item)));
  };

  const removeOrigin = (idx: number) => {
    setAllowedOriginList((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddNewOrigin = async () => {
    const value = newOrigin.trim();
    if (!value) {
      setOriginsError('Enter an origin before adding.');
      return;
    }
    if (!isValidOrigin(value)) {
      setOriginsError(`Invalid origin (must be http/https): ${value}`);
      return;
    }
    setOriginsError(null);
    if (!onAddOrigin) {
      setAllowedOriginList((prev) => (prev.includes(value) ? prev : [...prev, value]));
      setNewOrigin('');
      return;
    }
    setIsAddingOrigin(true);
    try {
      await onAddOrigin(value);
      setAllowedOriginList((prev) => (prev.includes(value) ? prev : [...prev, value]));
      setNewOrigin('');
    } catch (e: any) {
      setOriginsError(e?.message || 'Failed to add origin.');
    } finally {
      setIsAddingOrigin(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Edit Agent"
      description="Update agent details and allowed origins."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isSaving ? 'Saving...' : 'Save Changes'}
      showSaveButton={!isSaving}
    >
      <div className="boomi-card p-4 space-y-2">
        <div className="text-sm font-semibold">Agent Overview</div>
        <div className="text-xs opacity-80">
          Agent ID: <strong>{agentId ?? '—'}</strong>
        </div>
        <div className="text-xs opacity-70">
          Update the friendly name, allowed origins, and optional config overrides below.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Input
            formName="agentEdit"
            label="Name"
            required={false}
            inputName="name"
            readOnly={false}
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            placeholder="Customer Support Agent"
          />

          <Input
            formName="agentEdit"
            label="Agent ID"
            required
            inputName="agentId"
            readOnly
            value={agentId ?? ''}
            onChange={() => undefined}
            helperText="This is the Boomi Agent ID for your agent and cannot be changed."
          />
        </div>

        <div className="space-y-2">
          <label className="boomi-form-label">Allowed Origins</label>
          <div className="space-y-2">
            {allowedOriginList.length === 0 && (
              <div className="text-xs opacity-70">No origins selected.</div>
            )}
            {allowedOriginList.map((origin, idx) => {
              const selectedSet = new Set(
                allowedOriginList.map((item) => item.trim()).filter(Boolean)
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
          {originsError && <div className="text-xs text-red-500">{originsError}</div>}
          <div className="flex items-center gap-2">
            <Button
              toggle={false}
              primary={false}
              showIcon={false}
              label="Add Row"
              onClick={addOriginRow}
            />
            <div className="flex-1 flex items-center gap-2">
              <input
                className="boomi-input w-full rounded-md p-2 text-sm"
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
                placeholder="https://example.com"
              />
              <button
                type="button"
                className="boomi-btn-primary px-2 py-2 text-xs"
                onClick={handleAddNewOrigin}
                disabled={isAddingOrigin}
                aria-label="Add new origin"
              >
                <AiOutlinePlus />
              </button>
            </div>
          </div>
          <div className="text-xs opacity-70">
            Pick from existing CORS origins or add a new one here.
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">UI Configuration</div>
            <div className="text-xs opacity-70">
              Optional. Use JSON to customize themes, layout, and agent UI.
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
            key={configBuilderKey}
            embedType={projectInfo.embedType as 'single' | 'tiles' | 'list'}
            agentIds={stubIds}
            configRaw={configRaw}
            onChangeConfig={(nextConfig) => {
              const nextRaw = JSON.stringify(nextConfig, null, 2);
              if (nextRaw !== configRaw) setConfigRaw(nextRaw);
            }}
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

export default EditAgentModal;
