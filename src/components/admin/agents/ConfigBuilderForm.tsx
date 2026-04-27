import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { AgentCorner } from '../../../types/agent.config';

type EmbedType = 'single' | 'tiles' | 'list';

type AgentOverride = {
  label: string;
  description: string;
  icon: string;
  hideIcon: boolean;
  buttonLabel: string;
};

type PromptRow = { id: string; title: string; prompt: string };

type BuilderState = {
  // Theme
  themeSelection: 'boomi' | 'base' | 'custom';
  themeDefault: string;
  themeCustomName: string;
  themeCustomVars: Array<{ id: string; varName: string; value: string }>;
  // Launcher
  launcherCorner: AgentCorner;
  launcherOffsetX: string;
  launcherOffsetY: string;
  launcherShape: 'pill' | 'circle';
  launcherLabel: string;
  launcherIcon: string;
  launcherHideIcon: boolean;
  // List modal
  listModalWidth: string;
  listModalHeight: string;
  listModalCorner: AgentCorner;
  listModalOffsetX: string;
  listModalOffsetY: string;
  listWelcomeTitle: string;
  listWelcomeSubtitle: string;
  listHeaderShow: boolean;
  listHeaderTitle: string;
  listHeaderDescription: string;
  listSearchShow: boolean;
  // Tiles
  tilesHeaderShow: boolean;
  tilesHeaderTitle: string;
  tilesHeaderDescription: string;
  tilesSearchShow: boolean;
  tilesViewToggleShow: boolean;
  // Agent UI
  agentUiMode: 'modal' | 'full' | 'page';
  agentModalWidth: string;
  agentModalHeight: string;
  agentModalCorner: AgentCorner;
  agentModalOffsetX: string;
  agentModalOffsetY: string;
  agentSidebarShow: boolean;
  agentSidebarWidth: string;
  agentWelcomeTitle: string;
  agentWelcomeSubtitle: string;
  agentOverrides: Record<string, AgentOverride>;
  // Chat
  agentAllowFreeText: boolean;
  agentFileAttachmentSupported: boolean;
  agentFileAttachmentRequired: boolean;
  agentAllowedFileExtensions: string;
  agentMaxFiles: string;
  agentMaxTotalBytes: string;
  agentPrompts: PromptRow[];
  agentPromptsAlign: 'left' | 'center' | 'right';
  agentPromptsLocation: 'input' | 'welcome';
  // Advanced
  agentSessionScope: 'mount' | 'multi';
  agentTransport: 'boomi-direct' | 'boomi-proxy';
  agentExpandable: boolean;
  agentEnvironmentId: string;
};

type ConfigBuilderFormProps = {
  embedType: EmbedType;
  agentIds: string[];
  configRaw: string;
  onChangeConfig: (config: Record<string, unknown>) => void;
  onUpdateBuilder?: (builder: BuilderState) => void;
  syncFromConfig?: boolean;
  availableAgents?: Array<{ id: string; label: string }>;
};

export type ConfigBuilderFormHandle = {
  getConfig: () => Record<string, unknown>;
};

const iconOptions: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: '🤖', label: '🤖 Robot' },
  { value: '💬', label: '💬 Chat' },
  { value: '🗣️', label: '🗣️ Speaking' },
  { value: '✨', label: '✨ Sparkles' },
  { value: '🧠', label: '🧠 Brain' },
  { value: '💡', label: '💡 Idea' },
  { value: '🚀', label: '🚀 Rocket' },
  { value: '⚡', label: '⚡ Lightning' },
  { value: '🔍', label: '🔍 Search' },
  { value: '🛠️', label: '🛠️ Tools' },
  { value: '🤝', label: '🤝 Handshake' },
  { value: '🌐', label: '🌐 Globe' },
  { value: '🎯', label: '🎯 Target' },
  { value: '📊', label: '📊 Analytics' },
];

const cornerOptions: AgentCorner[] = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
];

const defaultAgentOverride = (): AgentOverride => ({
  label: '',
  description: '',
  icon: '🤖',
  hideIcon: false,
  buttonLabel: 'Launch',
});

const isHexColor = (v: string): boolean => /^#[0-9a-fA-F]{3,8}$/.test(v.trim());

