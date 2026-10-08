/**
 * @file catalog-utils.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { describe, it, expect } from 'vitest';
import { filterPacks, installableEnvironments, validateInstall, preselectEnvironment, type CatalogPack, type CatalogEnvironment } from '../../utils/catalog-utils';

const envs: CatalogEnvironment[] = [
  { id: 'prod', name: 'Production', classification: 'PROD' },
  { id: 'test', name: 'Test', classification: 'TEST' },
];
const single: CatalogPack = { id: 'p1', name: 'LDAP User Add', installationType: 'SINGLE', installedEnvironmentIds: ['prod'], installedInstanceCount: 1, connectors: [{ name: 'AD', type: 'ldap', iconKey: 'ldap' }] };
const multi: CatalogPack = { id: 'p2', name: 'FTP To Your App', Description: 'Moves files', installationType: 'MULTI', connectors: [{ name: 'FTP Connection', type: 'ftp', iconKey: 'ftp' }] };

describe('filterPacks', () => {
  it('matches connector display names from the platform', () => {
    const sap: CatalogPack = { id: 'p3', name: 'Financials', installationType: 'MULTI', connectors: [{ name: 'Conn', type: 'invixoconsultinggroupas-OZI90V-boomia-prod', iconKey: 'sap', displayName: 'Boomi for SAP' }] };
    expect(filterPacks([single, multi, sap], 'boomi for sap').map((p) => p.id)).toEqual(['p3']);
  });
  it('matches name, description and connector kind, case-insensitively', () => {
    expect(filterPacks([single, multi], 'ldap').map((p) => p.id)).toEqual(['p1']);
    expect(filterPacks([single, multi], 'FILES').map((p) => p.id)).toEqual(['p2']);
    expect(filterPacks([single, multi], 'ftp').map((p) => p.id)).toEqual(['p2']);
    expect(filterPacks([single, multi], '  ')).toHaveLength(2);
  });
});

describe('installableEnvironments', () => {
  it('excludes environments that already hold a single-install pack', () => {
    expect(installableEnvironments(single, envs).map((e) => e.id)).toEqual(['test']);
  });
  it('leaves multi-install packs unrestricted', () => {
    expect(installableEnvironments(multi, envs)).toHaveLength(2);
  });
});

describe('preselectEnvironment', () => {
  it('prefers the configured default when it is available, else the only option', () => {
    expect(preselectEnvironment(envs, 'test')).toBe('test');
    expect(preselectEnvironment(envs, 'nope')).toBe('');
    expect(preselectEnvironment([envs[0]])).toBe('prod');
    expect(preselectEnvironment([])).toBe('');
  });
});

describe('validateInstall', () => {
  it('requires an available environment', () => {
    const v = validateInstall({ pack: single, environmentId: 'prod', integrationName: '' }, { environmentOptions: installableEnvironments(single, envs) });
    expect(v.ok).toBe(false);
    expect(v.errors.environment).toMatch(/not available/);
  });
  it('explains when a single-install pack has nowhere left to go', () => {
    const everywhere = { ...single, installedEnvironmentIds: ['prod', 'test'] };
    const v = validateInstall({ pack: everywhere, environmentId: '', integrationName: '' }, { environmentOptions: installableEnvironments(everywhere, envs) });
    expect(v.errors.environment).toMatch(/every available environment/);
  });
  it('never asks single-install packs for a name, but enforces unique names for multi-install', () => {
    expect(validateInstall({ pack: single, environmentId: 'test', integrationName: '' }, { environmentOptions: installableEnvironments(single, envs) }).ok).toBe(true);
    const dup = validateInstall({ pack: multi, environmentId: 'prod', integrationName: 'My FTP' }, { environmentOptions: envs, existingNames: ['my ftp'] });
    expect(dup.errors.name).toMatch(/already exists/);
    const allowed = validateInstall({ pack: multi, environmentId: 'prod', integrationName: 'My FTP' }, { environmentOptions: envs, existingNames: ['my ftp'], allowDuplicateNames: true });
    expect(allowed.ok).toBe(true);
    expect(validateInstall({ pack: multi, environmentId: 'prod', integrationName: '   ' }, { environmentOptions: envs }).errors.name).toBe('Required');
  });
});
