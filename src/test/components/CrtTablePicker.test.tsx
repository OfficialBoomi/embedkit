import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CrtTablePicker, {
  type CrtPickerOption,
  type CrtTablePickerProps,
} from '../../components/integration/crt/CrtTablePicker';

const opt = (key: string, name: string, extra: Partial<CrtPickerOption> = {}): CrtPickerOption => ({
  key,
  name,
  description: `${name} description`,
  dirty: false,
  ...extra,
});

// Orders and Regions can be chosen, Carriers and Units cannot, Zones can again.
const OPTIONS: CrtPickerOption[] = [
  opt('p1:orders', 'Orders', { description: 'Store Sync | Overridden | 42 rows' }),
  opt('p2:carriers', 'Carriers', {
    description: 'Shipping | Default | 9 rows',
    disabledReason: 'Needs a newer version',
  }),
  opt('p1:regions', 'Regions', { description: 'Store Sync | Default | 5 rows', dirty: true }),
  opt('p2:units', 'Units', { description: 'Shipping | Default | 3 rows', disabledReason: 'Not shared yet' }),
  opt('p1:zones', 'Zones', { description: 'Store Sync | Default | 7 rows' }),
];

// More than six options, so the search box shows.
const MANY: CrtPickerOption[] = [
  ...OPTIONS,
  opt('p3:alpha', 'Alpha', { description: 'Billing | Default | 1 row' }),
  opt('p3:beta', 'Beta', { description: 'Billing | Overridden | 2 rows' }),
];

const setup = (props: Partial<CrtTablePickerProps> = {}) => {
  const onSelect = vi.fn();
  const user = userEvent.setup();
  const utils = render(
    <CrtTablePicker options={OPTIONS} selectedKey="p1:orders" onSelect={onSelect} {...props} />
  );
  const button = () => screen.getByRole('button', { name: /Table/ });
  return { ...utils, user, onSelect, button };
};

/** The option row whose name line is exactly `name`. */
const option = (name: string): HTMLElement =>
  screen.getAllByRole('option').find((o) => within(o).queryByText(name) !== null) as HTMLElement;

const nameOf = (row: Element): string | undefined =>
  row.querySelector('.boomi-crt-tp-name-row .boomi-crt-tp-trunc')?.textContent ?? undefined;

/** The name of the highlighted option, or undefined when nothing is highlighted. */
const active = (): string | undefined => {
  const row = document.querySelector('.boomi-option--active');
  return row ? nameOf(row) : undefined;
};

