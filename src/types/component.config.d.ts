/**
 * @file component.config.d.ts
 * @typedef ComponentConfig
 * @license Apache 2.0
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Defines configuration options for controlling the display of titles
 * and descriptions in a plugin component.
 *
 * @property {string} [componentkey] - unique key for the component instance
 * @property {boolean} showTitle - Whether the component title should be displayed.
 * @property {string} [title] - Optional text for the component title.
 * @property {boolean} showDescription - Whether the component description should be displayed.
 * @property {string} [description] - Optional text for the component description.
 */
export type ComponentConfig = {
  componentKey: string;
  renderType: 'agent' | 'integration' | 'all';
  showHeader?: boolean;
  showTitle?: boolean;
  title?: string;
  showDescription?: boolean;
  description?: string;

  /** Optional mapping feature flag */
  mapping?: Mapping;
};