const cssVarOptions = [
  '--boomi-font',
  '--default-font-family',
  '--boomi-accent',
  '--boomi-agent-bg',
  '--boomi-agent-blur',
  '--boomi-agent-border',
  '--boomi-agent-bubble-agent-bg',
  '--boomi-agent-bubble-agent-border',
  '--boomi-agent-bubble-agent-fg',
  '--boomi-agent-bubble-border',
  '--boomi-agent-bubble-shadow',
  '--boomi-agent-bubble-user-bg',
  '--boomi-agent-bubble-user-border',
  '--boomi-agent-bubble-user-fg',
  '--boomi-agent-card-tint',
  '--boomi-agent-chat-bg',
  '--boomi-agent-chat-border',
  '--boomi-agent-chat-fg',
  '--boomi-agent-close-bg-hover',
  '--boomi-agent-close-fg',
  '--boomi-agent-close-hover-fg',
  '--boomi-agent-compose-bg',
  '--boomi-agent-compose-border',
  '--boomi-agent-compose-input-bg',
  '--boomi-agent-compose-input-border',
  '--boomi-agent-compose-secondary-bg',
  '--boomi-agent-compose-secondary-border',
  '--boomi-agent-compose-shadow',
  '--boomi-agent-fg',
  '--boomi-agent-header-bg',
  '--boomi-agent-header-border',
  '--boomi-agent-pane-bg',
  '--boomi-agent-pane-bg-color',
  '--boomi-agent-pane-fg',
  '--boomi-agent-pane-fg-color',
  '--boomi-agent-radius',
  '--boomi-agent-ring',
  '--boomi-agent-row-shimmer-opacity',
  '--boomi-agent-row-tint',
  '--boomi-agent-section-bg',
  '--boomi-agent-section-border',
  '--boomi-agent-section-fg',
  '--boomi-agent-section-shadow',
  '--boomi-agent-shadow',
  '--boomi-agent-shimmer-1',
  '--boomi-agent-shimmer-2',
  '--boomi-agent-shimmer-angle',
  '--boomi-agent-shimmer-direction',
  '--boomi-agent-shimmer-opacity',
  '--boomi-agent-shimmer-speed',
  '--boomi-agent-tab-bg',
  '--boomi-agent-tab-bg-active',
  '--boomi-agent-tab-border',
  '--boomi-agent-tab-border-active',
  '--boomi-agent-tab-fg',
  '--boomi-agent-tab-fg-active',
  '--boomi-agent-tab-shadow-active',
  '--boomi-agent-text-bg',
  '--boomi-agent-text-border',
  '--boomi-agent-text-copy-bg',
  '--boomi-agent-text-copy-bg-hover',
  '--boomi-agent-text-copy-fg',
  '--boomi-agent-text-fg',
  '--boomi-agent-thread-separator',
  '--boomi-agent-update-bg',
  '--boomi-agent-update-border',
  '--boomi-agent-update-content-bg',
  '--boomi-agent-update-content-fg',
  '--boomi-agent-update-desc-fg',
  '--boomi-agent-update-fg',
  '--boomi-agent-update-radius',
  '--boomi-agent-update-shadow',
  '--boomi-agent-update-title-fg',
  '--boomi-angle',
  '--boomi-btn-primary-bg',
  '--boomi-btn-primary-bg-active',
  '--boomi-btn-primary-bg-hover',
  '--boomi-btn-primary-border',
  '--boomi-btn-primary-border-active',
  '--boomi-btn-primary-border-hover',
  '--boomi-btn-primary-fg',
  '--boomi-btn-primary-fg-active',
  '--boomi-btn-primary-fg-hover',
  '--boomi-btn-primary-shadow',
  '--boomi-btn-primary-shadow-active',
  '--boomi-btn-primary-shadow-hover',
  '--boomi-btn-secondary-bg',
  '--boomi-btn-secondary-bg-active',
  '--boomi-btn-secondary-bg-hover',
  '--boomi-btn-secondary-border',
  '--boomi-btn-secondary-border-active',
  '--boomi-btn-secondary-border-hover',
  '--boomi-btn-secondary-fg',
  '--boomi-btn-secondary-fg-active',
  '--boomi-btn-secondary-fg-hover',
  '--boomi-btn-secondary-shadow',
  '--boomi-btn-secondary-shadow-active',
  '--boomi-btn-secondary-shadow-hover',
  '--boomi-card-bg',
  '--boomi-card-border',
  '--boomi-card-fg',
  '--boomi-card-hover-scale',
  '--boomi-card-hover-shadow',
  '--boomi-card-radius',
  '--boomi-card-shadow',
  '--boomi-chip-bg',
  '--boomi-chip-border',
  '--boomi-chip-error-bg',
  '--boomi-chip-error-border',
  '--boomi-chip-error-fg',
  '--boomi-chip-fg',
  '--boomi-chip-pulse-color',
  '--boomi-chip-success-bg',
  '--boomi-chip-success-border',
  '--boomi-chip-success-fg',
  '--boomi-chip-warning-bg',
  '--boomi-chip-warning-border',
  '--boomi-chip-warning-fg',
  // Root / Page
  '--boomi-root-bg-color',
  '--boomi-root-fg-color',
  '--boomi-page-bg-color',
  '--boomi-page-fg-color',
  '--boomi-muted',
  // Header
  '--boomi-header-bg-color',
  '--boomi-header-fg-color',
  '--boomi-header-fg-hover',
  '--boomi-header-border-color',
  '--boomi-header-shadow',
  // Inputs
  '--boomi-input-bg',
  '--boomi-input-fg',
  '--boomi-input-placeholder',
  '--boomi-input-border',
  '--boomi-input-shadow',
  '--boomi-input-border-focus',
  '--boomi-input-shadow-focus',
  '--boomi-input-outline-focus',
  '--boomi-input-bg-disabled',
  '--boomi-input-fg-disabled',
  '--boomi-input-border-disabled',
  '--boomi-input-border-invalid',
  '--boomi-input-outline-invalid',
  // Tables
  '--boomi-table-header-bg',
  '--boomi-table-header-fg',
  '--boomi-table-header-border',
  '--boomi-table-row-odd-bg',
  '--boomi-table-row-even-bg',
  '--boomi-table-row-hover-shadow',
  // Menus
  '--boomi-menu-bg',
  '--boomi-menu-fg',
  '--boomi-menu-border',
  '--boomi-menu-shadow',
  '--boomi-menu-item-bg',
  '--boomi-menu-item-bg-hover',
  '--boomi-menu-item-fg',
  '--boomi-menu-item-fg-hover',
  '--boomi-menu-divider',
  '--boomi-menu-danger-fg',
  '--boomi-menu-danger-fg-hover',
  '--boomi-menu-danger-bg-hover',
  // Modal
  '--boomi-modal-overlay-bg',
  '--boomi-modal-bg',
  '--boomi-modal-fg',
  '--boomi-modal-border',
  '--boomi-modal-shadow',
  '--boomi-modal-close-fg',
  '--boomi-modal-close-hover-fg',
  // Forms
  '--boomi-form-label-fg',
  '--boomi-form-helper-fg',
  '--boomi-form-error-fg',
  '--boomi-form-required-fg',
  // Select / Options
  '--boomi-select-bg',
  '--boomi-select-fg',
  '--boomi-select-border',
  '--boomi-select-shadow',
  '--boomi-select-border-focus',
  '--boomi-select-shadow-focus',
  '--boomi-select-icon',
  '--boomi-options-bg',
  '--boomi-options-fg',
  '--boomi-options-border',
  '--boomi-options-shadow',
  '--boomi-options-search-bg',
  '--boomi-option-bg-active',
  '--boomi-option-fg-selected',
  // Loader
  '--boomi-loader-dot-bg',
  '--boomi-loader-dot-size',
  '--boomi-loader-dot1-opacity',
  '--boomi-loader-dot2-opacity',
  '--boomi-loader-dot3-opacity',
  '--boomi-loader-msg-fg',
  // Spinner
  '--boomi-spinner-overlay-bg',
  '--boomi-spinner-ring-color',
  '--boomi-spinner-ping-color',
  '--boomi-spinner-message-fg',
  '--boomi-spinner-size',
  '--boomi-spinner-border-width',
  // Wizard
  '--boomi-wizard-step-dot-bg',
  '--boomi-wizard-step-dot-fg',
  '--boomi-wizard-step-dot-border',
  '--boomi-wizard-step-dot-shadow',
  '--boomi-wizard-step-dot-bg-active',
  '--boomi-wizard-step-dot-fg-active',
  '--boomi-wizard-step-dot-border-active',
  '--boomi-wizard-step-dot-shadow-active',
  '--boomi-wizard-step-dot-bg-completed',
  '--boomi-wizard-step-dot-fg-completed',
  '--boomi-wizard-step-dot-border-completed',
  '--boomi-wizard-step-dot-shadow-completed',
  '--boomi-wizard-connector-bg',
  '--boomi-wizard-label-fg',
  '--boomi-wizard-card-bg',
  '--boomi-wizard-card-fg',
  '--boomi-wizard-card-border',
  '--boomi-wizard-card-shadow',
  '--boomi-wizard-link-fg',
  '--boomi-wizard-link-fg-hover',
  '--boomi-wizard-link-strong-fg',
  // Notices
  '--boomi-notice-warning-bg',
  '--boomi-notice-warning-fg',
  '--boomi-notice-warning-border',
  '--boomi-notice-success-bg',
  '--boomi-notice-success-fg',
  '--boomi-notice-success-border',
  '--boomi-notice-error-bg',
  '--boomi-notice-error-fg',
  '--boomi-notice-error-border',
  '--boomi-notice-shadow',
  '--boomi-notice-radius',
  // Update panel
  '--boomi-update-bg',
  '--boomi-update-fg',
  '--boomi-update-border',
  '--boomi-update-shadow',
  '--boomi-update-title-fg',
  '--boomi-update-desc-fg',
  '--boomi-update-radius',
  '--boomi-update-content',
  // Tabs (page)
  '--boomi-tablist-border',
  '--boomi-tab-bg',
  '--boomi-tab-fg',
  '--boomi-tab-border',
  '--boomi-tab-bg-hover',
  '--boomi-tab-bg-active',
  '--boomi-tab-fg-active',
  '--boomi-tab-border-active',
  // Maps
  '--boomi-map-line',
  '--boomi-map-line-width',
  '--boomi-map-line-filter',
  '--boomi-map-heading-fg',
  '--boomi-map-card-bg',
  '--boomi-map-card-border',
  '--boomi-map-card-shadow',
  '--boomi-map-card-shadow-hover',
  '--boomi-map-card-transform-hover',
  '--boomi-map-source-bg-mapped',
  '--boomi-map-source-border-mapped',
  '--boomi-map-source-outline',
  '--boomi-map-target-bg-mapped',
  '--boomi-map-target-border-mapped',
  '--boomi-map-target-outline',
  '--boomi-map-func-bg',
  '--boomi-map-func-fg',
  '--boomi-map-func-title-fg',
  '--boomi-map-pin-source-bg',
  '--boomi-map-pin-target-bg',
  '--boomi-map-pin-input-bg',
  '--boomi-map-pin-output-bg',
  '--boomi-map-pin-badge-bg',
  '--boomi-map-pin-badge-fg',
  '--boomi-map-pin-danger-bg',
  '--boomi-map-pulse-color',
  '--boomi-map-pin-pulse',
  '--boomi-map-add-bg',
  '--boomi-map-add-fg',
  '--boomi-map-add-border',
  '--boomi-map-add-shadow',
  '--boomi-map-add-bg-hover',
  // Schedule
  '--boomi-sched-card-bg',
  '--boomi-sched-card-fg',
  '--boomi-sched-card-border',
  '--boomi-sched-card-shadow',
  '--boomi-sched-card-shadow-hover',
  '--boomi-sched-card-radius',
  '--boomi-sched-header-bg',
  '--boomi-sched-header-fg',
  '--boomi-sched-header-border',
  '--boomi-sched-header-shadow',
  '--boomi-sched-toggle-fg',
  '--boomi-sched-toggle-fg-hover',
  '--boomi-sched-row-bg',
  '--boomi-sched-row-border',
  '--boomi-sched-row-shadow',
  '--boomi-sched-row-hover-shadow',
  '--boomi-sched-label-fg',
  '--boomi-sched-helper-fg',
  '--boomi-sched-error-fg',
  '--boomi-sched-select-bg',
  '--boomi-sched-select-fg',
  '--boomi-sched-select-border',
  '--boomi-sched-select-shadow',
  '--boomi-sched-select-border-focus',
  '--boomi-sched-select-shadow-focus',
  '--boomi-sched-input-bg',
  '--boomi-sched-input-fg',
  '--boomi-sched-input-border',
  '--boomi-sched-input-shadow',
  '--boomi-sched-input-border-focus',
  '--boomi-sched-input-shadow-focus',
  '--boomi-sched-checkbox-border',
  '--boomi-sched-checkbox-bg',
  '--boomi-sched-checkbox-bg-checked',
  '--boomi-sched-checkbox-symbol',
  '--boomi-sched-action-bg',
  '--boomi-sched-action-fg',
  '--boomi-sched-action-border',
  '--boomi-sched-action-shadow',
  '--boomi-sched-action-bg-hover',
  // Connector
  '--boomi-conn-bg',
  '--boomi-conn-border',
  '--boomi-conn-card-shadow',
  '--boomi-conn-heading-fg',
  '--boomi-conn-field-bg',
  '--boomi-conn-field-border',
  '--boomi-conn-field-label-fg',
  '--boomi-conn-field-error-fg',
  '--boomi-conn-btn-save-bg',
  '--boomi-conn-btn-save-fg',
  '--boomi-conn-btn-auth-bg',
  '--boomi-conn-btn-auth-fg',
  '--boomi-conn-btn-disabled-bg',
  '--boomi-conn-btn-disabled-fg',
  // SweetAlert
  '--boomi-swal-bg',
  '--boomi-swal-fg',
  '--boomi-swal-border',
  '--boomi-swal-shadow',
  '--boomi-swal-title-fg',
  '--boomi-swal-desc-fg',
  '--boomi-swal-icon-success',
  '--boomi-swal-icon-warning',
  '--boomi-swal-icon-error',
  '--boomi-swal-overlay-bg',
];

