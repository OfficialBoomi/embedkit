/**
 * @file theme.d.ts
 * @typedef Ai
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Configuration options for enabling theme support within the plugin. 
 *
 * @property {boolean} [allowThemes] - Whether multiple themes are allowed in the UI.
 * @property {string} [defaultTheme] - The default theme name.
 */
export type Theme = {
  allowThemes?: boolean;
  defaultTheme?: string | 'light' | 'dark' | 'boomi';
  darkModeTheme?: boolean;
};
