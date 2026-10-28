/**
 * @file pagination.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Shared pagination helpers: the page size every list uses today, a validator for
 * configured sizes, and the class and style rules for the pagination controls.
 */
import type {
  PaginationAlignment,
  PaginationPosition,
  PaginationStyle,
  PaginationStyles,
} from '../types/pagination.config';

/** The page size each list uses when nothing is configured. */
export const PAGE_SIZE_DEFAULTS = {
  integrations: 12,
  executionHistory: 20,
  agents: 10,
  agentTiles: 10,
  agentLauncher: 10,
  users: 12,
  cors: 12,
} as const;

export type PaginatedList = keyof typeof PAGE_SIZE_DEFAULTS;

export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 30;

/**
 * Returns the page size for a list: the configured value kept inside 1 to 30, or the
 * list's default when the value is missing or not a number.
 */
export function resolvePageSize(value: unknown, list: PaginatedList): number {
  const fallback = PAGE_SIZE_DEFAULTS[list];
  const n =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), MIN_PAGE_SIZE), MAX_PAGE_SIZE);
}

const POSITIONS: readonly PaginationPosition[] = ['top', 'bottom', 'sticky-top', 'fixed-bottom'];
const ALIGNMENTS: readonly PaginationAlignment[] = ['start', 'center', 'end'];

// Full class names, written out so Tailwind keeps them in the build.
const ALIGN_CLASS: Record<PaginationAlignment, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
};

const PINNED_BG = '[background-color:var(--boomi-pagination-bg,var(--boomi-root-bg-color))]';

const POSITION_CLASS: Record<PaginationPosition, string> = {
  bottom: 'mt-4',
  top: 'mb-4',
  'sticky-top': `sticky top-0 z-[5] py-[15px] ${PINNED_BG}`,
  'fixed-bottom': `fixed inset-x-0 bottom-0 z-[5] py-[15px] ${PINNED_BG}`,
};

/** Classes for the pagination wrapper. The defaults match the markup before these options existed. */
export function paginationRootClass(position: PaginationPosition, alignment: PaginationAlignment): string {
  return `flex ${ALIGN_CLASS[alignment]} items-center space-x-2 ${POSITION_CLASS[position]}`;
}

/** Whether the controls render before or after the list. */
export function paginationPlacement(position: PaginationPosition): 'before' | 'after' {
  return position === 'top' || position === 'sticky-top' ? 'before' : 'after';
}

const STYLE_KEY = /^(--)?[A-Za-z][A-Za-z0-9-]*$/;

/** Keeps only string and number values under valid CSS property names. Returns undefined if none remain. */
export function sanitizePaginationStyles(value: unknown): PaginationStyle | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: PaginationStyle = {};
  for (const [key, v] of Object.entries(value)) {
    if (!STYLE_KEY.test(key)) continue;
    if (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '') out[key] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export type ResolvedPaginationOptions = {
  position: PaginationPosition;
  alignment: PaginationAlignment;
  styles: PaginationStyles;
};

/** Reads the `pagination` config object. Unknown or missing values fall back to the defaults. */
export function resolvePaginationOptions(raw: unknown): ResolvedPaginationOptions {
  const cfg = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const position = POSITIONS.includes(cfg.position as PaginationPosition)
    ? (cfg.position as PaginationPosition)
    : 'bottom';
  const alignment = ALIGNMENTS.includes(cfg.alignment as PaginationAlignment)
    ? (cfg.alignment as PaginationAlignment)
    : 'end';
  const rawStyles = cfg.styles && typeof cfg.styles === 'object' ? (cfg.styles as Record<string, unknown>) : {};
  const styles: PaginationStyles = {};
  for (const part of ['root', 'pageButton', 'activePageButton', 'input'] as const) {
    const clean = sanitizePaginationStyles(rawStyles[part]);
    if (clean) styles[part] = clean;
  }
  return { position, alignment, styles };
}
