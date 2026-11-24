/**
 * @file crtGridLayout.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The horizontal behaviour of the lookup table grid: only the row number gutter stays in place while
 * the columns scroll, so the first data column moves with the rest. It covers the scroll arithmetic
 * that brings a column into view (the visible band starts after the gutter, for every column), and
 * the header, which marks no column as pinned.
 *
 * jsdom has no layout, so the scroll element is a plain object with the two numbers the arithmetic
 * reads. Not covered here, and only checkable in a browser: that the gutter really holds its place
 * and the columns really slide under it while scrolling, in the three themes.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GridHeader } from '../../components/integration/crt/CrtGridRow';
import {
  GUTTER_WIDTH,
  scrollColumnIntoView,
  type GridLayout,
} from '../../components/integration/crt/gridLayout';

/** A layout of columns with the given widths, the gutter first, as computeLayout lays them out. */
const layoutOf = (widths: number[]): GridLayout => {
  const lefts: number[] = [];
  let x = GUTTER_WIDTH;
  for (const w of widths) {
    lefts.push(x);
    x += w;
  }
  return {
    widths,
    lefts,
    total: x,
    styles: widths.map((width) => ({ width })),
    rowStyle: { width: x },
  };
};

/** Scrolls a stand-in element to bring a column into view and returns where it ended up. */
const scrolledTo = (layout: GridLayout, col: number, scrollLeft: number, clientWidth: number): number => {
  const el = { scrollLeft, clientWidth } as HTMLElement;
  scrollColumnIntoView(el, layout, col);
  return el.scrollLeft;
};

// Four columns of 100 px after the 88 px gutter: lefts 88, 188, 288 and 388, 488 px in all.
const FOUR = layoutOf([100, 100, 100, 100]);

describe('scrollColumnIntoView', () => {
  it('leaves a column that is already fully visible where it is', () => {
    expect(scrolledTo(FOUR, 1, 0, 300)).toBe(0);
    expect(scrolledTo(FOUR, 2, 100, 300)).toBe(100);
  });

  it('scrolls right just far enough to show a column past the right edge', () => {
    // The column ends at 488 px and the viewport is 300 px wide.
    expect(scrolledTo(FOUR, 3, 0, 300)).toBe(188);
  });

  it('scrolls the first column back to the left edge, since nothing pins it', () => {
    expect(scrolledTo(FOUR, 0, 150, 300)).toBe(0);
    expect(scrolledTo(FOUR, 0, 50, 300)).toBe(0);
    expect(scrolledTo(FOUR, 0, 0, 300)).toBe(0);
  });

  it('puts the left edge of a column just after the gutter, for every column', () => {
    // The gutter covers the first 88 px of the viewport, so a column hidden under it lands at 88 px.
    expect(scrolledTo(FOUR, 1, 200, 300)).toBe(188 - GUTTER_WIDTH);
    expect(scrolledTo(FOUR, 2, 250, 300)).toBe(288 - GUTTER_WIDTH);
  });

  it('shows the left edge of a column that is wider than the viewport', () => {
    const wide = layoutOf([100, 500]);
    expect(scrolledTo(wide, 1, 0, 300)).toBe(188 - GUTTER_WIDTH);
  });

  it('does not scroll for the first column of a table that has one column', () => {
    expect(scrolledTo(layoutOf([100]), 0, 0, 300)).toBe(0);
  });
});

describe('GridHeader', () => {
  const columns = ['code', 'value', 'note'];
  const renderHeader = (activeCol = -1) =>
    render(
      <GridHeader
        layout={layoutOf([100, 100, 100])}
        columns={columns}
        activeCol={activeCol}
        allChecked={false}
        someChecked={false}
      />
    );
  const headerCells = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('[role="columnheader"].boomi-crt-hcell'));

  it('draws one header cell per column with plain classes, none of them pinned', () => {
    const { container } = renderHeader();
    const cells = headerCells(container);
    expect(cells.map((c) => c.textContent)).toEqual(columns);
    expect(cells.map((c) => c.className)).toEqual(['boomi-crt-hcell', 'boomi-crt-hcell', 'boomi-crt-hcell']);
  });

  it('marks the active column and nothing else', () => {
    const { container } = renderHeader(1);
    expect(headerCells(container).map((c) => c.classList.contains('boomi-crt-hcell--active'))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('keeps the corner with the select all box, the one cell that stays in place', () => {
    const { container } = renderHeader();
    const corner = container.querySelector('.boomi-crt-corner') as HTMLElement;
    expect(corner).not.toBeNull();
    expect(corner.querySelector('[role="checkbox"]')).not.toBeNull();
  });
});
