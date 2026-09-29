/**
 * @file catalog-utils.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Pure helpers behind the Add Integration catalog: search, environment
 * choices per pack, and install validation. Kept free of React so they can
 * be unit-tested directly.
 */

export type CatalogConnector = { componentId?: string; name: string; type?: string; iconKey: string };

/** Shape of an eligible pack as returned by GET /integration-packs/eligible (SDK EligibleIntegrationPack). */
export type CatalogPack = {
  id: string;
  name?: string;
  Description?: string;
  displayDescription?: string;
  installationType: 'SINGLE' | 'MULTI';
  installedEnvironmentIds?: string[];
  installedInstanceCount?: number;
  connectors?: CatalogConnector[];
  isAgent?: boolean;
};

export type CatalogEnvironment = { id: string; name?: string; classification?: string; installed?: boolean; isActive?: boolean };

const norm = (s: unknown) => String(s ?? '').toLowerCase().trim();

/** Case-insensitive search over name, description and connector names/types. */
export function filterPacks<T extends CatalogPack>(packs: T[], search: string): T[] {
  const q = norm(search);
  if (!q) return packs;
  return packs.filter((p) => {
    const hay = [p.name, p.displayDescription ?? p.Description, ...(p.connectors ?? []).flatMap((c) => [c.name, c.type, c.iconKey])]
      .map(norm)
      .join(' ');
    return hay.includes(q);
  });
}

/**
 * Environments a pack can be installed into.
 * Multi-install packs can go anywhere in the list. Single-install packs skip
 * environments that already hold an instance of the pack.
 */
export function installableEnvironments<E extends CatalogEnvironment>(pack: Pick<CatalogPack, 'installationType' | 'installedEnvironmentIds'>, environments: E[]): E[] {
  if (pack.installationType !== 'SINGLE') return environments;
  const installed = new Set(pack.installedEnvironmentIds ?? []);
  return environments.filter((e) => !installed.has(e.id));
}

export type InstallDraft = {
  pack: CatalogPack | null;
  environmentId: string;
  integrationName: string;
};

export type InstallValidation = {
  ok: boolean;
  errors: { pack?: string; environment?: string; name?: string };
};

/**
 * Validate an install draft. `existingNames` enforces unique names for
 * multi-install packs unless duplicates are allowed; single-install packs use
 * the pack name and are never renamed.
 */
export function validateInstall(
  draft: InstallDraft,
  opts: { environmentOptions: CatalogEnvironment[]; existingNames?: string[]; allowDuplicateNames?: boolean }
): InstallValidation {
  const errors: InstallValidation['errors'] = {};
  if (!draft.pack) errors.pack = 'Select an integration';
  if (!draft.environmentId) {
    errors.environment = opts.environmentOptions.length === 0 && draft.pack?.installationType === 'SINGLE'
      ? 'Already installed in every available environment'
      : 'Select an environment';
  } else if (!opts.environmentOptions.some((e) => e.id === draft.environmentId)) {
    errors.environment = 'Environment is not available for this integration';
  }
  if (draft.pack && draft.pack.installationType !== 'SINGLE') {
    const name = draft.integrationName.trim();
    if (!name) errors.name = 'Required';
    else if (!opts.allowDuplicateNames && (opts.existingNames ?? []).some((n) => norm(n) === norm(name))) {
      errors.name = 'An integration with this name already exists';
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Pick the environment to preselect: the only option, or the configured default when it is an option. */
export function preselectEnvironment(options: CatalogEnvironment[], defaultEnvironmentId?: string): string {
  if (defaultEnvironmentId && options.some((e) => e.id === defaultEnvironmentId)) return defaultEnvironmentId;
  if (options.length === 1) return options[0].id;
  return '';
}
