/**
 * @file plugin-ui.config.d.ts
 * @typedef PluginboomiConfig
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Represents the overall UI configuration for the Boomi plugin.
 * This type allows defining form-specific configurations and
 * component-specific settings that control UI behavior, layout,
 * and display options.
 *
 * @property {Object.<string, FormConfig>} [form] - A mapping of form names to their configuration.
 * @property {Object.<string, string | Key | any>} [componentKey] - A mapping of component names to their configuration object or string value.
 */

import { AgentConfig } from './agent.config';
import { FormConfig } from './form.config';
import { ComponentKeyConfig } from './component-key.config';

export type ModalOffsetConfig = {
  /** Horizontal translation in px/rem/etc (positive pushes right, negative left). */
  offsetX?: number | string;
  /** Vertical translation in px/rem/etc (positive pushes down, negative up). */
  offsetY?: number | string;
};

export type PluginUiConfig = {
  /** Theme settings for the plugin UI. */
  theme?: Theme;

  /** Enable ai? Assumes you have passed your apiToken and model in the pre-auth before plugin is enabled. */
  enableAi?: boolean;

  /** Configuration settings for various forms in the plugin UI. */
  form?: Record<string, FormConfig>;

  /** Configuration settings for various agents in the plugin UI. */
  agents?: Record<string, AgentConfig>;

  /** Configuration settings for various components in the plugin UI. */
  components?: Record<
    string,
    | string
    | (ComponentConfig & { modalOffset?: ModalOffsetConfig })
    // Backwards-compatible: allow nested arbitrary config objects per component key
    | Record<string, any>
  >;
};
