/**
 * @file UpdateMapsCrossReference.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The map screen's "Open Cross Reference Table" item, from the card to the screen it opens, through the real
 * canvas (the flat one, and the tree one when `mapping.useTreeMode` is on) and the real Transformations column.
 * Standalone, the screen opens the cross reference table screen itself with the table and the process of the open
 * map and a way back to the list. In the wizard it calls the callback it was given and nothing else. With the
 * feature off, or in the wizard without a callback, no card has the item. Only the data hooks, the page frame and
 * the plugin context are stand-ins.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ctx = vi.hoisted(() => ({
  boomiConfig: {} as Record<string, unknown>,
  renderComponent: vi.fn(),
  setPageIsLoading: vi.fn(),
}));
const hook = vi.hoisted(() => ({ maps: [] as unknown[] }));

vi.mock('../../context/pluginContext', () => ({ usePlugin: () => ctx }));
vi.mock('../../hooks/useDialogs', () => ({ useDialogs: () => ({ confirm: vi.fn(), alert: vi.fn() }) }));
vi.mock('../../events.service', () => ({ emitEmbedKitEvent: vi.fn() }));
vi.mock('../../hooks/map-extension/useFetchMapExtensions', () => ({
  useFetchMapExtensions: () => ({
    maps: hook.maps,
    isLoading: false,
    hasCandidates: false,
    mapCandidates: [],
    error: null,
    errorDetail: null,
    fetchMapExtensions: vi.fn(),
  }),
}));
vi.mock('../../hooks/map-extension/useUpdateMapExtensions', () => ({
  useUpdateMapExtensions: () => ({ updateMapExtensions: vi.fn() }),
}));
vi.mock('../../hooks/map-extension/useExecuteMapExtensions', () => ({
  useExecuteMapExtensions: () => ({ executeMapExtensions: vi.fn(), isExecuting: false, extensions: [] }),
}));
vi.mock('../../service/mapExtensions.service', () => ({
  useMapExtensionsService: () => ({ compileFunction: vi.fn() }),
}));
vi.mock('../../components/core/Page', () => ({
  default: ({ bodyContent }: { bodyContent: React.ReactNode }) => <div data-testid="page-frame">{bodyContent}</div>,
}));

import UpdateMaps from '../../components/integration/UpdateMaps';

// The menu library measures its list with a ResizeObserver, which jsdom does not have.
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const OPEN = 'Open Cross Reference Table';
const integration = { id: 'ipi-1', environmentId: 'env-1', integrationPackId: 'pack-1', integrationPackName: 'Pack' } as never;

const platform = (id: string, type: string, configuration: Record<string, unknown>) => ({
  id,
  type,
  cacheType: 'None',
  Configuration: configuration,
  Inputs: { Input: [{ key: 1, name: 'In' }] },
  Outputs: { Output: [{ key: 1, name: 'Out' }] },
});
const lookup = (id: string, lookupTableId: string) =>
  platform(id, 'CrossRefLookup', {
    CrossReferenceLookup: { lookupTableId, Inputs: { Input: [] }, Outputs: { Output: [] } },
  });

/** A map extension the way the platform returns it, with a direct lookup, a wrapped one and a plain function. */
const mapExtension = (over: Record<string, unknown> = {}) => ({
  id: 'ext-1',
  mapId: 'map-1',
  name: 'Source - Destination',
  environmentId: 'env-1',
  extensionGroupId: 'installed-process',
  processId: 'original-process',
  Map: {
    SourceProfile: { Node: [] },
    DestinationProfile: { Node: [] },
    ExtendedMappings: { Mapping: [] },
    ExtendedFunctions: {
      Function: [
        lookup('direct', 'table-component-id'),
        platform('wrapped', 'UserDefined', { UserDefinedFunction: { id: 'udf-component-id' } }),
        platform('date', 'CurrentDate', {}),
      ],
    },
  },
  ...over,
});

