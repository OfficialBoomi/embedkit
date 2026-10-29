import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

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

describe('useFetchIntegrationPackInstances sort fallback', () => {
  const rejected = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
  const sorts = () => getIntegrationPacks.mock.calls.map((c) => c[0]?.sort);

  beforeEach(() => {
    getIntegrationPacks.mockReset();
  });

  it('sends a Created or Last viewed sort like any other', async () => {
    getIntegrationPacks.mockResolvedValue({ result: [], totalPages: 1 });
    const { result } = renderHook(() =>
      useFetchIntegrationPackInstances({ renderType: 'integration', sort: { by: 'lastViewed', dir: 'desc' } }),
    );
    await waitFor(() => expect(getIntegrationPacks).toHaveBeenCalledTimes(1));
    expect(sorts()).toEqual([{ by: 'lastViewed', dir: 'desc' }]);
    expect(result.current.sortUnsupported).toBe(false);
  });

  it('retries once without the sort when an older server rejects it, and reports it', async () => {
    getIntegrationPacks
      .mockRejectedValueOnce(rejected(500))
      .mockResolvedValueOnce({ result: [{ id: 'a', integrationPackId: 'p1' }], totalPages: 3 });
    const { result } = renderHook(() =>
      useFetchIntegrationPackInstances({ renderType: 'integration', sort: { by: 'created', dir: 'desc' } }),
    );
    await waitFor(() => expect(result.current.sortUnsupported).toBe(true));
    expect(sorts()).toEqual([{ by: 'created', dir: 'desc' }, undefined]);
    expect(result.current.error).toBeNull();
    expect(result.current.integrationPackInstances).toHaveLength(1);
    expect(result.current.totalPages).toBe(3);
  });

  it('treats a 400 the same way', async () => {
    getIntegrationPacks.mockRejectedValueOnce(rejected(400)).mockResolvedValueOnce({ result: [], totalPages: 1 });
    const { result } = renderHook(() =>
      useFetchIntegrationPackInstances({ renderType: 'integration', sort: { by: 'lastViewed', dir: 'desc' } }),
    );
    await waitFor(() => expect(result.current.sortUnsupported).toBe(true));
  });

  it('reports the original error when the list also fails without the sort', async () => {
    getIntegrationPacks.mockRejectedValue(rejected(500));
    const { result } = renderHook(() =>
      useFetchIntegrationPackInstances({ renderType: 'integration', sort: { by: 'created', dir: 'asc' } }),
    );
    await waitFor(() => expect(result.current.error).toBe('HTTP 500'));
    expect(result.current.sortUnsupported).toBe(false);
    expect(getIntegrationPacks).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failing Name sort or a network error', async () => {
    getIntegrationPacks.mockRejectedValue(rejected(500));
    const name = renderHook(() =>
      useFetchIntegrationPackInstances({ renderType: 'integration', sort: { by: 'name', dir: 'asc' } }),
    );
    await waitFor(() => expect(name.result.current.error).toBe('HTTP 500'));
    expect(getIntegrationPacks).toHaveBeenCalledTimes(1);

    getIntegrationPacks.mockReset();
    getIntegrationPacks.mockRejectedValue(rejected(0));
    const net = renderHook(() =>
      useFetchIntegrationPackInstances({ renderType: 'integration', sort: { by: 'created', dir: 'asc' } }),
    );
    await waitFor(() => expect(net.result.current.error).toBe('HTTP 0'));
    expect(getIntegrationPacks).toHaveBeenCalledTimes(1);
  });

  it('stops sending the newer sorts once the server is known not to support them', async () => {
    getIntegrationPacks
      .mockRejectedValueOnce(rejected(500))
      .mockResolvedValue({ result: [], totalPages: 2 });
    const { result } = renderHook(() =>
      useFetchIntegrationPackInstances({ renderType: 'integration', sort: { by: 'created', dir: 'desc' } }),
    );
    await waitFor(() => expect(result.current.sortUnsupported).toBe(true));
    getIntegrationPacks.mockClear();
    await act(async () => { await result.current.refetch(); });
    expect(sorts()).toEqual([undefined]);
  });
});

describe('useFetchIntegrationPackInstances starting page', () => {
  beforeEach(() => {
    getIntegrationPacks.mockReset();
  });
  const pageOfLastCall = () => getIntegrationPacks.mock.calls.at(-1)?.[0]?.page;

  it('starts on page 1 by default', async () => {
    getIntegrationPacks.mockResolvedValue({ result: [], totalPages: 3, page: 1 });
    const { result } = renderHook(() => useFetchIntegrationPackInstances({ renderType: 'integration' }));
    await waitFor(() => expect(getIntegrationPacks).toHaveBeenCalled());
    expect(pageOfLastCall()).toBe(1);
    expect(result.current.currentPage).toBe(1);
  });

  it('starts on the page it is given', async () => {
    getIntegrationPacks.mockResolvedValue({ result: [], totalPages: 5, page: 3 });
    const { result } = renderHook(() => useFetchIntegrationPackInstances({ renderType: 'integration', initialPage: 3 }));
    await waitFor(() => expect(getIntegrationPacks).toHaveBeenCalled());
    expect(pageOfLastCall()).toBe(3);
    expect(result.current.currentPage).toBe(3);
  });

  it('falls back to page 1 for a start page that is not a positive whole number', async () => {
    getIntegrationPacks.mockResolvedValue({ result: [], totalPages: 1, page: 1 });
    renderHook(() => useFetchIntegrationPackInstances({ renderType: 'integration', initialPage: 0 }));
    await waitFor(() => expect(getIntegrationPacks).toHaveBeenCalled());
    expect(pageOfLastCall()).toBe(1);
  });

  it('follows the server to the last page when the remembered page no longer exists', async () => {
    getIntegrationPacks
      .mockResolvedValueOnce({ result: [], totalPages: 2, page: 2 })
      .mockResolvedValue({ result: [], totalPages: 2, page: 2 });
    const { result } = renderHook(() => useFetchIntegrationPackInstances({ renderType: 'integration', initialPage: 9 }));
    await waitFor(() => expect(result.current.currentPage).toBe(2));
    await waitFor(() => expect(pageOfLastCall()).toBe(2));
    expect(getIntegrationPacks).toHaveBeenCalledTimes(2);
  });

  it('does not loop when the server returns the page that was asked for', async () => {
    getIntegrationPacks.mockResolvedValue({ result: [], totalPages: 4, page: 3 });
    renderHook(() => useFetchIntegrationPackInstances({ renderType: 'integration', initialPage: 3 }));
    await waitFor(() => expect(getIntegrationPacks).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(getIntegrationPacks).toHaveBeenCalledTimes(1);
  });
});
