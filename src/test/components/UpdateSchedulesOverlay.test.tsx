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
const toastShown = vi.hoisted(() => vi.fn());
vi.mock('../../components/ui/ToastNotification', async () => {
  const { useEffect } = await import('react');
  // Records each time a toast is put on screen (a toast mounts once per message), and shows its text.
  const ToastStandIn = ({ type, content }: { type: string; content: string }) => {
    useEffect(() => {
      toastShown(type, content);
    }, [type, content]);
    return <div role="status" data-type={type}>{content}</div>;
  };
  return { default: ToastStandIn };
});
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
  toastShown.mockClear();
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

  it('stays on the screen after a save that works, with a confirmation and the overlay off', async () => {
    fetchState.schedule = oneSchedule;
    open();
    save();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Schedule saved.'));
    expect(screen.getByRole('status').getAttribute('data-type')).toBe('success');
    expect(updateProcessSchedules).toHaveBeenCalledTimes(1);
    expect(overlayNow()).toBe(false);
    // Still on the Edit Schedule screen: not sent back to the list, and the form is still there.
    expect(renderComponent).not.toHaveBeenCalled();
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText(/Schedule #1/)).toBeTruthy();
  });

  it('stays and says there was nothing to save when there was nothing to send', async () => {
    fetchState.schedule = null; // no schedule before, and none added
    open();
    save();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('No changes to save.'));
    expect(screen.getByRole('status').getAttribute('data-type')).toBe('info');
    expect(updateProcessSchedules).not.toHaveBeenCalled();
    expect(renderComponent).not.toHaveBeenCalled();
    expect(overlayNow()).toBe(false);
  });

  it('after a first save the screen knows a schedule exists, so deleting it and saving again is sent', async () => {
    fetchState.schedule = null; // the loaded copy stays empty for the whole test, as it does on the screen
    open();
    fireEvent.click(screen.getByText('Add'));
    save();
    await waitFor(() => expect(updateProcessSchedules).toHaveBeenCalledTimes(1));
    expect((updateProcessSchedules.mock.calls[0] as unknown[])[0]).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Schedule saved.'));

    // Delete the schedule that was just saved and save again. Against the stale empty copy this would look like
    // "nothing before, nothing now" and be skipped; it must reach the server.
    fireEvent.click(document.querySelector('.boomi-sched-card__delete') as HTMLElement);
    save();
    await waitFor(() => expect(updateProcessSchedules).toHaveBeenCalledTimes(2));
    expect((updateProcessSchedules.mock.calls[1] as unknown[])[0]).toHaveLength(0);
  });

  it('shows the confirmation again for a second save', async () => {
    fetchState.schedule = oneSchedule;
    open();
    save();
    await waitFor(() => expect(toastShown).toHaveBeenCalledTimes(1));
    save();
    await waitFor(() => expect(toastShown).toHaveBeenCalledTimes(2));
    expect(toastShown).toHaveBeenNthCalledWith(2, 'success', 'Schedule saved.');
  });

  it('shows no confirmation after a save that fails', async () => {
    fetchState.schedule = oneSchedule;
    updateProcessSchedules.mockRejectedValue(new Error('The platform refused it'));
    open();
    save();
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy());
    expect(toastShown).not.toHaveBeenCalled();
  });

  it('Cancel goes back without a success message', () => {
    fetchState.schedule = oneSchedule;
    open();
    fireEvent.click(screen.getByText('Cancel'));
    expect(renderComponent).toHaveBeenCalledTimes(1);
    expect(renderComponent.mock.calls[0][0].props.showUpdateControls).toBe(false);
    expect(updateProcessSchedules).not.toHaveBeenCalled();
    expect(toastShown).not.toHaveBeenCalled();
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
