/**
 * @file UpdateCrossReferencesLive.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The live data path of the cross reference table screen: with no registered source the tables
 * come from the server, a server without the route gets a plain message, a registered
 * development source still wins, and the screen says saving is not available. The grid and the
 * toolbar are small stand-ins, as in the other screen tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ctx = vi.hoisted(() => ({
  boomiConfig: {} as Record<string, unknown>,
  renderComponent: vi.fn(),
}));
const fetchTables = vi.hoisted(() => vi.fn());

vi.mock('../../context/pluginContext', () => ({ usePlugin: () => ctx }));
vi.mock('../../hooks/useDialogs', () => ({ useDialogs: () => ({ confirm: vi.fn(), alert: vi.fn() }) }));
vi.mock('../../service/crossReferenceTables.service', () => ({
  useCrossReferenceTablesService: () => ({ fetchCrossReferenceTables: fetchTables }),
}));
vi.mock('../../components/core/Page', () => ({
  default: ({ bodyContent }: { bodyContent: React.ReactNode }) => <div>{bodyContent}</div>,
}));
vi.mock('../../components/ui/Dialog', () => ({
  default: ({
    error,
    showActionButton,
    buttonLabel,
    onButtonClick,
  }: {
    error?: { header: string; message: string };
    showActionButton?: boolean;
    buttonLabel?: string;
    onButtonClick?: () => void;
  }) =>
    error ? (
      <div role="alertdialog">
        <h2>{error.header}</h2>
        <p>{error.message}</p>
        {showActionButton && buttonLabel && (
          <button type="button" onClick={onButtonClick}>
            {buttonLabel}
          </button>
        )}
      </div>
    ) : null,
}));
vi.mock('../../components/integration/crt/CrtToolbar', () => ({
  default: ({ trailing }: { trailing?: React.ReactNode }) => <div>{trailing}</div>,
}));
vi.mock('../../components/integration/crt/CrtGrid', () => ({
  default: forwardRef<unknown, { ariaLabel: string }>(({ ariaLabel }, ref) => {
    useImperativeHandle(ref, () => ({ run: () => {} }), []);
    return <div role="grid" tabIndex={0} aria-label={ariaLabel} />;
  }),
}));

import UpdateCrossReferences from '../../components/integration/UpdateCrossReferences';
import { registerCrtDataSource } from '../../utils/crt/crtDataSource';
import { HttpError } from '../../service/http';

const integration = { id: 'ipi-1', environmentId: 'env-1', integrationPackName: 'Pack' } as never;

const serverTable = (name: string, over: Record<string, unknown> = {}) => ({
  id: `id-${name.toLowerCase()}`,
  name,
  processId: 'p1',
  processName: 'Main',
  overridden: false,
  matchType: 'exact',
  columns: ['code', 'value'],
  defaultRows: [['a', '1']],
  overrideRows: null,
  ...over,
});

const renderScreen = (props: Record<string, unknown> = {}) =>
  render(<UpdateCrossReferences componentKey="k" integration={integration} {...props} />);

beforeEach(() => {
  ctx.boomiConfig = {};
  fetchTables.mockReset();
});
afterEach(() => {
  registerCrtDataSource(null);
});

describe('live tables', () => {
  it('asks the server for the pack and environment and shows the first table', async () => {
    fetchTables.mockResolvedValue({ tables: [serverTable('Beta'), serverTable('Alpha')] });
    renderScreen();
    await screen.findByRole('grid');
    expect(fetchTables).toHaveBeenCalledTimes(1);
    expect(fetchTables.mock.calls[0][0]).toMatchObject({ integrationPackInstanceId: 'ipi-1', environmentId: 'env-1' });
    // Sorted by name: Alpha is the one opened.
    expect(screen.getByRole('grid').getAttribute('aria-label')).toMatch(/Alpha/);
  });

  it('shows a process name without the pack name in front of it', async () => {
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha', { processName: 'Pack - Main Lookups' })] });
    renderScreen();
    await screen.findByRole('grid');
    expect(screen.getAllByText(/Main Lookups/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Pack - Main Lookups/)).toBeNull();
  });

  it('lists a process the server sends with no table, disabled with the reason', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({
      tables: [serverTable('Alpha')],
      processes: [{ id: 'p1', name: 'Main' }, { id: 'p2', name: 'Empty' }],
    });
    renderScreen();
    await screen.findByRole('grid');
    await user.click(screen.getAllByRole('button', { name: /^Process\b/ })[0]);
    const empty = screen.getAllByRole('option').find((o) => within(o).queryByText('Empty') !== null) as HTMLElement;
    expect(empty.getAttribute('aria-disabled')).toBe('true');
    expect(within(empty).getByText('No tables in this process')).toBeTruthy();
  });

  it('says saving is not available, visibly and on the disabled Save button', async () => {
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha')] });
    renderScreen();
    await screen.findByRole('grid');
    expect(screen.getByRole('note').textContent).toMatch(/Saving is not available yet/);
    expect(screen.getByRole('note').className).toBe('boomi-crt-note');
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the empty state for a pack with no tables', async () => {
    fetchTables.mockResolvedValue({ tables: [] });
    renderScreen();
    await screen.findByText('No editable cross reference tables');
  });

  it('lists a table the server marks unavailable with its reason, and opens none of it', async () => {
    fetchTables.mockResolvedValue({
      tables: [serverTable('Only', { columns: [], defaultRows: undefined, unavailableReason: 'It is runtime specific.' })],
    });
    renderScreen();
    await screen.findByText('No editable cross reference tables');
    expect(screen.getByText(/It is runtime specific\./)).toBeTruthy();
  });

  it('a registered development source wins and the server is never asked', async () => {
    registerCrtDataSource({
      listTables: async () => [
        { id: 'd1', name: 'Dev', processId: 'p', processName: 'P', matchType: 'exact', columns: ['a', 'b'], defaultRows: [['1', '2']], overrideRows: null },
      ],
    });
    renderScreen();
    await screen.findByRole('grid');
    expect(fetchTables).not.toHaveBeenCalled();
  });
});

describe('load errors', () => {
  it('tells a server without the route to be updated (404)', async () => {
    fetchTables.mockRejectedValue(new HttpError('Not Found', 404));
    renderScreen();
    await screen.findByRole('alertdialog');
    expect(screen.getByText(/does not support cross reference tables/)).toBeTruthy();
  });

  it('says the same when the server answers 501 (its SDK is too old)', async () => {
    fetchTables.mockRejectedValue(new HttpError('Cross reference tables need a newer SDK', 501));
    renderScreen();
    await screen.findByRole('alertdialog');
    expect(screen.getByText(/does not support cross reference tables/)).toBeTruthy();
  });

  it('shows the server message for any other failure', async () => {
    fetchTables.mockRejectedValue(new HttpError('Boomi could not list the tables: extensionGroupId is not deployed to environment', 400));
    renderScreen();
    await screen.findByRole('alertdialog');
    expect(screen.getByText(/extensionGroupId is not deployed/)).toBeTruthy();
  });

  it('shows a plain message when the answer is not a list of tables', async () => {
    fetchTables.mockResolvedValue({ unexpected: true });
    renderScreen();
    await screen.findByRole('alertdialog');
    expect(screen.getByText(/unexpected answer/)).toBeTruthy();
  });

  it('does not ask the server when the pack has no environment, and says why', async () => {
    renderScreen({ integration: { id: 'ipi-1', integrationPackName: 'Pack' } });
    await screen.findByRole('alertdialog');
    expect(screen.getByText(/no environment/)).toBeTruthy();
    expect(fetchTables).not.toHaveBeenCalled();
  });

  it('says the server could not be reached when there was no answer at all', async () => {
    fetchTables.mockRejectedValue(new HttpError('Failed to fetch', 0));
    renderScreen();
    await screen.findByRole('alertdialog');
    expect(screen.getByText(/could not be reached/)).toBeTruthy();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('offers no Try again for an ended session, whose message says to reload the page', async () => {
    fetchTables.mockRejectedValue(new HttpError('Your connection to this section has timed out. Reload the page to continue.', 401, undefined, 'TOKEN_REJECTED'));
    renderScreen();
    await screen.findByRole('alertdialog');
    expect(screen.getByText(/timed out/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('asks again on Try again', async () => {
    fetchTables.mockRejectedValueOnce(new HttpError('Service Unavailable', 503));
    fetchTables.mockResolvedValueOnce({ tables: [serverTable('Alpha')] });
    renderScreen();
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('grid');
    expect(fetchTables).toHaveBeenCalledTimes(2);
  });
});

describe('leaving while loading', () => {
  it('cancels the request when the screen goes away and ignores a late answer', async () => {
    let signal: AbortSignal | undefined;
    let resolve: (v: unknown) => void = () => {};
    fetchTables.mockImplementation(
      (args: { signal: AbortSignal }) =>
        new Promise((r) => {
          signal = args.signal;
          resolve = r;
        })
    );
    const { unmount } = renderScreen();
    await act(async () => {});
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve({ tables: [serverTable('Alpha')] }));
  });
});
