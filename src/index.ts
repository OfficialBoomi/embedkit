// types
export type { Theme } from './types/theme';
export type { KeyConfig } from './types/component-key.config';
export type { Mapping } from './types/mapping';
export type {
  PluginConfig,
} from './types/plugin.config';
export { default as EmbedKitProvider } from './embedKitProvider';
export { useEmbedKit } from './hooks/useEmbedKit';
export { createEmbedKit } from './createEmbedKit';
export { default as BoomiPlugin } from './main';
export { RenderComponent, DestroyPlugin } from './main';
export { BoomiEvents, BOOMI_EVENT_NAME } from './events.service';
export type {
  EmbedKitEvent,
  EmbedKitEventType,
  EmbedKitEventHandler,
  FeedbackEventData,
} from './events.service';
export { default } from './main';
export { Components } from './components/registry';
export type { KnownComponent, ComponentPropsMap } from './components/registry';

// Data hooks. These must be value re-exports: a type-only import that is
// re-exported is erased at build time, leaving the hook in the type
// declarations but missing from the JavaScript bundles.
export { useFetchAccountGroupIntegrationPacks } from './hooks/account-group/useFetchAccountGroupIntegrationPack';
export { useFetchAiTransformations } from './hooks/ai/useFetchAiTransformations';
export { useFetchEnvironments } from './hooks/environment/useFetchEnvironments';
export { useFetchEnvironmentExtensions } from './hooks/environment-extensions/useFetchEnvironmentExtensions';
export { useUpdateEnvironmentExtensions } from './hooks/environment-extensions/useUpdateEnvironmentExtensions';
export { useFetchEnvironmentExtensionConnectionStatus } from './hooks/environment-extensions/useFetchEnvironmentExtensionConnectionStatus';
export { useFetchOauth2Url } from './hooks/environment-extensions/useFetchOauth2Url';
export { useCreateIntegrationPackInstance } from './hooks/integration-pack-instance/useCreateIntegrationPackInstance';
export { useDeleteIntegrationPackInstance } from './hooks/integration-pack-instance/useDeleteIntegrationPackInstance';
export { useFetchIntegrationPackInstances } from './hooks/integration-pack-instance/useFetchIntegrationPackIntances';
export { useFetchIntegrationPackInstance } from './hooks/integration-pack-instance/useFetchIntegrationPackIntance';
export { useRunAllProcesses } from './hooks/execution-request/useRunAllProcesses';
export { useFetchExecutionRecords } from './hooks/execution-summary-record/useFetchExecutionSummaryRecords';
export { useFetchMapExtensions } from './hooks/map-extension/useFetchMapExtensions';
export { useUpdateMapExtensions } from './hooks/map-extension/useUpdateMapExtensions';
export { useExecuteMapExtensions } from './hooks/map-extension/useExecuteMapExtensions';
export { useFetchProcessSchedules } from './hooks/process-schedule/useFetchProcessSchedules';
export { useUpdateProcessSchedules } from './hooks/process-schedule/useUpdateProcessSchedules';
