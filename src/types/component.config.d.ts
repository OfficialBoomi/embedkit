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
/**
 * @typedef AddIntegrationConfig
 *
 * @description
 * Configuration for the "Add Integration" install form of a component
 * (read from `components[<key>].form.addIntegration`).
 */
export type AddIntegrationConfig = {
  /** Optional title shown on the install form/modal. */
  title?: string;
  /** Optional description shown on the install form/modal. */
  description?: string;
  /** Whether to show the integration-pack selector. */
  showIntegrationPackSelect?: boolean;
  /** Preselected integration pack id (when the selector is hidden). */
  defaultIntegrationPackId?: string;
  /** Whether to show the environment selector. */
  showEnvironmentSelect?: boolean;
  /** Preselected environment id (when the selector is hidden). */
  defaultEnvironmentId?: string;
  /** Integration-pack selector copy. */
  integrationPackSelect?: { label?: string; loadingMessage?: string };
  /** Integration-name field options. */
  integrationPackName?: { label?: string; editable?: boolean; defaultIntegrationPackName?: string };
  /**
   * Controls whether two installed integrations may share the same name.
   *
   * - `false` / omitted (default): the integration name must be unique among
   *   already-installed integrations. The install form blocks submission and
   *   shows an inline error when a duplicate name is entered.
   * - `true`: users may install many integrations with the same name (the
   *   uniqueness check is skipped).
   */
  allowDuplicateIntegrationNames?: boolean;
};

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

  /** Optional per-component form configuration. */
  form?: {
    addIntegration?: AddIntegrationConfig;
    /** Other form sections (e.g. field-level validation) keyed by form name. */
    [formKey: string]: unknown;
  };
};