const buildDefaults = (): BuilderState => ({
  themeSelection: 'boomi',
  themeDefault: 'boomi',
  themeCustomName: '',
  themeCustomVars: [],
  launcherCorner: 'bottom-right',
  launcherOffsetX: '20',
  launcherOffsetY: '40',
  launcherShape: 'pill',
  launcherLabel: 'Find an Agent',
  launcherIcon: '🤖',
  launcherHideIcon: false,
  listModalWidth: '500',
  listModalHeight: '600',
  listModalCorner: 'bottom-right',
  listModalOffsetX: '20',
  listModalOffsetY: '100',
  listWelcomeTitle: 'Agents',
  listWelcomeSubtitle: 'Search for an agent and click to launch.',
  listHeaderShow: true,
  listHeaderTitle: 'Agents',
  listHeaderDescription: 'Select an agent to launch.',
  listSearchShow: true,
  tilesHeaderShow: true,
  tilesHeaderTitle: 'Agents',
  tilesHeaderDescription: 'Browse and launch an agent.',
  tilesSearchShow: true,
  tilesViewToggleShow: true,
  agentUiMode: 'modal',
  agentModalWidth: '600',
  agentModalHeight: '800',
  agentModalCorner: 'top-right',
  agentModalOffsetX: '20',
  agentModalOffsetY: '40',
  agentSidebarShow: true,
  agentSidebarWidth: '280',
  agentWelcomeTitle: "Let's Talk",
  agentWelcomeSubtitle: 'Ask me about your Boomi deployment.',
  agentOverrides: {},
  agentAllowFreeText: true,
  agentFileAttachmentSupported: false,
  agentFileAttachmentRequired: false,
  agentAllowedFileExtensions: '',
  agentMaxFiles: '',
  agentMaxTotalBytes: '',
  agentPrompts: [],
  agentPromptsAlign: 'center',
  agentPromptsLocation: 'input',
  agentSessionScope: 'multi',
  agentTransport: 'boomi-direct',
  agentExpandable: false,
  agentEnvironmentId: '',
});

const toNumberOrString = (val: string): number | string | undefined => {
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isNaN(num) ? trimmed : num;
};

