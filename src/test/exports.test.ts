import { describe, it, expect } from 'vitest';
import * as embedkit from '../index';

// Guards the public entry point: every data hook must exist as a runtime
// export, not only in the generated type declarations.
const DATA_HOOKS = [
  'useFetchAccountGroupIntegrationPacks',
  'useFetchAiTransformations',
  'useFetchEnvironments',
  'useFetchEnvironmentExtensions',
  'useUpdateEnvironmentExtensions',
  'useFetchEnvironmentExtensionConnectionStatus',
  'useFetchOauth2Url',
  'useCreateIntegrationPackInstance',
  'useDeleteIntegrationPackInstance',
  'useFetchIntegrationPackInstances',
  'useFetchIntegrationPackInstance',
  'useRunAllProcesses',
  'useFetchExecutionRecords',
  'useFetchMapExtensions',
  'useUpdateMapExtensions',
  'useExecuteMapExtensions',
  'useFetchProcessSchedules',
  'useUpdateProcessSchedules',
] as const;

describe('package entry point', () => {
  it.each(DATA_HOOKS)('exports %s as a function', (name) => {
    expect(typeof (embedkit as Record<string, unknown>)[name]).toBe('function');
  });

  it('keeps the core exports', () => {
    for (const name of ['useEmbedKit', 'EmbedKitProvider', 'BoomiPlugin', 'RenderComponent', 'BoomiEvents']) {
      expect(typeof (embedkit as Record<string, unknown>)[name]).not.toBe('undefined');
    }
  });
});
