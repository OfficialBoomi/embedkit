/**
 * @file key.config.d.ts
 * @typedef KeyConfig
 * @license Apache 2.0
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Allows for the same component to be rendered multiple times within a single application,
 *
 * @property {Object.<string, string | ComponentConfig | any>} [componentName] - A mapping of component names to their configuration object or string value.
 */
import { ComponentConfig } from './component.config';
export type KeyConfig = {
  [componentName: string]: string | ComponentConfig | any;
};