const crt = (extra: Record<string, unknown> = { enabled: true }, mapping?: Record<string, unknown>) => {
  ctx.boomiConfig = { components: { k: { crossReferenceTables: extra, ...(mapping ? { mapping } : {}) } } };
};

type Props = { wizard?: boolean; onBack?: () => void; onOpenCrossReference?: (t: { tableId: string; processId?: string }) => void };
const mount = (props: Props = {}) =>
  render(<UpdateMaps componentKey="k" active={true} wizard={props.wizard ?? false} integration={integration} {...props} />);

const cardOf = (id: string) => document.querySelector(`[data-fn-key="${id}"]`) as HTMLElement;
const menuOf = async (user: ReturnType<typeof userEvent.setup>, id: string) => {
  const card = cardOf(id);
  expect(card).not.toBeNull();
  await user.click(within(card).getByRole('button', { name: 'Open options' }));
  const items = within(card).getAllByRole('menuitem').map((el) => el.textContent as string);
  return { card, items };
};
const chooseOpen = async (user: ReturnType<typeof userEvent.setup>, id = 'direct') => {
  const { card } = await menuOf(user, id);
  await user.click(within(card).getByRole('menuitem', { name: OPEN }));
};

beforeEach(() => {
  ctx.boomiConfig = {};
  ctx.renderComponent.mockReset();
  ctx.setPageIsLoading.mockReset();
  hook.maps = [mapExtension()];
});

// Both canvases share the Transformations column, so the same checks run on each.
describe.each([
  ['flat canvas', undefined],
  ['tree canvas', { useTreeMode: true }],
] as const)('standalone Update Maps, %s', (_name, mapping) => {
  it('opens the cross reference table screen with the table and the process of the open map', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    crt({ enabled: true }, mapping);
    mount({ onBack });
    await chooseOpen(user);

    expect(ctx.renderComponent).toHaveBeenCalledTimes(1);
    expect(ctx.renderComponent).toHaveBeenCalledWith({
      component: 'UpdateCrossReferences',
      props: {
        componentKey: 'k',
        integration,
        initialTableId: 'table-component-id',
        initialProcessId: 'installed-process',
        onBack,
      },
    });
    // Nothing else happens on the map screen.
    expect(onBack).not.toHaveBeenCalled();
  });

  it('shows the item first on a direct lookup and on no other card', async () => {
    const user = userEvent.setup();
    crt({ enabled: true }, mapping);
    mount();
    expect((await menuOf(user, 'direct')).items).toEqual([OPEN, 'Delete Transformation']);
    await user.keyboard('{Escape}');
    expect((await menuOf(user, 'wrapped')).items).toEqual(['Delete Transformation']);
    await user.keyboard('{Escape}');
    expect((await menuOf(user, 'date')).items).toEqual(['Delete Transformation']);
    expect(ctx.renderComponent).not.toHaveBeenCalled();
  });

  it('shows no item when the feature is off or not set, and the menu is as it was', async () => {
    const user = userEvent.setup();
    for (const config of [undefined, { enabled: false }, { wizardStep: true }, { enabled: 'yes' }]) {
      if (config) crt(config, mapping);
      else ctx.boomiConfig = mapping ? { components: { k: { mapping } } } : {};
      const { unmount } = mount();
      expect((await menuOf(user, 'direct')).items).toEqual(['Delete Transformation']);
      expect(screen.queryByText(OPEN)).toBeNull();
      unmount();
    }
    expect(ctx.renderComponent).not.toHaveBeenCalled();
  });
});

