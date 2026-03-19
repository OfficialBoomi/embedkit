/**
 * @file boomi.config.d.ts
 * @module ../boomi.config.js
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Declares the shape of the `boomiConfig` export from the `boomi.config.js` file.
 * This configuration controls plugin UI and behavior through the `PluginboomiConfig` interface.
 */

declare module '../boomi.config.js' {
  import { PluginboomiConfig } from './plugin-ui-config';
  
  /**
   * @typedef BoomiConfigExport
   *
   * @description
   * Configuration object for the Boomi plugin.
   *
   * @property {PluginboomiConfig} [boomiConfig] - Optional Boomi plugin configuration object.
   */
  const config: { boomiConfig?: PluginboomiConfig };
  export = config;
}