const deriveBuilderFromConfig = (
  configRaw: string,
  fallback: BuilderState,
  embedType: EmbedType,
  agentIds: string[]
): BuilderState => {
  const next = { ...fallback };
  next.themeCustomVars = [];
  next.agentPrompts = [];
  if (!configRaw.trim()) return next;
  try {
    const parsed = JSON.parse(configRaw) as any;
    if (parsed?.theme) {
      if (typeof parsed.theme.defaultTheme === 'string') {
        const theme = parsed.theme.defaultTheme;
        if (theme === 'boomi' || theme === 'base') {
          next.themeSelection = theme;
          next.themeDefault = theme;
          next.themeCustomName = '';
        } else {
          next.themeSelection = 'custom';
          next.themeDefault = theme;
          next.themeCustomName = theme;
        }
        const cssVarsByTheme = parsed?.cssVarsByTheme;
        let themeVars = cssVarsByTheme?.[theme];
        let varThemeKey = theme;
        if ((!themeVars || typeof themeVars !== 'object') && cssVarsByTheme && typeof cssVarsByTheme === 'object') {
          const firstKey = Object.keys(cssVarsByTheme)[0];
          if (firstKey) {
            themeVars = cssVarsByTheme[firstKey];
            varThemeKey = firstKey;
            if (varThemeKey !== 'boomi' && varThemeKey !== 'base') {
              next.themeSelection = 'custom';
              next.themeCustomName = varThemeKey;
              next.themeDefault = varThemeKey;
            }
          }
        }
        if (themeVars && typeof themeVars === 'object') {
          next.themeCustomVars = Object.entries(themeVars).map(([key, value]) => ({
            id: `var_${key}`,
            varName: key,
            value: typeof value === 'string' ? value : String(value),
          }));
        }
      }
    }

    const agentList = parsed?.components?.agentList;
    const agentTiles = parsed?.components?.agentTiles;

    if (embedType === 'list' && agentList) {
      const launcher = agentList.launcher ?? {};
      const launcherPos = launcher.position ?? {};
      if (cornerOptions.includes(launcherPos.corner)) next.launcherCorner = launcherPos.corner;
      if (launcherPos.offsetX !== undefined) next.launcherOffsetX = String(launcherPos.offsetX);
      if (launcherPos.offsetY !== undefined) next.launcherOffsetY = String(launcherPos.offsetY);
      if (launcher.shape === 'pill' || launcher.shape === 'circle') next.launcherShape = launcher.shape;
      if (typeof launcher.label === 'string') next.launcherLabel = launcher.label;
      if (typeof launcher.icon === 'string') next.launcherIcon = launcher.icon;
      if (typeof launcher.hideIcon === 'boolean') next.launcherHideIcon = launcher.hideIcon;

      const modal = agentList.modal ?? {};
      if (modal.width !== undefined) next.listModalWidth = String(modal.width);
      if (modal.height !== undefined) next.listModalHeight = String(modal.height);
      const modalPos = modal.position ?? {};
      if (cornerOptions.includes(modalPos.corner)) next.listModalCorner = modalPos.corner;
      if (modalPos.offsetX !== undefined) next.listModalOffsetX = String(modalPos.offsetX);
      if (modalPos.offsetY !== undefined) next.listModalOffsetY = String(modalPos.offsetY);

      if (agentList.welcome?.title) next.listWelcomeTitle = agentList.welcome.title;
      if (agentList.welcome?.subtitle) next.listWelcomeSubtitle = agentList.welcome.subtitle;

      if (agentList.header?.show !== undefined) next.listHeaderShow = !!agentList.header.show;
      if (agentList.header?.title) next.listHeaderTitle = agentList.header.title;
      if (agentList.header?.description) next.listHeaderDescription = agentList.header.description;
      if (agentList.search?.show !== undefined) next.listSearchShow = !!agentList.search.show;
    }

    if (embedType === 'tiles' && agentTiles) {
      if (agentTiles.header?.show !== undefined) next.tilesHeaderShow = !!agentTiles.header.show;
      if (agentTiles.header?.title) next.tilesHeaderTitle = agentTiles.header.title;
      if (agentTiles.header?.description) next.tilesHeaderDescription = agentTiles.header.description;
      if (agentTiles.search?.show !== undefined) next.tilesSearchShow = !!agentTiles.search.show;
      if (agentTiles.viewToggle?.show !== undefined) next.tilesViewToggleShow = !!agentTiles.viewToggle.show;
    }

    const agents = parsed?.agents ?? {};
    const firstAgentId = agentIds.find((id) => agents[id]) ?? Object.keys(agents)[0];
    const agentCfg = firstAgentId ? agents[firstAgentId] : null;
    if (agentCfg?.position && typeof agentCfg.position === 'object' && 'corner' in agentCfg.position) {
      if (cornerOptions.includes(agentCfg.position.corner)) next.launcherCorner = agentCfg.position.corner;
      if (agentCfg.position.offsetX !== undefined) next.launcherOffsetX = String(agentCfg.position.offsetX);
      if (agentCfg.position.offsetY !== undefined) next.launcherOffsetY = String(agentCfg.position.offsetY);
    }
    if (agentCfg?.shape === 'pill' || agentCfg?.shape === 'circle') next.launcherShape = agentCfg.shape;
    if (typeof agentCfg?.label === 'string') next.launcherLabel = agentCfg.label;
    if (typeof agentCfg?.icon === 'string') next.launcherIcon = agentCfg.icon;
    if (typeof agentCfg?.hideIcon === 'boolean') next.launcherHideIcon = agentCfg.hideIcon;
    if (typeof agentCfg?.expandable === 'boolean') next.agentExpandable = agentCfg.expandable;
    if (typeof agentCfg?.environmentId === 'string') next.agentEnvironmentId = agentCfg.environmentId;
    if (agentCfg?.transport === 'boomi-direct' || agentCfg?.transport === 'boomi-proxy') {
      next.agentTransport = agentCfg.transport;
    } else if (parsed?.transport === 'boomi-direct' || parsed?.transport === 'boomi-proxy') {
      next.agentTransport = parsed.transport;
    }

    const ui = agentCfg?.ui ?? {};
    if (ui.mode === 'modal' || ui.mode === 'full' || ui.mode === 'page') next.agentUiMode = ui.mode;
    if (ui.sessionScope === 'mount' || ui.sessionScope === 'multi') next.agentSessionScope = ui.sessionScope;
    if (ui.modal?.width !== undefined) next.agentModalWidth = String(ui.modal.width);
    if (ui.modal?.height !== undefined) next.agentModalHeight = String(ui.modal.height);
    if (ui.modal?.position?.corner && cornerOptions.includes(ui.modal.position.corner)) {
      next.agentModalCorner = ui.modal.position.corner;
    }
    if (ui.modal?.position?.offsetX !== undefined) next.agentModalOffsetX = String(ui.modal.position.offsetX);
    if (ui.modal?.position?.offsetY !== undefined) next.agentModalOffsetY = String(ui.modal.position.offsetY);
    const sidebarShowFromScope = ui.sessionScope === 'mount' ? false : ui.sessionScope === 'multi' ? true : undefined;
    const sidebarShowExplicit = ui.sidebar?.show !== undefined ? !!ui.sidebar.show : undefined;
    const sidebarShow = sidebarShowExplicit ?? sidebarShowFromScope;
    if (sidebarShow !== undefined) next.agentSidebarShow = sidebarShow;
    if (ui.sidebar?.width !== undefined) next.agentSidebarWidth = String(ui.sidebar.width);
    if (ui.welcome?.title) next.agentWelcomeTitle = ui.welcome.title;
    if (ui.welcome?.subtitle) next.agentWelcomeSubtitle = ui.welcome.subtitle;
    if (typeof ui.allowFreeTextPrompt === 'boolean') next.agentAllowFreeText = ui.allowFreeTextPrompt;
    if (typeof ui.fileAttachmentSupported === 'boolean') next.agentFileAttachmentSupported = ui.fileAttachmentSupported;
    if (typeof ui.fileAttachmentRequired === 'boolean') next.agentFileAttachmentRequired = ui.fileAttachmentRequired;
    if (ui.allowedFileExtensions !== undefined) {
      next.agentAllowedFileExtensions = Array.isArray(ui.allowedFileExtensions)
        ? ui.allowedFileExtensions.join(', ')
        : String(ui.allowedFileExtensions);
    }
    if (ui.maxFiles !== undefined) next.agentMaxFiles = String(ui.maxFiles);
    if (ui.maxTotalBytes !== undefined) next.agentMaxTotalBytes = String(ui.maxTotalBytes);
    if (Array.isArray(ui.prompts)) {
      next.agentPrompts = ui.prompts.map((p: any, idx: number) => ({
        id: `prompt_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        title: typeof p.title === 'string' ? p.title : '',
        prompt: typeof p.prompt === 'string' ? p.prompt : '',
      }));
    }
    if (ui.promptsAlign === 'left' || ui.promptsAlign === 'center' || ui.promptsAlign === 'right') {
      next.agentPromptsAlign = ui.promptsAlign;
    }
    if (ui.promptsLocation === 'input' || ui.promptsLocation === 'welcome') {
      next.agentPromptsLocation = ui.promptsLocation;
    }

    if (embedType === 'list' || embedType === 'tiles') {
      const overrides: Record<string, AgentOverride> = {};
      for (const id of agentIds) {
        const cfg = agents[id];
        if (!cfg) continue;
        overrides[id] = {
          label: typeof cfg.label === 'string' ? cfg.label : '',
          description:
            typeof cfg.ui?.pageDescription === 'string'
              ? cfg.ui.pageDescription
              : typeof cfg.ui?.welcome?.subtitle === 'string'
                ? cfg.ui.welcome.subtitle
                : '',
          icon: typeof cfg.icon === 'string' ? cfg.icon : '🤖',
          hideIcon: typeof cfg.hideIcon === 'boolean' ? cfg.hideIcon : false,
          buttonLabel: typeof cfg.buttonLabel === 'string' ? cfg.buttonLabel : 'Launch',
        };
      }
      next.agentOverrides = overrides;
    }
  } catch {
    return next;
  }
  return next;
};

const buildConfigFromBuilder = (
  builder: BuilderState,
  embedType: EmbedType,
  agentIds: string[]
) => {
  const resolvedTheme =
    builder.themeSelection === 'custom'
      ? (builder.themeCustomName.trim() || builder.themeDefault || 'custom')
      : builder.themeSelection;
  const config: Record<string, any> = {
    transport: builder.agentTransport,
    theme: {
      allowThemes: true,
      defaultTheme: resolvedTheme,
    },
  };
  const vars: Record<string, string> = {};
  for (const row of builder.themeCustomVars) {
    if (row.varName && row.value) {
      vars[row.varName] = row.value;
    }
  }
  if (Object.keys(vars).length) {
    config.cssVarsByTheme = {
      [resolvedTheme]: vars,
    };
  }

  if (embedType === 'list') {
    const agentListCfg: Record<string, any> = {
      ...(builder.agentUiMode === 'page' && { mode: 'page' }),
      ...(builder.agentUiMode !== 'page' && {
        launcher: {
          position: {
            corner: builder.launcherCorner,
            offsetX: toNumberOrString(builder.launcherOffsetX),
            offsetY: toNumberOrString(builder.launcherOffsetY),
          },
          shape: builder.launcherShape,
          label: builder.launcherLabel,
          icon: builder.launcherIcon,
          hideIcon: builder.launcherHideIcon,
        },
      }),
      modal: {
        width: toNumberOrString(builder.listModalWidth),
        height: toNumberOrString(builder.listModalHeight),
        position: {
          corner: builder.listModalCorner,
          offsetX: toNumberOrString(builder.listModalOffsetX),
          offsetY: toNumberOrString(builder.listModalOffsetY),
        },
      },
      welcome: {
        title: builder.listWelcomeTitle,
        subtitle: builder.listWelcomeSubtitle,
      },
      header: {
        show: builder.listHeaderShow,
        title: builder.listHeaderTitle,
        description: builder.listHeaderDescription,
      },
      search: {
        show: builder.listSearchShow,
      },
    };
    config.components = { agentList: agentListCfg };
  }

  if (embedType === 'tiles') {
    config.components = {
      agentTiles: {
        header: {
          show: builder.tilesHeaderShow,
          title: builder.tilesHeaderTitle,
          description: builder.tilesHeaderDescription,
        },
        search: {
          show: builder.tilesSearchShow,
        },
        viewToggle: {
          show: builder.tilesViewToggleShow,
        },
      },
    };
  }

  const promptsOutput = builder.agentPrompts
    .filter((p) => p.title || p.prompt)
    .map(({ title, prompt }) => ({ title, prompt }));

  const allowedExtensions = builder.agentAllowedFileExtensions
    ? builder.agentAllowedFileExtensions.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  const ids = agentIds.length ? agentIds : ['agent-id'];
  config.agents = ids.reduce<Record<string, any>>((acc, id) => {
    const override = (embedType === 'list' || embedType === 'tiles') ? (builder.agentOverrides[id] ?? defaultAgentOverride()) : undefined;
    const entry: Record<string, any> = { transport: builder.agentTransport };

    if (builder.agentExpandable) entry.expandable = true;
    if (builder.agentEnvironmentId.trim()) entry.environmentId = builder.agentEnvironmentId.trim();

    if (embedType === 'single' && builder.agentUiMode !== 'page') {
      entry.position = {
        corner: builder.launcherCorner,
        offsetX: toNumberOrString(builder.launcherOffsetX),
        offsetY: toNumberOrString(builder.launcherOffsetY),
      };
      entry.shape = builder.launcherShape;
      entry.label = builder.launcherLabel;
      entry.icon = builder.launcherIcon;
      entry.hideIcon = builder.launcherHideIcon;
    } else if (override) {
      if (override.label) entry.label = override.label;
      entry.icon = override.icon;
      entry.hideIcon = override.hideIcon;
      if (override.buttonLabel && override.buttonLabel !== 'Launch') entry.buttonLabel = override.buttonLabel;
    }

    entry.ui = {
      mode: builder.agentUiMode,
      sessionScope: builder.agentSessionScope,
      modal: {
        width: toNumberOrString(builder.agentModalWidth),
        height: toNumberOrString(builder.agentModalHeight),
        position: {
          corner: builder.agentModalCorner,
          offsetX: toNumberOrString(builder.agentModalOffsetX),
          offsetY: toNumberOrString(builder.agentModalOffsetY),
        },
      },
      sidebar: {
        show: builder.agentSidebarShow,
        width: toNumberOrString(builder.agentSidebarWidth),
      },
      welcome: {
        title: builder.agentWelcomeTitle,
        subtitle: builder.agentWelcomeSubtitle,
      },
      allowFreeTextPrompt: builder.agentAllowFreeText,
      ...(override?.description ? { pageDescription: override.description } : {}),
      ...(builder.agentFileAttachmentSupported ? { fileAttachmentSupported: true } : {}),
      ...(builder.agentFileAttachmentSupported && builder.agentFileAttachmentRequired ? { fileAttachmentRequired: true } : {}),
      ...(allowedExtensions?.length ? { allowedFileExtensions: allowedExtensions } : {}),
      ...(builder.agentMaxFiles ? { maxFiles: Number(builder.agentMaxFiles) } : {}),
      ...(builder.agentMaxTotalBytes ? { maxTotalBytes: Number(builder.agentMaxTotalBytes) } : {}),
      ...(promptsOutput.length ? { prompts: promptsOutput } : {}),
      ...(promptsOutput.length && builder.agentPromptsAlign !== 'center' ? { promptsAlign: builder.agentPromptsAlign } : {}),
      ...(promptsOutput.length && builder.agentPromptsLocation !== 'input' ? { promptsLocation: builder.agentPromptsLocation } : {}),
    };

    acc[id] = entry;
    return acc;
  }, {});

  config.project = {
    embedType,
    agentIds: ids,
  };

  return config as Record<string, unknown>;
};

const TABS = ['Layout', 'Content', 'Chat', 'Theme', 'Advanced'] as const;
type Tab = typeof TABS[number];

const ConfigBuilderForm = forwardRef<ConfigBuilderFormHandle, ConfigBuilderFormProps>(({
  embedType,
  agentIds,
  configRaw,
  onChangeConfig,
  onUpdateBuilder,
  syncFromConfig = false,
  availableAgents,
}, ref) => {
  const defaults = useMemo(buildDefaults, []);
  const [builder, setBuilder] = useState<BuilderState>(defaults);
  const [activeTab, setActiveTab] = useState<Tab>('Layout');
  const hasSyncedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    getConfig: () => buildConfigFromBuilder(builder, embedType, agentIds),
  }), [builder, embedType, agentIds]);

  useEffect(() => {
    if (syncFromConfig || !hasSyncedRef.current) {
      setBuilder(deriveBuilderFromConfig(configRaw, defaults, embedType, agentIds));
      hasSyncedRef.current = true;
    }
  }, [configRaw, defaults, embedType, agentIds, syncFromConfig]);

  useEffect(() => {
    onUpdateBuilder?.(builder);
  }, [builder, onUpdateBuilder]);

  useEffect(() => {
    const config = buildConfigFromBuilder(builder, embedType, agentIds);
    onChangeConfig(config);
  }, [builder, embedType, agentIds, onChangeConfig]);

  const set = <K extends keyof BuilderState>(key: K, val: BuilderState[K]) =>
    setBuilder((prev) => ({ ...prev, [key]: val }));

  const addCustomVarRow = () => {
    const defaultVar = cssVarOptions[0] ?? '--boomi-root-bg-color';
    setBuilder((prev) => ({
      ...prev,
      themeCustomVars: [
        ...prev.themeCustomVars,
        { id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, varName: defaultVar, value: '' },
      ],
    }));
  };

  const updateCustomVarRow = (id: string, patch: Partial<{ varName: string; value: string }>) => {
    setBuilder((prev) => ({
      ...prev,
      themeCustomVars: prev.themeCustomVars.map((row) => row.id === id ? { ...row, ...patch } : row),
    }));
  };

  const removeCustomVarRow = (id: string) => {
    setBuilder((prev) => ({ ...prev, themeCustomVars: prev.themeCustomVars.filter((row) => row.id !== id) }));
  };

  const addPromptRow = () => {
    setBuilder((prev) => ({
      ...prev,
      agentPrompts: [
        ...prev.agentPrompts,
        { id: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title: '', prompt: '' },
      ],
    }));
  };

  const updatePromptRow = (id: string, patch: Partial<{ title: string; prompt: string }>) => {
    setBuilder((prev) => ({
      ...prev,
      agentPrompts: prev.agentPrompts.map((row) => row.id === id ? { ...row, ...patch } : row),
    }));
  };

  const removePromptRow = (id: string) => {
    setBuilder((prev) => ({ ...prev, agentPrompts: prev.agentPrompts.filter((row) => row.id !== id) }));
  };

  return (
    <div className="boomi-card p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold">Config Builder</div>
        <div className="text-xs opacity-70">Updates the JSON configuration automatically as you make changes.</div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--boomi-card-border)]">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'border-b-2 border-[var(--boomi-btn-primary-bg)] text-[var(--boomi-btn-primary-bg)] -mb-px'
                : 'opacity-60 hover:opacity-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab panels — all rendered simultaneously in the same grid cell so the
          container stays the height of the tallest panel as tabs switch. */}
      <div className="grid">

      {/* ── Layout tab ── */}
      <div style={{ gridArea: '1/1', visibility: activeTab === 'Layout' ? 'visible' : 'hidden' }}>
      {(
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Agent UI */}
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Agent UI</div>
              <label className="boomi-form-label">
                Mode
                <select
                  className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                  value={builder.agentUiMode}
                  onChange={(e) => set('agentUiMode', e.target.value as 'modal' | 'full' | 'page')}
                >
                  <option value="modal">Modal — opens in a floating dialog</option>
                  <option value="full">Full — opens as a full-screen overlay</option>
                  <option value="page">Page — renders inline in the container (no launcher)</option>
                </select>
              </label>
              {builder.agentUiMode === 'modal' && (
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="boomi-form-label">
                    Modal width
                    <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.agentModalWidth} onChange={(e) => set('agentModalWidth', e.target.value)} />
                  </label>
                  <label className="boomi-form-label">
                    Modal height
                    <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.agentModalHeight} onChange={(e) => set('agentModalHeight', e.target.value)} />
                  </label>
                  <label className="boomi-form-label">
                    Modal corner
                    <select className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.agentModalCorner} onChange={(e) => set('agentModalCorner', e.target.value as AgentCorner)}>
                      {cornerOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="boomi-form-label">
                      Offset X
                      <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.agentModalOffsetX} onChange={(e) => set('agentModalOffsetX', e.target.value)} />
                    </label>
                    <label className="boomi-form-label">
                      Offset Y
                      <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.agentModalOffsetY} onChange={(e) => set('agentModalOffsetY', e.target.value)} />
                    </label>
                  </div>
                </div>
              )}
              <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
                <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={builder.agentSidebarShow} onChange={(e) => set('agentSidebarShow', e.target.checked)} />
                Show sidebar
              </label>
              {builder.agentSidebarShow && (
                <label className="boomi-form-label">
                  Sidebar width
                  <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.agentSidebarWidth} onChange={(e) => set('agentSidebarWidth', e.target.value)} />
                </label>
              )}
            </div>

            {/* Launcher — single & list only; hidden in page mode (no launcher button) */}
            {(embedType === 'list' || embedType === 'single') && builder.agentUiMode !== 'page' && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Launcher</div>
                <label className="boomi-form-label">
                  Corner
                  <select className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.launcherCorner} onChange={(e) => set('launcherCorner', e.target.value as AgentCorner)}>
                    {cornerOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="boomi-form-label">
                    Offset X
                    <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.launcherOffsetX} onChange={(e) => set('launcherOffsetX', e.target.value)} />
                  </label>
                  <label className="boomi-form-label">
                    Offset Y
                    <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.launcherOffsetY} onChange={(e) => set('launcherOffsetY', e.target.value)} />
                  </label>
                </div>
                <label className="boomi-form-label">
                  Shape
                  <select className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.launcherShape} onChange={(e) => set('launcherShape', e.target.value as 'pill' | 'circle')}>
                    <option value="pill">Pill</option>
                    <option value="circle">Circle</option>
                  </select>
                </label>
                <label className="boomi-form-label">
                  Label
                  <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.launcherLabel} onChange={(e) => set('launcherLabel', e.target.value)} />
                </label>
                <label className="boomi-form-label">
                  Icon
                  <select
                    className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                    value={iconOptions.some((o) => o.value === builder.launcherIcon) ? builder.launcherIcon : '__custom__'}
                    onChange={(e) => set('launcherIcon', e.target.value === '__custom__' ? builder.launcherIcon : e.target.value)}
                  >
                    {!iconOptions.some((o) => o.value === builder.launcherIcon) && (
                      <option value="__custom__">{builder.launcherIcon} (custom)</option>
                    )}
                    {iconOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
                  <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={builder.launcherHideIcon} onChange={(e) => set('launcherHideIcon', e.target.checked)} />
                  Hide icon
                </label>
              </div>
            )}
          </div>

          {/* List modal sizing */}
          {embedType === 'list' && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70">List Modal</div>
              <div className="grid gap-2 md:grid-cols-4">
                <label className="boomi-form-label">
                  Width
                  <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.listModalWidth} onChange={(e) => set('listModalWidth', e.target.value)} />
                </label>
                <label className="boomi-form-label">
                  Height
                  <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.listModalHeight} onChange={(e) => set('listModalHeight', e.target.value)} />
                </label>
                <label className="boomi-form-label">
                  Corner
                  <select className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.listModalCorner} onChange={(e) => set('listModalCorner', e.target.value as AgentCorner)}>
                    {cornerOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="boomi-form-label">
                    Offset X
                    <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.listModalOffsetX} onChange={(e) => set('listModalOffsetX', e.target.value)} />
                  </label>
                  <label className="boomi-form-label">
                    Offset Y
                    <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.listModalOffsetY} onChange={(e) => set('listModalOffsetY', e.target.value)} />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      </div>

      {/* ── Content tab ── */}
      <div style={{ gridArea: '1/1', visibility: activeTab === 'Content' ? 'visible' : 'hidden' }}>
      {(
        <div className="space-y-4">
          {/* Welcome */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Welcome Screen</div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="boomi-form-label">
                Welcome title
                <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.agentWelcomeTitle} onChange={(e) => set('agentWelcomeTitle', e.target.value)} />
              </label>
              <label className="boomi-form-label">
                Welcome subtitle
                <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.agentWelcomeSubtitle} onChange={(e) => set('agentWelcomeSubtitle', e.target.value)} />
              </label>
            </div>
          </div>

          {/* List header/search */}
          {embedType === 'list' && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70">List Header & Search</div>
              <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
                <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={builder.listHeaderShow} onChange={(e) => set('listHeaderShow', e.target.checked)} />
                Show header
              </label>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="boomi-form-label">
                  Header title
                  <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.listHeaderTitle} onChange={(e) => set('listHeaderTitle', e.target.value)} />
                </label>
                <label className="boomi-form-label">
                  Header description
                  <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.listHeaderDescription} onChange={(e) => set('listHeaderDescription', e.target.value)} />
                </label>
              </div>
              <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
                <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={builder.listSearchShow} onChange={(e) => set('listSearchShow', e.target.checked)} />
                Show search
              </label>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="boomi-form-label">
                  List welcome title
                  <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.listWelcomeTitle} onChange={(e) => set('listWelcomeTitle', e.target.value)} />
                </label>
                <label className="boomi-form-label">
                  List welcome subtitle
                  <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.listWelcomeSubtitle} onChange={(e) => set('listWelcomeSubtitle', e.target.value)} />
                </label>
              </div>
            </div>
          )}

          {/* Tiles header/search */}
          {embedType === 'tiles' && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Tiles Header & Search</div>
              <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
                <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={builder.tilesHeaderShow} onChange={(e) => set('tilesHeaderShow', e.target.checked)} />
                Show header
              </label>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="boomi-form-label">
                  Header title
                  <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.tilesHeaderTitle} onChange={(e) => set('tilesHeaderTitle', e.target.value)} />
                </label>
                <label className="boomi-form-label">
                  Header description
                  <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={builder.tilesHeaderDescription} onChange={(e) => set('tilesHeaderDescription', e.target.value)} />
                </label>
              </div>
              <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
                <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={builder.tilesSearchShow} onChange={(e) => set('tilesSearchShow', e.target.checked)} />
                Show search
              </label>
              <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
                <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={builder.tilesViewToggleShow} onChange={(e) => set('tilesViewToggleShow', e.target.checked)} />
                Show tiles/table toggle
              </label>
            </div>
          )}

          {/* Agent cards (multi) */}
          {(embedType === 'list' || embedType === 'tiles') && agentIds.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Agent Cards</div>
              <div className="text-xs opacity-70">Configure how each agent appears in the {embedType} view.</div>
              <div className="space-y-3">
                {agentIds.map((id) => {
                  const override = builder.agentOverrides[id] ?? defaultAgentOverride();
                  const updateOverride = (patch: Partial<AgentOverride>) =>
                    setBuilder((prev) => ({
                      ...prev,
                      agentOverrides: { ...prev.agentOverrides, [id]: { ...(prev.agentOverrides[id] ?? defaultAgentOverride()), ...patch } },
                    }));
                  return (
                    <div key={id} className="boomi-card p-3 space-y-3">
                      <div className="space-y-0.5">
                        <div className="text-sm font-semibold">{availableAgents?.find((a) => a.id === id)?.label ?? id}</div>
                        <div className="text-xs font-mono opacity-50">{id}</div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="boomi-form-label">
                          Card title
                          <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={override.label} placeholder="Agent name" onChange={(e) => updateOverride({ label: e.target.value })} />
                        </label>
                        <label className="boomi-form-label">
                          Card description
                          <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={override.description} placeholder="Brief description" onChange={(e) => updateOverride({ description: e.target.value })} />
                        </label>
                        <label className="boomi-form-label">
                          Icon
                          <select
                            className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                            value={iconOptions.some((o) => o.value === override.icon) ? override.icon : '__custom__'}
                            onChange={(e) => updateOverride({ icon: e.target.value === '__custom__' ? override.icon : e.target.value })}
                          >
                            {!iconOptions.some((o) => o.value === override.icon) && (
                              <option value="__custom__">{override.icon} (custom)</option>
                            )}
                            {iconOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </label>
                        <label className="boomi-form-label">
                          Button label
                          <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={override.buttonLabel} placeholder="Launch" onChange={(e) => updateOverride({ buttonLabel: e.target.value })} />
                        </label>
                      </div>
                      <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
                        <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={override.hideIcon} onChange={(e) => updateOverride({ hideIcon: e.target.checked })} />
                        Hide icon
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      </div>

      {/* ── Chat tab ── */}
      <div style={{ gridArea: '1/1', visibility: activeTab === 'Chat' ? 'visible' : 'hidden' }}>
      {(
        <div className="space-y-4">
          {/* Input */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Input</div>
            <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
              <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={builder.agentAllowFreeText} onChange={(e) => set('agentAllowFreeText', e.target.checked)} />
              Allow free text prompts
            </label>
          </div>

          {/* File attachments */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">File Attachments</div>
            <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
              <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={builder.agentFileAttachmentSupported} onChange={(e) => set('agentFileAttachmentSupported', e.target.checked)} />
              Enable file attachments
            </label>
            {builder.agentFileAttachmentSupported && (
              <div className="space-y-3 pl-1">
                <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
                  <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={builder.agentFileAttachmentRequired} onChange={(e) => set('agentFileAttachmentRequired', e.target.checked)} />
                  Require file attachment
                </label>
                <label className="boomi-form-label">
                  Allowed extensions
                  <input
                    className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                    value={builder.agentAllowedFileExtensions}
                    placeholder=".pdf, .csv, .txt"
                    onChange={(e) => set('agentAllowedFileExtensions', e.target.value)}
                  />
                  <span className="text-xs opacity-60 mt-0.5 block">Comma-separated. Leave blank to allow all.</span>
                </label>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="boomi-form-label">
                    Max files
                    <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" type="number" min="1" value={builder.agentMaxFiles} placeholder="e.g. 5" onChange={(e) => set('agentMaxFiles', e.target.value)} />
                  </label>
                  <label className="boomi-form-label">
                    Max total size (bytes)
                    <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" type="number" min="0" value={builder.agentMaxTotalBytes} placeholder="e.g. 10485760" onChange={(e) => set('agentMaxTotalBytes', e.target.value)} />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Suggested prompts */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Suggested Prompts</div>
            <div className="text-xs opacity-70">Preset prompt cards users can click to send a message.</div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="boomi-form-label">
                Alignment
                <select
                  className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                  value={builder.agentPromptsAlign}
                  onChange={(e) => set('agentPromptsAlign', e.target.value as 'left' | 'center' | 'right')}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="boomi-form-label">
                Location
                <select
                  className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                  value={builder.agentPromptsLocation}
                  onChange={(e) => set('agentPromptsLocation', e.target.value as 'input' | 'welcome')}
                >
                  <option value="input">Below input</option>
                  <option value="welcome">Below title / description</option>
                </select>
              </label>
            </div>
            {builder.agentPrompts.length === 0 && (
              <div className="text-xs opacity-50">No prompts configured.</div>
            )}
            <div className="space-y-2">
              {builder.agentPrompts.map((row) => (
                <div key={row.id} className="boomi-card p-3 space-y-2">
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="boomi-form-label">
                      Title
                      <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={row.title} placeholder="Button label" onChange={(e) => updatePromptRow(row.id, { title: e.target.value })} />
                    </label>
                    <label className="boomi-form-label">
                      Prompt text
                      <input className="boomi-input mt-1 w-full rounded-md p-2 text-sm" value={row.prompt} placeholder="What gets sent to the agent" onChange={(e) => updatePromptRow(row.id, { prompt: e.target.value })} />
                    </label>
                  </div>
                  <button type="button" className="text-xs text-red-500" onClick={() => removePromptRow(row.id)}>Remove</button>
                </div>
              ))}
            </div>
            <button type="button" className="boomi-btn-primary px-3 py-2 text-xs" onClick={addPromptRow}>
              Add Prompt
            </button>
          </div>
        </div>
      )}

      </div>

      {/* ── Theme tab ── */}
      <div style={{ gridArea: '1/1', visibility: activeTab === 'Theme' ? 'visible' : 'hidden' }}>
      {(
        <div className="space-y-3">
          <label className="boomi-form-label">
            Theme
            <select
              className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
              value={builder.themeSelection}
              onChange={(e) =>
                setBuilder((prev) => ({
                  ...prev,
                  themeSelection: e.target.value as 'boomi' | 'base' | 'custom',
                  themeDefault: e.target.value === 'custom' ? prev.themeDefault : e.target.value as 'boomi' | 'base',
                }))
              }
            >
              <option value="boomi">boomi</option>
              <option value="base">base</option>
              <option value="custom">custom</option>
            </select>
          </label>
          {builder.themeSelection === 'custom' && (
            <>
              <label className="boomi-form-label">
                Custom theme name
                <input
                  className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                  value={builder.themeCustomName}
                  placeholder="my-theme"
                  onChange={(e) => setBuilder((prev) => ({ ...prev, themeCustomName: e.target.value, themeDefault: e.target.value }))}
                />
              </label>
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-70">CSS Variable Overrides</div>
                {builder.themeCustomVars.length === 0 && <div className="text-xs opacity-70">No custom variables yet.</div>}
                <div className="space-y-2">
                  {builder.themeCustomVars.map((row) => (
                    <div key={row.id} className="flex items-center gap-2 flex-nowrap w-full overflow-x-auto">
                      <select
                        className="boomi-input flex-1 min-w-0 rounded-md p-2 text-sm"
                        value={row.varName}
                        onChange={(e) => updateCustomVarRow(row.id, { varName: e.target.value })}
                      >
                        {cssVarOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => updateCustomVarRow(row.id, { value: e.target.value })}
                        className="boomi-input flex-1 min-w-0 rounded-md p-2 text-sm"
                        placeholder="#000000 or rgba(...) or value"
                      />
                      {isHexColor(row.value) && (
                        <input
                          type="color"
                          value={row.value}
                          onChange={(e) => updateCustomVarRow(row.id, { value: e.target.value })}
                          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-[var(--boomi-card-border)] bg-transparent"
                        />
                      )}
                      <button type="button" className="text-xs text-red-500 whitespace-nowrap shrink-0" onClick={() => removeCustomVarRow(row.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="boomi-btn-primary px-3 py-2 text-xs" onClick={addCustomVarRow}>
                  Add CSS Variable
                </button>
              </div>
            </>
          )}
        </div>
      )}

      </div>

      {/* ── Advanced tab ── */}
      <div style={{ gridArea: '1/1', visibility: activeTab === 'Advanced' ? 'visible' : 'hidden' }}>
      {(
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Sessions</div>
            <label className="boomi-form-label">
              Session scope
              <select
                className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                value={builder.agentSessionScope}
                onChange={(e) => set('agentSessionScope', e.target.value as 'mount' | 'multi')}
              >
                <option value="multi">Multi — preserve history across page loads</option>
                <option value="mount">Mount — reset session on every page load</option>
              </select>
            </label>
            {builder.agentSessionScope === 'mount' && (
              <div className="text-xs opacity-60 rounded-md border border-[var(--boomi-card-border)] px-3 py-2">
                Sidebar is automatically hidden in mount mode — each page load starts a fresh session.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Transport</div>
            <label className="boomi-form-label">
              Transport mode
              <select
                className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                value={builder.agentTransport}
                onChange={(e) => set('agentTransport', e.target.value as 'boomi-direct' | 'boomi-proxy')}
              >
                <option value="boomi-direct">boomi-direct</option>
                <option value="boomi-proxy">boomi-proxy</option>
              </select>
            </label>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Environment</div>
            <label className="boomi-form-label">
              Environment ID
              <input
                className="boomi-input mt-1 w-full rounded-md p-2 text-sm"
                value={builder.agentEnvironmentId}
                placeholder="Leave blank to use default"
                onChange={(e) => set('agentEnvironmentId', e.target.value)}
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Behavior</div>
            <label className="boomi-form-label flex items-center gap-4 cursor-pointer">
              <input type="checkbox" className="h-3.5 w-3.5 shrink-0 cursor-pointer" checked={builder.agentExpandable} onChange={(e) => set('agentExpandable', e.target.checked)} />
              Expandable (allow modal to be expanded full-screen)
            </label>
          </div>
        </div>
      )}
      </div>

      </div>{/* end grid */}
    </div>
  );
});

export default ConfigBuilderForm;
