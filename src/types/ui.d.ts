/**
 * @file environment.d.ts
 * @typedef Environment
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Represents an enriched Boomi environment with computed metadata.
 *
 * @property {string}  id          - Unique ID of the environment.
 * @property {string}  name        - Human-readable name of the environment.
 * @property {boolean} installed   - Whether the pack is already installed in this environment.
 * @property {boolean} [isActive]  - True if all attached Atoms are ONLINE; otherwise false.
 */

/**
 * Metadata captured when fetching an OAuth2 access token (or similar secure value)
 * for a specific connection field. Used for audit/UX breadcrumbs in the UI.
 */
export type AccessTokenFieldData = {
  /** The Boomi Connection ID the token/value belongs to. */
  connectionId: string;

  /** The fully-qualified field ID within the connection (e.g., 'oauthOptions/.../@accessToken'). */
  fieldId: string;

  /**
   * The URL that was called to fetch/refresh the token.
   * Stored for traceability (never store the token value here).
   */
  fetchedURL: string;
};

/**
 * UI-side context for mapping: which pane a field belongs to.
 * - 'source' → inputs (left side)
 * - 'target' → outputs (right side)
 */
export type UISide = 'source' | 'target';

/**
 * Describes a UI validation/error state for a specific field.
 * These properties are UI-only and should not be persisted to Boomi.
 */
export type UIFieldError = {
  /** True if the field currently fails validation. */
  invalid?: boolean;

  /** Human-readable error/notice to display in the UI. */
  message?: string;

  /** Which side of the mapping canvas the field is on (source/target). */
  side?: UISide;

  /** Optional Boomi connection ID associated with the field. */
  connectionId?: string;

  /** Friendly or logical field name shown to users. */
  fieldName?: string;
};

/**
 * Represents a UI-level notification or error banner/toast.
 * Purely client-side; do not persist to Boomi.
 */
export type UIError = {
  /**
   * Whether the banner/toast is currently visible.
   * If omitted, the renderer may default this to true on creation.
   */
  show?: boolean;

  /** Visual style/severity of the message (affects color/icon). */
  errorType: 'info' | 'success' | 'warning' | 'error';

  /** Short, prominent title for the message (e.g., toast header). */
  header: string;

  /** Detailed user-facing text explaining the message. */
  message: string;

  /**
   * Optional machine-readable code (e.g., "1003", "E_AUTH_401") useful for logs,
   * telemetry, or mapping to help docs.
   */
  code?: string;

  /**Í
   * Optional callback invoked when the user dismisses the banner/toast.
   * Implementers should handle idempotency and be resilient to multiple calls.
   */
  onClose?: () => void;
};

/**
 * Extends a Boomi `Field` with UI-only metadata used for rendering/validation.
 * The `__ui` bag is ignored by persistence and server APIs.
 */
export type FieldWithUI = Field & {
  /** UI-only annotations and validation state for this field. */
  __ui?: UIFieldError;
};

export type EnvExtMinimal = Pick<
  EnvironmentExtensions,
  'id' | 'environmentId' | 'extensionGroupId' | 'connections' | 'processProperties'
>;

export type MergeConflicts = {
  connections: Array<{ environmentId: string; connectionId: string; fieldId: string; values: string[] }>;
  processProperties: Array<{ environmentId: string; key: string; label?: string; values: string[] }>;
};

export type UpdatePlan = {
  original: EnvironmentExtensions;         
  payload: EnvironmentExtensions | null;     
  changes: { connections: number; properties: number };
};

export type ArrayElem<T> = T extends ReadonlyArray<infer U> ? U : never;
export type Conn  = ArrayElem<NonNullable<NonNullable<EnvExtMinimal['connections']>['connection']>>;
export type Field = ArrayElem<NonNullable<NonNullable<Conn['field']>>>;
export type PGroup= ArrayElem<NonNullable<NonNullable<EnvExtMinimal['processProperties']>['ProcessProperty']>>;
export type PVal  = ArrayElem<NonNullable<NonNullable<PGroup['ProcessPropertyValue']>>>;

export type CombinedIndex = {
  byEnvConnField: Map<string, Map<string, Map<string, Field>>>;
  byEnvPropKey: Map<string, Map<string, PVal>>;
};