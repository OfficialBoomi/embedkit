import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ListSortButton from '../../components/ui/ListSortButton';
import type { ListSort, ListSortBy } from '../../utils/listSort';

const ALL: ListSortBy[] = ['name', 'description', 'environment', 'created', 'lastViewed'];

const setup = (value?: ListSort, options: ListSortBy[] = ALL) => {
  const onChange = vi.fn();
  render(<ListSortButton value={value} onChange={onChange} options={options} />);
  return { onChange };
};

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Sort by/ }));

describe('ListSortButton', () => {
  it('shows Default order on the button and keeps the menu closed at first', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Sort by: Default order' })).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lists Default order plus every option with its starting direction', () => {
    setup();
    openMenu();
    const rows = screen.getAllByRole('menuitemradio').map((r) => r.textContent);
    expect(rows).toEqual([
      'Default order',
      'NameA to Z',
      'DescriptionA to Z',
      'EnvironmentA to Z',
      'CreatedNewest first',
      'Last viewedMost recent first',
    ]);
  });

  it('marks Default order as selected when there is no sort', () => {
    setup();
    openMenu();
    expect(screen.getByRole('menuitemradio', { name: 'Default order' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: /^Name/ }).getAttribute('aria-checked')).toBe('false');
  });

  it('shows the active sort on the button and in the menu', () => {
    setup({ by: 'lastViewed', dir: 'desc' });
    expect(screen.getByRole('button', { name: 'Sort by: Last viewed' })).toBeTruthy();
    openMenu();
    expect(screen.getByRole('menuitemradio', { name: /^Last viewed/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: 'Default order' }).getAttribute('aria-checked')).toBe('false');
  });

  it('picking an option starts it in its natural direction and closes the menu', () => {
    const { onChange } = setup();
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^Created/ }));
    expect(onChange).toHaveBeenCalledWith({ by: 'created', dir: 'desc' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('picking the active option flips it and keeps the menu open', () => {
    const { onChange } = setup({ by: 'name', dir: 'asc' });
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^Name/ }));
    expect(onChange).toHaveBeenCalledWith({ by: 'name', dir: 'desc' });
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('Default order clears the sort', () => {
    const { onChange } = setup({ by: 'name', dir: 'asc' });
    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Default order' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('offers only the options it is given', () => {
    setup(undefined, ['name', 'lastViewed']);
    openMenu();
    expect(screen.getAllByRole('menuitemradio').map((r) => r.textContent)).toEqual([
      'Default order',
      'NameA to Z',
      'Last viewedMost recent first',
    ]);
  });

  it('closes on Escape', () => {
    setup();
    openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
