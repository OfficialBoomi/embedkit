/**
 * @file Agent.tsx
 * @component Agent
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description * 
 * TODO refactor to remove panels
 * entire file and it’s purpose needs to be refactored for modals.
 *
 * @return {JSX.Element} 
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FiMaximize2 as Maximize, FiMinimize2 as Minimize } from 'react-icons/fi';
import { usePlugin } from '../../context/pluginContext';
import { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import AjaxLoader from '../ui/AjaxLoader';
import { useAgentStatus } from '../../hooks/agent/useAgentStatus';
import AgentChatGPTLayout from './AgentChatGPTLayout';
import ModalShell from './layout/ModalShell';

export interface AgentProps {
  integrationPackId: string;
}

const Agent: React.FC<AgentProps> = ({
  integrationPackId,
}) => {
  const { boomiConfig } = usePlugin();
  const environmentId = boomiConfig?.agents?.[integrationPackId]?.environmentId;
  const launcherPosition = boomiConfig?.agents?.[integrationPackId]?.position || { corner: 'bottom-right', offsetX: 24, offsetY: 40 };
  const shape = boomiConfig?.agents?.[integrationPackId]?.shape || 'pill';
  const label = boomiConfig?.agents?.[integrationPackId]?.label || 'Chat with us';
  const customIcon = boomiConfig?.agents?.[integrationPackId]?.icon;
  const hideIcon = boomiConfig?.agents?.[integrationPackId]?.hideIcon;
  const name = boomiConfig?.agents?.[integrationPackId]?.installAsName ?? 'Agent'
  const transport = boomiConfig?.agents?.[integrationPackId]?.transport;
  const expandable = boomiConfig?.agents?.[integrationPackId]?.expandable ?? false;
  const { instance, installed, loading } = useAgentStatus(
    integrationPackId || '',
    environmentId || '',
    name,
    transport
  );
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<'info' | 'configure' | 'chat'>('info');
  const [headerActions, setHeaderActions] = useState<React.ReactNode | null>(null);
  const uiConfig = boomiConfig?.agents?.[integrationPackId]?.ui;
  const modeSetting = uiConfig?.mode ?? 'full';
  const modalSize = {
    w: uiConfig?.modal?.width ?? 980,
    h: uiConfig?.modal?.height ?? 720,
  };
  const modalPosition = uiConfig?.modal?.position;
  const integration = useMemo<IntegrationPackInstance>(() => {
    return {
      id: instance?.id ?? integrationPackId,
      integrationPackId,
      environmentId: environmentId || '',
      installationType: 'MULTI',
    };
  }, [integrationPackId, environmentId, instance?.id]);

  const launcherStyle = useMemo<React.CSSProperties>(() => {
    const base: React.CSSProperties = { position: 'fixed', zIndex: 999998 };
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
    base.top  = launcherPosition.y;
    return base;
  }, [launcherPosition]);

  const modalPositionStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!modalPosition) return undefined;

    const base: React.CSSProperties = {
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

  const ariaLabel = loading ? 'Agent (loading)' : (installed ? 'Open Agent chat' : 'Open Agent info');

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setHeaderActions(null);
      setExpanded(false);
    }
  }, [open]);

  const overlayContent = () => {
    if (!instance) {
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

  const renderOverlay = () => {
    if (!open || !installed) return null;

    if (modeSetting === 'modal') {
      return (
        <ModalShell size={modalSize} style={modalPositionStyle} expanded={expanded}>
          <div className="boomi-agent-overlay__inner">
            <div className="boomi-agent-overlay__header">
              <div className="boomi-agent-overlay__title">{label || 'Agent'}</div>
              <div className="boomi-agent-overlay__header-actions">
                {headerActions}
                {expandable && (
                  <button
                    type="button"
                    aria-label={expanded ? 'Collapse agent' : 'Expand agent'}
                    className="boomi-agent-overlay__close"
                    onClick={() => setExpanded((e) => !e)}
                  >
                    {expanded ? <Minimize size={14} /> : <Maximize size={14} />}
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close agent"
                  className="boomi-agent-overlay__close"
                  onClick={() => setOpen(false)}
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
            onClick={() => setOpen(false)}
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

  return (
    <>
      <button
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => {
          if (!installed) setMode('info');
          else setMode('chat');
          setOpen((o) => !o);
        }}
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

      {renderOverlay()}
    </>
  );
};

export default Agent;
