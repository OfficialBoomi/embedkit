/**
 * The Save button of the Edit Schedule screen (the screen opened from the integrations list, not the wizard step).
 * The page's loading overlay is a full-screen cover with a blur, so it hides the dialog or the message that explains
 * a failed save. It must be off again on every way out of Save. The earlier tests only called `ref.submit()` in the
 * wizard, which never turns the overlay on, so they could not see it stay on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pageLoading = vi.hoisted(() => vi.fn());
const renderComponent = vi.hoisted(() => vi.fn());
type TestSchedule = { Schedule: Array<Record<string, string>> };
const fetchState = vi.hoisted(() => ({ schedule: null as TestSchedule | null, error: null as string | null }));
const updateProcessSchedules = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('../../context/pluginContext', () => ({
  usePluginOptional: () => ({}),
  usePlugin: () => ({ boomiConfig: {}, setPageIsLoading: pageLoading, renderComponent }),
}));
vi.mock('../../components/core/Page', () => ({
  default: ({ bodyContent }: { bodyContent?: ReactNode }) => <div>{bodyContent}</div>,
}));
vi.mock('../../hooks/process-schedule/useFetchProcessSchedules', () => ({
  useFetchProcessSchedules: () => ({
    schedule: fetchState.schedule,
    isLoading: false,
    error: fetchState.error,
    fetchSchedules: vi.fn(async () => {}),
  }),
}));
vi.mock('../../hooks/process-schedule/useUpdateProcessSchedules', () => ({
  useUpdateProcessSchedules: () => ({ updateProcessSchedules, isUpdating: false, updateError: null }),
}));
vi.mock('../../components/ui/Dialog', () => ({
  default: ({ error }: { error?: { header: string; message: string } }) =>
    error ? <div role="alertdialog">{error.header}: {error.message}</div> : null,
}));

import type { ReactNode } from 'react';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import UpdateSchedules from '../../components/integration/UpdateSchedules';

const integration = {
  id: 'ipi-1',
  environmentId: 'env-1',
  environments: [{ id: 'env-1', name: 'Production' }],
  integrationPackName: 'Pack',
} as unknown as IntegrationPackInstance;
const oneSchedule = { Schedule: [{ minutes: '0', hours: '3', daysOfWeek: '2', daysOfMonth: '*', months: '*', years: '*' }] };

const open = () => render(<UpdateSchedules componentKey="k" integration={integration} active wizard={false} />);
const save = () => fireEvent.click(screen.getByText('Save'));
/** The last value the screen gave the page's loading flag: what a user would be left looking at. */
const overlayNow = () => pageLoading.mock.calls.at(-1)?.[0];

beforeEach(() => {
  pageLoading.mockClear();
  renderComponent.mockClear();
  updateProcessSchedules.mockReset();
  updateProcessSchedules.mockResolvedValue(undefined);
  fetchState.schedule = null;
  fetchState.error = null;
});

describe('Save on the Edit Schedule screen', () => {
  it('turns the overlay on, then off, when the schedules did not load, and the explanation can be read', async () => {
    fetchState.error = 'Unexpected error fetching process schedules: boom';
    open();
    save();
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toContain('Nothing was saved'));
    expect(pageLoading.mock.calls.map((c) => c[0])).toEqual([true, false]);
    expect(overlayNow()).toBe(false);
    expect(updateProcessSchedules).not.toHaveBeenCalled();
    expect(renderComponent).not.toHaveBeenCalled();
  });

  it('turns the overlay off when the update fails, and shows why', async () => {
    fetchState.schedule = oneSchedule;
    updateProcessSchedules.mockRejectedValue(new Error('The platform refused it'));
    open();
    save();
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toContain('The platform refused it'));
    expect(overlayNow()).toBe(false);
    expect(renderComponent).not.toHaveBeenCalled();
  });

  it('turns the overlay off when there is no environment to save to, and sends nothing', async () => {
    fetchState.schedule = oneSchedule;
    render(<UpdateSchedules componentKey="k" integration={{ ...integration, environmentId: undefined } as IntegrationPackInstance} active wizard={false} />);
    save();
    await waitFor(() => expect(pageLoading).toHaveBeenCalledWith(false));
    expect(pageLoading.mock.calls.map((c) => c[0])).toEqual([true, false]);
    // It must really have been stopped by that check: nothing sent, and no way back to the list.
    expect(updateProcessSchedules).not.toHaveBeenCalled();
    expect(renderComponent).not.toHaveBeenCalled();
  });

  it('goes back to the list after a save that works, with the overlay off', async () => {
    fetchState.schedule = oneSchedule;
    open();
    save();
    await waitFor(() => expect(renderComponent).toHaveBeenCalledTimes(1));
    expect(renderComponent).toHaveBeenCalledWith(expect.objectContaining({ component: 'Integrations' }));
    expect(updateProcessSchedules).toHaveBeenCalledTimes(1);
    expect(overlayNow()).toBe(false);
  });
});

describe('the load error on the Edit Schedule screen', () => {
  it('names the environment and says no runtime is attached', () => {
    fetchState.error =
      'Unexpected error fetching process schedules: Unable to fetch process schedules for env=env-1 ipi=ipi-1: No atoms found for environmentId: env-1';
    open();
    expect(screen.getByRole('alert').textContent).toBe('No runtime is attached to environment "Production" (env-1). Attach one in Boomi.');
  });

  it('puts the environment in front of any other reason and keeps the reason', () => {
    fetchState.error = 'Unexpected error fetching process schedules: Service Unavailable';
    open();
    expect(screen.getByRole('alert').textContent).toBe(
      'Environment "Production" (env-1): Unexpected error fetching process schedules: Service Unavailable'
    );
  });

  it('uses the same words in the dialog that says nothing was saved', async () => {
    fetchState.error = 'Unexpected error fetching process schedules: No atoms found for environmentId: env-1';
    open();
    save();
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toContain('No runtime is attached to environment "Production" (env-1)'));
  });
});