describe('the process of the open map', () => {
  it('is the process of the map when the map has no group (a single install has an empty one)', async () => {
    const user = userEvent.setup();
    crt();
    hook.maps = [mapExtension({ extensionGroupId: '' })];
    mount({ onBack: vi.fn() });
    await chooseOpen(user);
    expect(ctx.renderComponent.mock.calls[0][0].props.initialProcessId).toBe('original-process');
  });

  it('is the process of the map when the group is missing altogether', async () => {
    const user = userEvent.setup();
    crt();
    hook.maps = [mapExtension({ extensionGroupId: undefined })];
    mount({ onBack: vi.fn() });
    await chooseOpen(user);
    expect(ctx.renderComponent.mock.calls[0][0].props.initialProcessId).toBe('original-process');
  });

  it('is left out when the map has neither, and the table is still asked for', async () => {
    const user = userEvent.setup();
    crt();
    hook.maps = [mapExtension({ extensionGroupId: undefined, processId: undefined })];
    mount({ onBack: vi.fn() });
    await chooseOpen(user);
    const { props } = ctx.renderComponent.mock.calls[0][0];
    expect(props.initialTableId).toBe('table-component-id');
    expect(props.initialProcessId).toBeUndefined();
  });

  it('is the one of the map that is open, not of the first map in the list', async () => {
    const user = userEvent.setup();
    crt();
    const second = mapExtension({
      id: 'ext-2',
      mapId: 'map-2',
      name: 'Other - Pair',
      extensionGroupId: 'second-installed-process',
    });
    (second.Map.ExtendedFunctions.Function as unknown[]) = [lookup('direct', 'second-table-id')];
    hook.maps = [mapExtension(), second];
    mount({ onBack: vi.fn() });

    await user.click(screen.getByRole('button', { name: /Map \(2\)/ }));
    await user.click(await screen.findByRole('option', { name: /Other - Pair/ }));
    await waitFor(() => expect(cardOf('direct')).not.toBeNull());
    await chooseOpen(user);

    const { props } = ctx.renderComponent.mock.calls[0][0];
    expect(props.initialTableId).toBe('second-table-id');
    expect(props.initialProcessId).toBe('second-installed-process');
  });
});

describe('the way back from the cross reference table screen', () => {
  it('is the onBack of the map screen when it has one', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    crt();
    mount({ onBack });
    await chooseOpen(user);
    const { props } = ctx.renderComponent.mock.calls[0][0];
    props.onBack();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows the list of integrations when the map screen has no onBack', async () => {
    const user = userEvent.setup();
    crt();
    mount();
    await chooseOpen(user);
    const { props } = ctx.renderComponent.mock.calls[0][0];
    ctx.renderComponent.mockReset();
    props.onBack();
    expect(ctx.renderComponent).toHaveBeenCalledWith({ component: 'Integrations', props: { componentKey: 'k' } });
  });
});

describe('Update Maps in the wizard', () => {
  it('calls the callback with the table and the process, and does not open anything itself', async () => {
    const user = userEvent.setup();
    const onOpenCrossReference = vi.fn();
    crt();
    mount({ wizard: true, onOpenCrossReference });
    expect(screen.queryByTestId('page-frame')).toBeNull();
    await chooseOpen(user);

    expect(onOpenCrossReference).toHaveBeenCalledTimes(1);
    expect(onOpenCrossReference).toHaveBeenCalledWith({ tableId: 'table-component-id', processId: 'installed-process' });
    expect(ctx.renderComponent).not.toHaveBeenCalled();
  });

  it('shows no item without the callback (the wizard has no cross reference step)', async () => {
    const user = userEvent.setup();
    crt();
    mount({ wizard: true });
    expect((await menuOf(user, 'direct')).items).toEqual(['Delete Transformation']);
    expect(ctx.renderComponent).not.toHaveBeenCalled();
  });

  it('shows no item with the feature off, even when it is given the callback', async () => {
    const user = userEvent.setup();
    const onOpenCrossReference = vi.fn();
    crt({ enabled: false });
    mount({ wizard: true, onOpenCrossReference });
    expect((await menuOf(user, 'direct')).items).toEqual(['Delete Transformation']);
    expect(onOpenCrossReference).not.toHaveBeenCalled();
  });
});
