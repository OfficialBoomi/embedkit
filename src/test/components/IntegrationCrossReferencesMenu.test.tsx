/**
 * @file IntegrationCrossReferencesMenu.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The cross reference tables item in an integration's actions menu: absent unless the host turns the
 * feature on, the default text, a custom text from `menuLabel`, and an empty or blank `menuLabel` falling
 * back to the default instead of leaving a blank item. Checked on the menu itself and through the card
 * that reads the setting.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ctx = vi.hoisted(() => ({
  boomiConfig: {} as Record<string, unknown>,
  setPageIsLoading: vi.fn(),
}));

vi.mock('../../context/pluginContext', () => ({ usePlugin: () => ctx }));
vi.mock('../../hooks/useDialogs', () => ({ useDialogs: () => ({ confirm: vi.fn(async () => true), alert: vi.fn() }) }));
// The card only reads the component map for a type; the real one is the whole plugin entry point.
vi.mock('../../main', () => ({ componentMap: {} }));

import Integration from '../../components/integration/Integration';
import IntegrationActions from '../../components/integration/IntegrationActions';

const integration = {
  id: 'ipi-1',
  integrationPackName: 'Order Sync',
  integrationPackOverrideName: 'Order Sync',
  integrationPackDescription: 'Keeps orders in step',
  installationType: 'SINGLE',
  environmentId: 'env-1',
} as never;

const DEFAULT_LABEL = 'Edit Cross Reference Tables';

// The menu library measures its list with a ResizeObserver, which jsdom does not have.
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const openMenu = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Open options' }));

describe('IntegrationActions: the cross reference tables item', () => {
  const renderActions = (extra: Record<string, unknown> = {}) =>
    render(
      <IntegrationActions
        integration={integration}
        onRunNow={vi.fn()}
        onEditSchedule={vi.fn()}
        onEditConnections={vi.fn()}
        onEditMap={vi.fn()}
        onDeleteIntegration={vi.fn()}
        onShowHistory={vi.fn()}
        {...extra}
      />
    );

  it('has no such item unless a handler is given', async () => {
    const user = userEvent.setup();
    renderActions();
    await openMenu(user);
    expect(screen.queryByRole('menuitem', { name: DEFAULT_LABEL })).toBeNull();
  });

  it('shows the default text', async () => {
    const user = userEvent.setup();
    renderActions({ onEditCrossReferences: vi.fn() });
    await openMenu(user);
    expect(screen.getByRole('menuitem', { name: DEFAULT_LABEL })).toBeTruthy();
  });

  it('shows a custom text', async () => {
    const user = userEvent.setup();
    renderActions({ onEditCrossReferences: vi.fn(), crossReferencesLabel: 'Lookup tables' });
    await openMenu(user);
    expect(screen.getByRole('menuitem', { name: 'Lookup tables' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: DEFAULT_LABEL })).toBeNull();
  });

  it.each(['', '   '])('falls back to the default for the label %j, not a blank item', async (label) => {
    const user = userEvent.setup();
    renderActions({ onEditCrossReferences: vi.fn(), crossReferencesLabel: label });
    await openMenu(user);
    expect(screen.getByRole('menuitem', { name: DEFAULT_LABEL })).toBeTruthy();
  });

  it('runs the handler when the item is chosen', async () => {
    const user = userEvent.setup();
    const onEditCrossReferences = vi.fn();
    renderActions({ onEditCrossReferences });
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: DEFAULT_LABEL }));
    expect(onEditCrossReferences).toHaveBeenCalledTimes(1);
  });
});

describe('Integration: the menuLabel setting', () => {
  beforeEach(() => {
    ctx.boomiConfig = {};
  });

  const renderCard = (crossReferenceTables: Record<string, unknown> | undefined) => {
    ctx.boomiConfig = { components: { k: { crossReferenceTables } } };
    const onEditClick = vi.fn();
    render(
      <Integration
        componentKey="k"
        integration={integration}
        viewType="off"
        onEditClick={onEditClick}
        onShowHistory={vi.fn()}
        onDeleteClick={vi.fn()}
        onRunClick={vi.fn()}
        onViewDetails={vi.fn()}
      />
    );
    return onEditClick;
  };

  it('has no item when the feature is off or not set, whatever the label says', async () => {
    const user = userEvent.setup();
    renderCard({ menuLabel: 'Lookup tables' });
    await openMenu(user);
    expect(screen.queryByRole('menuitem', { name: 'Lookup tables' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: DEFAULT_LABEL })).toBeNull();
  });

  it('shows the default text when the feature is on and no label is set', async () => {
    const user = userEvent.setup();
    const onEditClick = renderCard({ enabled: true });
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: DEFAULT_LABEL }));
    expect(onEditClick).toHaveBeenCalledWith('UpdateCrossReferences', integration);
  });

  it('shows a custom label', async () => {
    const user = userEvent.setup();
    renderCard({ enabled: true, menuLabel: 'Lookup tables' });
    await openMenu(user);
    expect(screen.getByRole('menuitem', { name: 'Lookup tables' })).toBeTruthy();
  });

  it.each(['', '  '])('shows the default text for an empty menuLabel (%j), not a blank item', async (menuLabel) => {
    const user = userEvent.setup();
    renderCard({ enabled: true, menuLabel });
    await openMenu(user);
    expect(screen.getByRole('menuitem', { name: DEFAULT_LABEL })).toBeTruthy();
    // No item without a name.
    for (const item of screen.getAllByRole('menuitem')) expect((item.textContent ?? '').trim()).not.toBe('');
  });
});
