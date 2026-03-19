/**
 * @file form.config.d.ts
 * @typedef FormConfig
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Represents a mapping of form input field names to their configuration objects.
 * Each field is defined by a `FormInputConfig` that specifies display and
 * validation options.
 *
 * @property {Object.<string, FormInputConfig>} [inputFieldName] - A mapping where the key is the input field's unique name and the value is its configuration.
 */

import { FormInputConfig } from './form-input-config';

export type FormConfig = {
  showTitle?: boolean;
  title?: string;
  showDescription?: boolean;
  description?: string;
} & Record<string, FormInputConfig>;
