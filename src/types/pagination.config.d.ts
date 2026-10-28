/**
 * @file pagination.config.d.ts
 * @typedef PaginationConfig
 * @license Apache 2.0
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Optional settings for the pagination controls of the Integrations list, set under
 * `components[componentKey].integrations.pagination`. Every field is optional; with none
 * set, the controls look and behave as before.
 */

/** Where the controls sit. 'bottom' is the default. */
export type PaginationPosition = 'top' | 'bottom' | 'sticky-top' | 'fixed-bottom';

/** Horizontal alignment of the controls. 'end' is the default. */
export type PaginationAlignment = 'start' | 'center' | 'end';

/** A plain object of camelCase CSS properties, for example `{ backgroundColor: '#fff' }`. */
export type PaginationStyle = Record<string, string | number>;

/** Inline style overrides per part. They win over the built-in styles and over CSS variables. */
export type PaginationStyles = {
  /** The wrapper around all controls. */
  root?: PaginationStyle;
  /** Each page number button. */
  pageButton?: PaginationStyle;
  /** The current page number button (applied on top of `pageButton`). */
  activePageButton?: PaginationStyle;
  /** The "Go to page" number input. */
  input?: PaginationStyle;
};

export type PaginationConfig = {
  /**
   * 'top' and 'bottom' place the controls above or below the list. 'sticky-top' and
   * 'fixed-bottom' keep them in view at the top or bottom edge of the EmbedKit area while the
   * list scrolls. Both need the element that holds EmbedKit to have a fixed or maximum height;
   * without one the page itself scrolls and the controls stay with the list. Default 'bottom'.
   */
  position?: PaginationPosition;
  /** Default 'end'. */
  alignment?: PaginationAlignment;
  /** Integrations shown per page, 1 to 30 (a larger value becomes 30). Default 12. */
  pageSize?: number;
  /** Inline style overrides per part. */
  styles?: PaginationStyles;
};
