import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import PluginHarness  from '../PluginHarness';
import { useFetchEnvironments } from '../../hooks/environment/useFetchEnvironments';

const RUN_LIVE = String(import.meta.env.VITE_RUN_LIVE_TESTS) === 'true';

(RUN_LIVE ? describe : describe.skip)('useFetchEnvironments (LIVE)', () => {
  const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
    <PluginHarness>{children}</PluginHarness>
  );

  it('fetches ALL environments (TEST + PROD) and returns list', async () => {
    const { result } = renderHook(() => useFetchEnvironments(), { wrapper });

    await act(async () => {
      await result.current.fetchEnvironments('ALL');
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(Array.isArray(result.current.environments)).toBe(true);
    const e = result.current.environments[0];
    if (e) {
      expect(e).toHaveProperty('id');
      expect(e).toHaveProperty('name');
    }
  });

  it('fetches only PROD environments', async () => {
    const { result } = renderHook(() => useFetchEnvironments(), { wrapper });

    await act(async () => {
      await result.current.fetchEnvironments('PROD');
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const e = result.current.environments[0];
    if (e) {
      expect(e).toHaveProperty('id');
      expect(e).toHaveProperty('name');
    }
  });

  it('fetches only NonProd environments', async () => {
    const { result } = renderHook(() => useFetchEnvironments(), { wrapper });

    await act(async () => {
      await result.current.fetchEnvironments('TEST');
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const e = result.current.environments[0];
    if (e) {
      expect(e).toHaveProperty('id');
      expect(e).toHaveProperty('name');
    }
  });

  it('fetches a specific environment by ID (if you set one)', async () => {
    const ENV_ID = import.meta.env.VITE_TEST_ENV_ID as string | undefined;
    if (!ENV_ID) return; // skip if not provided

    const { result } = renderHook(() => useFetchEnvironments(), { wrapper });

    await act(async () => {
      await result.current.fetchEnvironments(undefined, ENV_ID);
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();

    const envs = result.current.environments;
    expect(envs.length).toBeGreaterThan(0);
    expect(envs[0].id).toBe(ENV_ID);
  });
});
