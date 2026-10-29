/**
 * @file pagination.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { describe, it, expect } from 'vitest';
import {
  PAGE_SIZE_DEFAULTS,
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE,
  resolvePageSize,
  resolvePaginationOptions,
  paginationRootClass,
  paginationPlacement,
  sanitizePaginationStyles,
} from '../../utils/pagination';

describe('PAGE_SIZE_DEFAULTS', () => {
  it('keeps every list at the size it has today', () => {
    expect(PAGE_SIZE_DEFAULTS).toEqual({
      integrations: 12,
      executionHistory: 20,
      agents: 10,
      agentTiles: 10,
      agentLauncher: 10,
      users: 12,
      cors: 12,
    });
  });
});

describe('resolvePageSize', () => {
  it('uses the list default when nothing is set', () => {
    expect(resolvePageSize(undefined, 'integrations')).toBe(12);
    expect(resolvePageSize(undefined, 'agents')).toBe(10);
    expect(resolvePageSize(undefined, 'executionHistory')).toBe(20);
  });

  it('keeps a valid number as is', () => {
    expect(resolvePageSize(6, 'integrations')).toBe(6);
    expect(resolvePageSize(MIN_PAGE_SIZE, 'integrations')).toBe(1);
    expect(resolvePageSize(MAX_PAGE_SIZE, 'integrations')).toBe(30);
  });

  it('clamps to 1 to 30', () => {
    expect(resolvePageSize(0, 'integrations')).toBe(1);
    expect(resolvePageSize(-5, 'integrations')).toBe(1);
    expect(resolvePageSize(31, 'integrations')).toBe(30);
    expect(resolvePageSize(500, 'integrations')).toBe(30);
  });

  it('rounds a decimal down', () => {
    expect(resolvePageSize(6.9, 'integrations')).toBe(6);
  });

  it('accepts a numeric string', () => {
    expect(resolvePageSize('8', 'integrations')).toBe(8);
  });

  it('falls back to the list default for anything that is not a number', () => {
    for (const bad of ['abc', '', null, NaN, Infinity, {}, [], true]) {
      expect(resolvePageSize(bad, 'integrations')).toBe(12);
    }
  });
});

describe('resolvePaginationOptions', () => {
  it('defaults to bottom, end, no styles', () => {
    expect(resolvePaginationOptions(undefined)).toEqual({ position: 'bottom', alignment: 'end', styles: {} });
    expect(resolvePaginationOptions({})).toEqual({ position: 'bottom', alignment: 'end', styles: {} });
    expect(resolvePaginationOptions('nope')).toEqual({ position: 'bottom', alignment: 'end', styles: {} });
  });

  it('accepts every documented position and alignment', () => {
    for (const position of ['top', 'bottom', 'sticky-top', 'fixed-bottom']) {
      expect(resolvePaginationOptions({ position }).position).toBe(position);
    }
    for (const alignment of ['start', 'center', 'end']) {
      expect(resolvePaginationOptions({ alignment }).alignment).toBe(alignment);
    }
  });

  it('falls back to the default for an unknown position or alignment', () => {
    const out = resolvePaginationOptions({ position: 'left', alignment: 'middle' });
    expect(out.position).toBe('bottom');
    expect(out.alignment).toBe('end');
  });

  it('passes valid style objects through for each part', () => {
    const out = resolvePaginationOptions({
      styles: { root: { backgroundColor: '#fff' }, input: { width: 64 } },
    });
    expect(out.styles.root).toEqual({ backgroundColor: '#fff' });
    expect(out.styles.input).toEqual({ width: 64 });
    expect(out.styles.pageButton).toBeUndefined();
  });
});

describe('paginationRootClass', () => {
  it('renders exactly today\'s classes by default', () => {
    expect(paginationRootClass('bottom', 'end')).toBe('flex justify-end items-center space-x-2 mt-4');
  });

  it('puts the margin on the list side when the control is on top', () => {
    expect(paginationRootClass('top', 'end')).toBe('flex justify-end items-center space-x-2 mb-4');
  });

  it('applies the alignment', () => {
    expect(paginationRootClass('bottom', 'start')).toContain('justify-start');
    expect(paginationRootClass('bottom', 'center')).toContain('justify-center');
  });

  it('pins sticky-top to the top of the scroll area, with a background and no margin', () => {
    const cls = paginationRootClass('sticky-top', 'end');
    expect(cls).toContain('sticky');
    expect(cls).toContain('top-0');
    expect(cls).toContain('z-[5]');
    expect(cls).toContain('--boomi-pagination-bg');
    expect(cls).not.toMatch(/\bm[tby]-4\b/);
  });

  it('pins fixed-bottom to the bottom of the window, with a background and no margin', () => {
    const cls = paginationRootClass('fixed-bottom', 'end');
    expect(cls).toContain('fixed');
    expect(cls).toContain('bottom-0');
    expect(cls).toContain('inset-x-0');
    expect(cls).toContain('z-[5]');
    expect(cls).toContain('--boomi-pagination-bg');
    expect(cls).not.toMatch(/\bm[tby]-4\b/);
  });
});

describe('paginationPlacement', () => {
  it('renders above the list for top and sticky-top, below for the rest', () => {
    expect(paginationPlacement('top')).toBe('before');
    expect(paginationPlacement('sticky-top')).toBe('before');
    expect(paginationPlacement('bottom')).toBe('after');
    expect(paginationPlacement('fixed-bottom')).toBe('after');
  });
});

describe('sanitizePaginationStyles', () => {
  it('keeps string and number values, including custom properties', () => {
    expect(sanitizePaginationStyles({ backgroundColor: 'red', borderRadius: 4, '--x': '1px' })).toEqual({
      backgroundColor: 'red',
      borderRadius: 4,
      '--x': '1px',
    });
  });

  it('returns undefined for anything that is not a plain object', () => {
    for (const bad of [undefined, null, 'color: red', 5, true, ['a']]) {
      expect(sanitizePaginationStyles(bad)).toBeUndefined();
    }
  });

  it('drops bad values and bad keys', () => {
    const out = sanitizePaginationStyles({
      color: 'blue',
      width: NaN,
      height: null,
      margin: {},
      padding: '',
      'bad key': 'x',
      __proto__: 'x',
      '1abc': 'x',
    } as Record<string, unknown>);
    expect(out).toEqual({ color: 'blue' });
  });

  it('returns undefined when nothing valid is left', () => {
    expect(sanitizePaginationStyles({ width: NaN })).toBeUndefined();
  });
});
