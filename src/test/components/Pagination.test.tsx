import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../context/pluginContext', () => ({
  usePluginOptional: () => ({}),
  usePlugin: () => ({ boomiConfig: {} }),
}));

import Pagination from '../../components/ui/Pagination';

const DEFAULT_ROOT_CLASS = 'flex justify-end items-center space-x-2 mt-4';

const setup = (props: Partial<React.ComponentProps<typeof Pagination>> = {}) => {
  const onPageChange = vi.fn();
  const utils = render(<Pagination currentPage={2} totalPages={4} onPageChange={onPageChange} {...props} />);
  const root = utils.container.firstElementChild as HTMLElement;
  return { ...utils, root, onPageChange };
};

describe('Pagination defaults', () => {
  it('keeps today\'s wrapper classes and adds no inline style', () => {
    const { root } = setup();
    expect(root.className).toBe(DEFAULT_ROOT_CLASS);
    expect(root.getAttribute('style')).toBeNull();
  });

  it('marks the current page and leaves the others plain', () => {
    setup();
    expect(screen.getByText('2').className).toContain('boomi-pagination__page--active');
    expect(screen.getByText('3').className).toContain('boomi-pagination__page');
    expect(screen.getByText('3').className).not.toContain('boomi-pagination__page--active');
  });

  it('still calls onPageChange for a page click and the Go button', () => {
    const { onPageChange } = setup();
    fireEvent.click(screen.getByText('3'));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } });
    fireEvent.click(screen.getByText('Go'));
    expect(onPageChange).toHaveBeenLastCalledWith(4);
  });
});

describe('Pagination position and alignment', () => {
  it('applies alignment', () => {
    expect(setup({ alignment: 'start' }).root.className).toContain('justify-start');
  });

  it('applies position', () => {
    expect(setup({ position: 'top' }).root.className).toContain('mb-4');
    expect(setup({ position: 'sticky-top' }).root.className).toContain('sticky');
    expect(setup({ position: 'fixed-bottom' }).root.className).toContain('fixed');
  });
});

describe('Pagination styles', () => {
  it('applies root and input styles', () => {
    const { root } = setup({ styles: { root: { backgroundColor: 'red' }, input: { width: 80 } } });
    expect(root.style.backgroundColor).toBe('red');
    expect(screen.getByRole('spinbutton').style.width).toBe('80px');
  });

  it('applies pageButton to every page and activePageButton on top for the current one', () => {
    setup({
      styles: { pageButton: { borderRadius: 2, color: 'blue' }, activePageButton: { color: 'green' } },
    });
    const other = screen.getByText('3');
    const active = screen.getByText('2');
    expect(other.style.color).toBe('blue');
    expect(other.style.borderRadius).toBe('2px');
    expect(active.style.borderRadius).toBe('2px');
    expect(active.style.color).toBe('green');
  });

  it('applies activePageButton only to the current page', () => {
    setup({ styles: { activePageButton: { fontWeight: 700 } } });
    expect(screen.getByText('2').style.fontWeight).toBe('700');
    expect(screen.getByText('3').style.fontWeight).toBe('');
  });
});