describe('CrtTablePicker closed', () => {
  it('shows the label, the selected name and the popup attributes', () => {
    const { container, button } = setup();
    expect(container.querySelector('label')?.textContent).toBe('Table');
    expect(button().textContent).toBe('Orders');
    expect(button().getAttribute('aria-haspopup')).toBe('listbox');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('names the button with the label and the selected table', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Table Orders' })).toBeTruthy();
  });

  it('uses a custom label', () => {
    const { container } = setup({ label: 'Lookup' });
    expect(container.querySelector('label')?.textContent).toBe('Lookup');
  });

  it('shows a placeholder when nothing is selected', () => {
    const { button } = setup({ selectedKey: null });
    expect(button().textContent).toBe('Please select');
  });

  it('follows the selectedKey prop', () => {
    const { rerender, button, onSelect } = setup();
    rerender(<CrtTablePicker options={OPTIONS} selectedKey="p1:zones" onSelect={onSelect} />);
    expect(button().textContent).toBe('Zones');
  });
});

describe('CrtTablePicker open and select', () => {
  it('opens on click and lists every option with its muted line', async () => {
    const { user, button } = setup();
    await user.click(button());
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox')).toBeTruthy();
    const rows = screen.getAllByRole('option');
    expect(rows.map(nameOf)).toEqual(['Orders', 'Carriers', 'Regions', 'Units', 'Zones']);
    expect(within(option('Orders')).getByText('Store Sync | Overridden | 42 rows')).toBeTruthy();
  });

  it('marks the selected option with aria-selected', async () => {
    const { user, button } = setup({ selectedKey: 'p1:regions' });
    await user.click(button());
    expect(option('Regions').getAttribute('aria-selected')).toBe('true');
    expect(option('Orders').getAttribute('aria-selected')).toBe('false');
  });

  it('selects by click, closes and gives focus back to the button', async () => {
    const { user, button, onSelect } = setup();
    await user.click(button());
    await user.click(option('Zones'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('p1:zones');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('closes when the button is pressed again', async () => {
    const { user, button, onSelect } = setup();
    await user.click(button());
    await user.click(button());
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('moves focus into the list when it opens', async () => {
    const { user, button } = setup();
    await user.click(button());
    expect(document.activeElement).toBe(screen.getByRole('listbox'));
  });

  it('starts the highlight on the selected option', async () => {
    const { user, button } = setup({ selectedKey: 'p1:regions' });
    await user.click(button());
    expect(active()).toBe('Regions');
    expect(screen.getByRole('listbox').getAttribute('aria-activedescendant')).toBe(option('Regions').id);
  });

  it('starts on the first enabled option when the selected one is disabled or missing', async () => {
    const { user, button } = setup({ selectedKey: 'p2:carriers' });
    await user.click(button());
    expect(active()).toBe('Orders');
  });
});

describe('CrtTablePicker keyboard', () => {
  it('opens from the closed button with Enter, Space and the arrow keys', async () => {
    for (const key of ['{Enter}', ' ', '{ArrowDown}', '{ArrowUp}']) {
      const { user, button, unmount } = setup();
      button().focus();
      await user.keyboard(key);
      expect(screen.queryByRole('listbox'), key).not.toBeNull();
      unmount();
    }
  });

  it('moves the highlight with the arrows and skips disabled options', async () => {
    const { user, button } = setup();
    button().focus();
    await user.keyboard('{Enter}');
    expect(active()).toBe('Orders');
    await user.keyboard('{ArrowDown}');
    expect(active()).toBe('Regions');
    await user.keyboard('{ArrowDown}');
    expect(active()).toBe('Zones');
    await user.keyboard('{ArrowUp}');
    expect(active()).toBe('Regions');
    expect(screen.getByRole('listbox').getAttribute('aria-activedescendant')).toBe(option('Regions').id);
  });

  it('wraps at both ends', async () => {
    const { user, button } = setup({ selectedKey: 'p1:zones' });
    button().focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}');
    expect(active()).toBe('Orders');
    await user.keyboard('{ArrowUp}');
    expect(active()).toBe('Zones');
  });

  it('jumps with Home and End to the first and last enabled option', async () => {
    const options = [
      opt('a', 'Aaa', { disabledReason: 'No' }),
      opt('b', 'Bbb'),
      opt('c', 'Ccc'),
      opt('d', 'Ddd', { disabledReason: 'No' }),
    ];
    const { user, button } = setup({ options, selectedKey: null });
    button().focus();
    await user.keyboard('{Enter}');
    expect(active()).toBe('Bbb');
    await user.keyboard('{End}');
    expect(active()).toBe('Ccc');
    await user.keyboard('{Home}');
    expect(active()).toBe('Bbb');
  });

  it('selects the highlighted option with Enter', async () => {
    const { user, button, onSelect } = setup();
    button().focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('p1:regions');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('selects with Space on the list', async () => {
    const { user, button, onSelect } = setup();
    button().focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledWith('p1:regions');
  });

  it('selects the option under the pointer on Enter', async () => {
    const { user, button, onSelect } = setup();
    await user.click(button());
    await user.hover(option('Zones'));
    expect(active()).toBe('Zones');
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('p1:zones');
  });

  it('does nothing on Enter or the arrows when every option is disabled', async () => {
    const options = [opt('a', 'Aaa', { disabledReason: 'No' }), opt('b', 'Bbb', { disabledReason: 'No' })];
    const { user, button, onSelect } = setup({ options, selectedKey: null });
    button().focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{ArrowUp}{Home}{End}{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeNull();
    expect(active()).toBeUndefined();
  });

  it('closes on Tab', async () => {
    const { user, button } = setup();
    button().focus();
    await user.keyboard('{Enter}');
    await user.tab();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('CrtTablePicker Escape', () => {
  it('closes without selecting and returns focus to the button', async () => {
    const { user, button, onSelect } = setup();
    await user.click(button());
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button());
  });

  it('closes from the search box too', async () => {
    const { user, button, onSelect } = setup({ options: MANY });
    await user.click(button());
    await user.keyboard('zo{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button());
  });

  it('is stopped while the list is open, so full screen does not also exit', async () => {
    const outer = vi.fn();
    const user = userEvent.setup();
    render(
      <div onKeyDown={(e) => outer(e.key)}>
        <CrtTablePicker options={OPTIONS} selectedKey="p1:orders" onSelect={vi.fn()} />
      </div>
    );
    await user.click(screen.getByRole('button', { name: /Table/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(outer).not.toHaveBeenCalled();
  });

  it('is stopped from the search box as well', async () => {
    const outer = vi.fn();
    const user = userEvent.setup();
    render(
      <div onKeyDown={(e) => outer(e.key)}>
        <CrtTablePicker options={MANY} selectedKey="p1:orders" onSelect={vi.fn()} />
      </div>
    );
    await user.click(screen.getByRole('button', { name: /Table/ }));
    await user.keyboard('{Escape}');
    expect(outer).not.toHaveBeenCalled();
  });

  it('passes through when the list is closed', async () => {
    const outer = vi.fn();
    const user = userEvent.setup();
    render(
      <div onKeyDown={(e) => outer(e.key)}>
        <CrtTablePicker options={OPTIONS} selectedKey="p1:orders" onSelect={vi.fn()} />
      </div>
    );
    screen.getByRole('button', { name: /Table/ }).focus();
    await user.keyboard('{Escape}');
    expect(outer).toHaveBeenCalledWith('Escape');
  });
});

describe('CrtTablePicker closing', () => {
  it('closes on a press outside', async () => {
    const { user, button } = setup();
    await user.click(button());
    await user.click(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not close on a press inside the list', async () => {
    const { user, button } = setup({ options: MANY });
    await user.click(button());
    await user.click(screen.getByRole('textbox', { name: 'Search tables' }));
    expect(screen.queryByRole('listbox')).not.toBeNull();
  });

  it('closes when focus moves to another element', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <CrtTablePicker options={OPTIONS} selectedKey="p1:orders" onSelect={onSelect} />
        <button type="button">Elsewhere</button>
      </>
    );
    await user.click(screen.getByRole('button', { name: /Table/ }));
    expect(screen.queryByRole('listbox')).not.toBeNull();
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus());
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('stays open when focus goes nowhere (a press on empty space is handled by the press listener)', async () => {
    const { user, button } = setup();
    await user.click(button());
    fireEvent.blur(screen.getByRole('listbox'), { relatedTarget: null });
    expect(screen.queryByRole('listbox')).not.toBeNull();
  });
});

describe('CrtTablePicker disabled options', () => {
  it('lists a disabled option with its reason, aria-disabled and a tooltip', async () => {
    const { user, button } = setup();
    await user.click(button());
    const carriers = option('Carriers');
    expect(carriers.getAttribute('aria-disabled')).toBe('true');
    expect(carriers.getAttribute('title')).toBe('Needs a newer version');
    expect(within(carriers).getByText('Needs a newer version')).toBeTruthy();
    // The reason takes the place of the description.
    expect(within(carriers).queryByText('Shipping | Default | 9 rows')).toBeNull();
    expect(option('Orders').getAttribute('aria-disabled')).toBeNull();
    expect(option('Orders').getAttribute('title')).toBeNull();
  });

  it('ignores a click on a disabled option and stays open', async () => {
    const { user, button, onSelect } = setup();
    await user.click(button());
    await user.click(option('Carriers'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeNull();
  });

  it('keeps focus in the search box when a disabled option is pressed', async () => {
    const { user, button } = setup({ options: MANY });
    await user.click(button());
    const box = screen.getByRole('textbox', { name: 'Search tables' });
    expect(document.activeElement).toBe(box);
    await user.click(option('Carriers'));
    expect(document.activeElement).toBe(box);
  });

  it('never highlights a disabled option, not even under the pointer', async () => {
    const { user, button } = setup();
    await user.click(button());
    await user.hover(option('Carriers'));
    expect(option('Carriers').className).not.toContain('boomi-option--active');
    expect(active()).toBe('Orders');
    await user.hover(option('Zones'));
    expect(active()).toBe('Zones');
  });
});

describe('CrtTablePicker search', () => {
  it('shows the search box only with more than six options', async () => {
    const six = [...OPTIONS, opt('x', 'Xxx')];
    const seven = [...six, opt('y', 'Yyy')];
    const a = setup({ options: six });
    await a.user.click(a.button());
    expect(screen.queryByRole('textbox')).toBeNull();
    a.unmount();
    const b = setup({ options: seven });
    await b.user.click(b.button());
    expect(screen.queryByRole('textbox', { name: 'Search tables' })).not.toBeNull();
  });

  it('focuses the search box on open', async () => {
    const { user, button } = setup({ options: MANY });
    await user.click(button());
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search tables' }));
  });

  it('filters by name, case insensitive', async () => {
    const { user, button } = setup({ options: MANY });
    await user.click(button());
    await user.keyboard('ALP');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(option('Alpha')).toBeTruthy();
  });

  it('filters by description', async () => {
    const { user, button } = setup({ options: MANY });
    await user.click(button());
    await user.keyboard('billing');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'AlphaBilling | Default | 1 row',
      'BetaBilling | Overridden | 2 rows',
    ]);
  });

  it('filters by the disabled reason, and still lists the disabled option', async () => {
    const { user, button } = setup({ options: MANY });
    await user.click(button());
    await user.keyboard('NEWER VERSION');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(option('Carriers').getAttribute('aria-disabled')).toBe('true');
  });

  it('shows a message and no list when nothing matches, and Enter does nothing', async () => {
    const { user, button, onSelect } = setup({ options: MANY });
    await user.click(button());
    await user.keyboard('zzzz{Enter}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('No options found')).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('moves the highlight to the first enabled match and selects it with Enter', async () => {
    const { user, button, onSelect } = setup({ options: MANY });
    await user.click(button());
    await user.keyboard('store');
    // Orders, Regions and Zones match 'store' through their description; Orders is first.
    expect(active()).toBe('Orders');
    await user.keyboard('{ArrowDown}');
    expect(active()).toBe('Regions');
    expect(screen.getByRole('textbox', { name: 'Search tables' }).getAttribute('aria-activedescendant')).toBe(
      option('Regions').id
    );
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('p1:regions');
  });

  it('skips disabled matches for the highlight', async () => {
    const { user, button } = setup({ options: MANY });
    await user.click(button());
    await user.keyboard('shipping');
    // Carriers and Units both match and both are disabled.
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(active()).toBeUndefined();
  });

  it('starts empty each time the list opens', async () => {
    const { user, button } = setup({ options: MANY });
    await user.click(button());
    await user.keyboard('alp');
    await user.keyboard('{Escape}');
    await user.click(button());
    expect((screen.getByRole('textbox', { name: 'Search tables' }) as HTMLInputElement).value).toBe('');
    expect(screen.getAllByRole('option')).toHaveLength(MANY.length);
  });

  it('keeps Home, End and typed keys for the search box once there is text', async () => {
    const outer = vi.fn();
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <div onKeyDown={(e) => outer(e.key)}>
        <CrtTablePicker options={MANY} selectedKey="p1:orders" onSelect={onSelect} />
      </div>
    );
    await user.click(screen.getByRole('button', { name: /Table/ }));
    await user.keyboard('s');
    // Typing never reaches the host page.
    expect(outer).not.toHaveBeenCalled();
    // A space typed in the box is text, not a choice.
    await user.keyboard(' ');
    expect(onSelect).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox', { name: 'Search tables' }) as HTMLInputElement).value).toBe('s ');
    await user.keyboard('{Home}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Search tables' })).toBe(document.activeElement);
  });

  it('uses Home and End for the list while the search box is empty', async () => {
    const { user, button } = setup({ options: MANY, selectedKey: null });
    await user.click(button());
    await user.keyboard('{End}');
    expect(active()).toBe('Beta');
    await user.keyboard('{Home}');
    expect(active()).toBe('Orders');
  });
});

describe('CrtTablePicker unsaved dot', () => {
  it('shows a dot before the name of a dirty option only', async () => {
    const { user, button } = setup();
    await user.click(button());
    expect(within(option('Regions')).getByRole('img', { name: 'Unsaved changes' })).toBeTruthy();
    expect(within(option('Orders')).queryByRole('img')).toBeNull();
    expect(screen.getAllByRole('img', { name: 'Unsaved changes' })).toHaveLength(1);
  });

  it('shows the dot on the closed button when the selected option is dirty', () => {
    const { button } = setup({ selectedKey: 'p1:regions' });
    expect(within(button()).getByRole('img', { name: 'Unsaved changes' })).toBeTruthy();
  });

  it('shows no dot on the closed button when the selected option is clean', () => {
    const { button } = setup({ selectedKey: 'p1:orders' });
    expect(within(button()).queryByRole('img')).toBeNull();
  });

  it('shows no dot for another dirty option while it is not selected', () => {
    const { button } = setup({ selectedKey: 'p1:zones' });
    expect(within(button()).queryByRole('img')).toBeNull();
  });
});

describe('CrtTablePicker compact', () => {
  it('renders without a visible label and names the button itself', () => {
    const { container } = setup({ compact: true });
    expect(container.querySelector('label')).toBeNull();
    expect(container.querySelector('.boomi-crt-tp--compact')).not.toBeNull();
    const button = screen.getByRole('button', { name: 'Table: Orders' });
    expect(button.getAttribute('aria-haspopup')).toBe('listbox');
  });

  it('uses the custom label in the accessible name', () => {
    setup({ compact: true, label: 'Lookup' });
    expect(screen.getByRole('button', { name: 'Lookup: Orders' })).toBeTruthy();
  });

  it('mentions unsaved changes in the name when the selected option is dirty', () => {
    setup({ compact: true, selectedKey: 'p1:regions' });
    expect(screen.getByRole('button', { name: 'Table: Regions (unsaved changes)' })).toBeTruthy();
  });

  it('opens, selects and closes the same way as the normal form', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CrtTablePicker compact options={OPTIONS} selectedKey="p1:orders" onSelect={onSelect} />);
    const button = screen.getByRole('button', { name: /Table/ });
    await user.click(button);
    expect(screen.getByRole('listbox')).toBeTruthy();
    await user.click(option('Regions'));
    expect(onSelect).toHaveBeenCalledWith('p1:regions');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
