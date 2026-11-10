/**
 * @file FunctionStackCrossReference.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The "Open Cross Reference Table" item on the cards of the Transformations column. A Cross Reference Lookup that
 * does its own lookup passes the id of its table; a lookup wrapped in a User Defined function (no table id on it),
 * a lookup with an empty table id, any other function and a scripting function get no item. Without a handler no
 * card gets one, and the rest of each menu is as it was. The functions are built the way the editor builds them,
 * from the platform's own shape, so the table id travels through `raw` as it does on the map screen.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapExtensionsFunction } from '@boomi/embedkit-sdk';
import FunctionStack, { type FunctionStackProps } from '../../components/integration/FunctionStack';
import { fromMapExtensionsFunctions } from '../../utils/ui-utils';

// The menu library measures its list with a ResizeObserver, which jsdom does not have.
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const OPEN = 'Open Cross Reference Table';

const platform = (id: string, type: string, configuration: Record<string, unknown>): MapExtensionsFunction =>
  ({
    id,
    type,
    cacheType: 'None',
    Configuration: configuration,
    Inputs: { Input: [{ key: 1, name: 'In' }] },
    Outputs: { Output: [{ key: 1, name: 'Out' }] },
  }) as unknown as MapExtensionsFunction;

const lookup = (id: string, lookupTableId?: string) =>
  platform(id, 'CrossRefLookup', {
    CrossReferenceLookup: { lookupTableId, Inputs: { Input: [] }, Outputs: { Output: [] } },
  });

const RAW: MapExtensionsFunction[] = [
  lookup('direct', 'table-component-id'),
  lookup('second', 'another-table-id'),
  // A lookup inside a User Defined function: the function carries no table id.
  platform('wrapped', 'UserDefined', { UserDefinedFunction: { id: 'udf-component-id' } }),
  // A lookup that carries a table id that is empty.
  lookup('empty', ''),
  platform('date', 'CurrentDate', {}),
  platform('script', 'CustomScripting', {
    Scripting: { language: 'Javascript', Script: 'return 1;', Inputs: { Input: [] }, Outputs: { Output: [] } },
  }),
];

const stackProps = (over: Partial<FunctionStackProps> = {}): FunctionStackProps => ({
  functions: fromMapExtensionsFunctions(RAW),
  mappings: [],
  selectedFunction: null,
  selectedSource: null,
  selectedOutput: null,
  inputRefs: { current: new Map() },
  outputRefs: { current: new Map() },
  onSelectFunction: vi.fn(),
  onSelectOutput: vi.fn(),
  onConnectInput: vi.fn(),
  onRemoveMapping: vi.fn(),
  onReorder: vi.fn(),
  onEditTransformation: vi.fn(),
  onDeleteTransformation: vi.fn(),
  onLayoutChange: vi.fn(),
  ...over,
});

/** The menu items of the card whose function id is `id`. */
async function menuOf(user: ReturnType<typeof userEvent.setup>, id: string): Promise<string[]> {
  const card = document.querySelector(`[data-fn-key="${id}"]`) as HTMLElement;
  expect(card).not.toBeNull();
  await user.click(within(card).getByRole('button', { name: 'Open options' }));
  const items = within(card).getAllByRole('menuitem').map((el) => el.textContent as string);
  await user.keyboard('{Escape}');
  return items;
}

describe('the functions as the editor builds them', () => {
  it('keep the table id of a direct lookup, and none for the others', () => {
    const [direct, second, wrapped, empty, date, script] = fromMapExtensionsFunctions(RAW);
    expect(direct.raw?.Configuration?.CrossReferenceLookup?.lookupTableId).toBe('table-component-id');
    expect(second.raw?.Configuration?.CrossReferenceLookup?.lookupTableId).toBe('another-table-id');
    expect(wrapped.raw?.Configuration?.CrossReferenceLookup).toBeUndefined();
    expect(empty.raw?.Configuration?.CrossReferenceLookup?.lookupTableId).toBe('');
    expect(date.raw?.Configuration?.CrossReferenceLookup).toBeUndefined();
    expect(script.raw).toBeUndefined();
  });
});

describe('FunctionStack with a handler for opening the table', () => {
  it('gives a direct lookup the item, first, and passes the id of its table when it is chosen', async () => {
    const user = userEvent.setup();
    const onOpenCrossReference = vi.fn();
    render(<FunctionStack {...stackProps({ onOpenCrossReference })} />);

    const card = document.querySelector('[data-fn-key="direct"]') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Open options' }));
    expect(within(card).getAllByRole('menuitem').map((el) => el.textContent)).toEqual([OPEN, 'Delete Transformation']);
    await user.click(within(card).getByRole('menuitem', { name: OPEN }));
    expect(onOpenCrossReference).toHaveBeenCalledTimes(1);
    expect(onOpenCrossReference).toHaveBeenCalledWith('table-component-id');
  });

  it('passes the table of the card that was used, not another one', async () => {
    const user = userEvent.setup();
    const onOpenCrossReference = vi.fn();
    render(<FunctionStack {...stackProps({ onOpenCrossReference })} />);

    const card = document.querySelector('[data-fn-key="second"]') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Open options' }));
    await user.click(within(card).getByRole('menuitem', { name: OPEN }));
    expect(onOpenCrossReference).toHaveBeenCalledTimes(1);
    expect(onOpenCrossReference).toHaveBeenCalledWith('another-table-id');
  });

  it('shows nothing for a lookup inside a User Defined function, one with an empty id, and other functions', async () => {
    const user = userEvent.setup();
    const onOpenCrossReference = vi.fn();
    render(<FunctionStack {...stackProps({ onOpenCrossReference })} />);

    // Platform-defined functions cannot be edited here, so Delete is all they had, and all they have.
    for (const id of ['wrapped', 'empty', 'date']) {
      expect(await menuOf(user, id)).toEqual(['Delete Transformation']);
    }
    // A scripting function keeps its Edit and Delete.
    expect(await menuOf(user, 'script')).toEqual(['Edit Transformation', 'Delete Transformation']);
    expect(onOpenCrossReference).not.toHaveBeenCalled();
  });
});

describe('FunctionStack without that handler', () => {
  it('gives no card the item, a direct lookup included, and the menus are as they were', async () => {
    const user = userEvent.setup();
    render(<FunctionStack {...stackProps()} />);

    expect(await menuOf(user, 'direct')).toEqual(['Delete Transformation']);
    expect(await menuOf(user, 'wrapped')).toEqual(['Delete Transformation']);
    expect(await menuOf(user, 'script')).toEqual(['Edit Transformation', 'Delete Transformation']);
    expect(screen.queryByText(OPEN)).toBeNull();
  });
});
