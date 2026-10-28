import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getIntegrationPacks = vi.hoisted(() => vi.fn());

vi.mock('../../context/pluginContext', () => ({
  usePlugin: () => ({ boomiConfig: {} }),
}));
vi.mock('../../service/integrationPacks.service', () => ({
  useIntegrationPacksService: () => ({ getIntegrationPacks }),
}));
vi.mock('../../logger.service', () => ({
  default: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useFetchIntegrationPackInstances } from '../../hooks/integration-pack-instance/useFetchIntegrationPackIntances';

const sizeOfLastCall = () => getIntegrationPacks.mock.calls.at(-1)?.[0]?.pageSize;

describe('useFetchIntegrationPackInstances page size', () => {
  beforeEach(() => {
    getIntegrationPacks.mockReset();
    getIntegrationPacks.mockResolvedValue({ result: [], totalPages: 1 });
  });

  it('asks for 12 per page when no size is given', async () => {
    renderHook(() => useFetchIntegrationPackInstances({ renderType: 'integration' }));
    await waitFor(() => expect(getIntegrationPacks).toHaveBeenCalled());
    expect(sizeOfLastCall()).toBe(12);
  });

  it('asks for the size it is given', async () => {
    renderHook(() => useFetchIntegrationPackInstances({ renderType: 'integration', pageSize: 6 }));
    await waitFor(() => expect(getIntegrationPacks).toHaveBeenCalled());
    expect(sizeOfLastCall()).toBe(6);
  });

  it('keeps the size inside 1 to 30', async () => {
    renderHook(() => useFetchIntegrationPackInstances({ renderType: 'integration', pageSize: 500 }));
    await waitFor(() => expect(getIntegrationPacks).toHaveBeenCalled());
    expect(sizeOfLastCall()).toBe(30);
  });

  it('fetches again with the new size when the size changes', async () => {
    const { rerender } = renderHook(
      ({ pageSize }: { pageSize: number }) => useFetchIntegrationPackInstances({ renderType: 'integration', pageSize }),
      { initialProps: { pageSize: 6 } },
    );
    await waitFor(() => expect(getIntegrationPacks).toHaveBeenCalledTimes(1));
    rerender({ pageSize: 8 });
    await waitFor(() => expect(getIntegrationPacks).toHaveBeenCalledTimes(2));
    expect(sizeOfLastCall()).toBe(8);
  });
});
