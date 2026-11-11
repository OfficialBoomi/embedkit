/**
 * Edit Connections tells the integrations list when a save happened, so the list shows its success message.
 * A failed save and Cancel do not. The form and the data hooks are replaced; only the Save and Cancel buttons and
 * what the screen asks the plugin to render are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import type { ReactNode } from 'react';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';

const renderComponent = vi.hoisted(() => vi.fn());
const updateFromCombined = vi.hoisted(() => vi.fn(async () => {}));
const formPayload = vi.hoisted(() => ({ value: [{ id: 'c1' }] as unknown[] | null }));
// The screen reacts to these hooks' values, so they must be the same objects on every render.
const stable = vi.hoisted(() => ({
  extensions: [{ id: 'c1' }],
  rawExtensions: [] as unknown[],
  fetchEnvironmentExtensions: async () => {},
  fetchOauth2Url: async () => {},
  fetchStatus: async () => false,
  edited: [] as unknown[],
}));

vi.mock('../../context/pluginContext', () => ({
  usePlugin: () => ({ boomiConfig: {}, renderComponent, setPageIsLoading: vi.fn() }),
}));
vi.mock('../../components/core/Page', () => ({
  default: ({ bodyContent }: { bodyContent?: ReactNode }) => <div>{bodyContent}</div>,
}));
vi.mock('../../components/integration/ConnectorForm', () => ({
  default: forwardRef((_props: unknown, ref) => {
    useImperativeHandle(ref, () => ({ validateAndSubmit: () => formPayload.value }));
    return <div data-testid="form" />;
  }),
}));
vi.mock('../../components/ui/Dialog', () => ({
  default: ({ error }: { error?: { header: string; message: string } }) =>
    error ? <div role="alertdialog">{error.header}: {error.message}</div> : null,
}));
vi.mock('../../hooks/environment-extensions/useUpdateEnvironmentExtensions', () => ({
  useUpdateEnvironmentExtensions: () => ({ updateFromCombined, editedConnections: stable.edited }),
}));
vi.mock('../../hooks/environment-extensions/useFetchEnvironmentExtensions', () => ({
  useFetchEnvironmentExtensions: () => ({
    extensions: stable.extensions,
    rawExtensions: stable.rawExtensions,
    isLoading: false,
    fetchEnvironmentExtensions: stable.fetchEnvironmentExtensions,
  }),
}));
vi.mock('../../hooks/environment-extensions/useFetchOauth2Url', () => ({
  useFetchOauth2Url: () => ({ url: null, isLoading: false, error: null, fetchOauth2Url: stable.fetchOauth2Url }),
}));
vi.mock('../../hooks/environment-extensions/useFetchEnvironmentExtensionConnectionStatus', () => ({
  useFetchEnvironmentExtensionConnectionStatus: () => ({ status: null, fetchEnvironmentExtensionConnectionStatus: stable.fetchStatus }),
}));

import UpdateConnections from '../../components/integration/UpdateConnections';

const integration = { id: 'ipi-1', environmentId: 'env-1', installationType: 'SINGLE', integrationPackName: 'Pack' } as unknown as IntegrationPackInstance;
const open = () => render(<UpdateConnections componentKey="k" integration={integration} active wizard={false} />);

beforeEach(() => {
  renderComponent.mockClear();
  updateFromCombined.mockReset();
  updateFromCombined.mockResolvedValue(undefined);
  formPayload.value = [{ id: 'c1' }];
});

describe('Save on the Edit Connections screen', () => {
  it('goes back to the list and tells it a save happened', async () => {
    open();
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(renderComponent).toHaveBeenCalledTimes(1));
    expect(updateFromCombined).toHaveBeenCalledTimes(1);
    expect(renderComponent.mock.calls[0][0]).toMatchObject({
      component: 'Integrations',
      props: { componentKey: 'k', showUpdateControls: true },
    });
  });

  it('stays on the screen with the reason when the update fails, and tells the list nothing', async () => {
    updateFromCombined.mockRejectedValue(new Error('The platform refused it'));
    open();
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toContain('The platform refused it'));
    expect(renderComponent).not.toHaveBeenCalled();
  });

  it('stays on the screen when the form is not valid', async () => {
    formPayload.value = null;
    open();
    fireEvent.click(screen.getByText('Save'));
    await new Promise((r) => setTimeout(r, 30));
    expect(updateFromCombined).not.toHaveBeenCalled();
    expect(renderComponent).not.toHaveBeenCalled();
  });

  it('Cancel goes back with no success message', () => {
    open();
    fireEvent.click(screen.getByText('Cancel'));
    expect(renderComponent).toHaveBeenCalledTimes(1);
    expect(renderComponent.mock.calls[0][0].props.showUpdateControls).toBe(false);
    expect(updateFromCombined).not.toHaveBeenCalled();
  });
});
