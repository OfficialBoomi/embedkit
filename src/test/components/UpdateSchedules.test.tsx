import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

const fetchState = vi.hoisted(() => ({
  schedule: null as any,
  error: null as string | null,
  isLoading: false,
  fetchSchedules: vi.fn(async () => {}),
}));
const updateProcessSchedules = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('../../context/pluginContext', () => ({
  usePluginOptional: () => ({}),
  usePlugin: () => ({
    boomiConfig: {},
    setPageIsLoading: vi.fn(),
    renderComponent: vi.fn(),
  }),
}));
vi.mock('../../hooks/process-schedule/useFetchProcessSchedules', () => ({
  useFetchProcessSchedules: () => ({
    schedule: fetchState.schedule,
    isLoading: fetchState.isLoading,
    error: fetchState.error,
    fetchSchedules: fetchState.fetchSchedules,
  }),
}));
vi.mock('../../hooks/process-schedule/useUpdateProcessSchedules', () => ({
  useUpdateProcessSchedules: () => ({
    updateProcessSchedules,
    isUpdating: false,
    updateError: null,
  }),
}));
vi.mock('../../components/ui/Dialog', () => ({
  default: ({ error }: any) => (error ? <div role="alertdialog">{error.header}: {error.message}</div> : null),
}));

import UpdateSchedules, { UpdateScheduleRef } from '../../components/integration/UpdateSchedules';

const integration: any = { id: 'ipi-1', environmentId: 'env-1', integrationPackName: 'Pack' };
const oneSchedule = {
  Schedule: [{ minutes: '0', hours: '3', daysOfWeek: '2', daysOfMonth: '*', months: '*', years: '*' }],
};

const setup = () => {
  const ref = createRef<UpdateScheduleRef>();
  render(<UpdateSchedules ref={ref} componentKey="k" integration={integration} active wizard />);
  return ref;
};

beforeEach(() => {
  fetchState.schedule = null;
  fetchState.error = null;
  fetchState.isLoading = false;
  updateProcessSchedules.mockClear();
});

describe('UpdateSchedules empty state', () => {
  it('opens empty with a message and no placeholder card when the integration has no schedule', () => {
    setup();
    expect(screen.getByText(/No schedule is set/)).toBeTruthy();
    expect(screen.queryByText(/Schedule #1/)).toBeNull();
  });

  it('shows a saved schedule and no empty message', () => {
    fetchState.schedule = oneSchedule;
    setup();
    expect(screen.getByText(/Schedule #1/)).toBeTruthy();
    expect(screen.queryByText(/No schedule is set/)).toBeNull();
  });

  it('saves an empty list when the user deletes the last schedule', async () => {
    fetchState.schedule = oneSchedule;
    const ref = setup();
    fireEvent.click(document.querySelector('.boomi-sched-card__delete') as HTMLElement);
    expect(screen.getByText(/No schedule is set/)).toBeTruthy();

    let ok: boolean | undefined;
    await act(async () => { ok = await ref.current?.submit(); });

    expect(ok).toBe(true);
    expect(updateProcessSchedules).toHaveBeenCalledWith([], 'env-1', 'ipi-1');
  });

  it('sends nothing for a pack that had no schedule and still has none', async () => {
    const ref = setup();
    let ok: boolean | undefined;
    await act(async () => { ok = await ref.current?.submit(); });
    expect(ok).toBe(true);
    expect(updateProcessSchedules).not.toHaveBeenCalled();
  });

  it('sends the new schedule when the user adds one to an empty pack', async () => {
    const ref = setup();
    fireEvent.click(screen.getByText('Add'));
    await act(async () => { await ref.current?.submit(); });
    expect(updateProcessSchedules).toHaveBeenCalledTimes(1);
    expect((updateProcessSchedules.mock.calls[0] as any[])[0]).toHaveLength(1);
  });
});

describe('UpdateSchedules load failure guard', () => {
  it('shows the error instead of the form and sends nothing on submit', async () => {
    fetchState.error = 'Unexpected error fetching process schedules: boom';
    const ref = setup();

    expect(screen.getByRole('alert').textContent).toContain('boom');
    expect(screen.queryByText(/No schedule is set/)).toBeNull();

    let ok: boolean | undefined;
    await act(async () => { ok = await ref.current?.submit(); });

    expect(ok).toBe(false);
    expect(updateProcessSchedules).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toContain('Nothing was saved'));
  });
});
