/**
 * @file crtGridAltKeys.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Characters typed with Alt held start a cell edit in the mounted grid, the way any typed character
 * does: AltGr on Windows and Linux (reported as Ctrl and Alt together, or as the AltGraph modifier)
 * and Option on a Mac. A plain Alt chord on Windows stays a shortcut and starts nothing, and a read
 * only table answers with the usual hint. The key rules themselves are in crtKeymap.test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createCrtStore, type CrtStore } from '../../utils/crt/crtStore';
import type { CrtTableData } from '../../utils/crt/crtTypes';
import CrtGrid from '../../components/integration/crt/CrtGrid';

// jsdom has no layout: give the grid a size, or it draws no rows.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(32 + 10 * 32);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const table = (overridden: boolean): CrtTableData => {
  const data = [
    ['k0', 'v0'],
    ['k1', 'v1'],
    ['k2', 'v2'],
  ];
  return {
    id: 't',
    name: 'Codes',
    processId: 'p',
    processName: 'Process',
    matchType: 'exact',
    columns: ['Key', 'Value'],
    defaultRows: overridden ? [] : data,
    overrideRows: overridden ? data : null,
  };
};

function mount(store: CrtStore) {
  const onBlocked = vi.fn();
  render(<CrtGrid store={store} ariaLabel="Codes" onBlocked={onBlocked} onInfo={vi.fn()} onNotice={vi.fn()} />);
  const grid = screen.getByRole('grid');
  grid.focus();
  return { grid, onBlocked };
}

const editor = (): HTMLInputElement | null => document.querySelector<HTMLInputElement>('.boomi-crt-cell-input');

/** Presses a key on the grid and says whether the browser may still act on it. */
const press = (grid: HTMLElement, init: Parameters<typeof fireEvent.keyDown>[1]): boolean => {
  let allowed = true;
  act(() => {
    allowed = fireEvent.keyDown(grid, init);
  });
  return allowed;
};

describe('AltGr in the grid', () => {
  it('a character typed with Ctrl and Alt starts an edit that holds the character', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const m = mount(createCrtStore(table(true)));
    expect(press(m.grid, { key: '@', ctrlKey: true, altKey: true })).toBe(false);
    expect(editor()).not.toBeNull();
    expect(editor()?.value).toBe('@');
  });

  it('commits into the active cell like any typed text', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const store = createCrtStore(table(true));
    const m = mount(store);
    press(m.grid, { key: '€', ctrlKey: true, altKey: true });
    const input = editor() as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: '€5' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(store.getCell(0, 0)).toBe('€5');
  });

  it('works when the browser only says AltGraph is down', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
    const m = mount(createCrtStore(table(true)));
    const altGraph = vi.spyOn(KeyboardEvent.prototype, 'getModifierState').mockImplementation((name) => name === 'AltGraph');
    expect(press(m.grid, { key: '{', altKey: true })).toBe(false);
    expect(editor()?.value).toBe('{');
    expect(altGraph).toHaveBeenCalled();
  });

  it('plain Alt with a letter on Windows starts nothing and is left to the browser', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const m = mount(createCrtStore(table(true)));
    expect(press(m.grid, { key: 'f', altKey: true })).toBe(true);
    expect(editor()).toBeNull();
  });

  it('on a table that cannot be edited it gives the usual hint', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const m = mount(createCrtStore(table(false)));
    press(m.grid, { key: '@', ctrlKey: true, altKey: true });
    expect(editor()).toBeNull();
    expect(m.onBlocked).toHaveBeenCalledTimes(1);
  });
});

describe('Option in the grid on a Mac', () => {
  it('a character typed with Option starts an edit', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const m = mount(createCrtStore(table(true)));
    expect(press(m.grid, { key: 'å', altKey: true })).toBe(false);
    expect(editor()?.value).toBe('å');
  });

  it('Option with an arrow still does nothing', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const m = mount(createCrtStore(table(true)));
    press(m.grid, { key: 'ArrowDown', altKey: true });
    expect(editor()).toBeNull();
  });

  it('Command with Option never starts an edit', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const m = mount(createCrtStore(table(true)));
    expect(press(m.grid, { key: 'i', altKey: true, metaKey: true })).toBe(true);
    expect(editor()).toBeNull();
  });
});
