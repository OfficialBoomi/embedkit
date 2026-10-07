/**
 * @file ui-version.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { describe, it, expect, vi } from 'vitest';
import { parseUiVersion, uiVersionAtLeast, uiVersionCss, UI_VERSIONS } from '../../utils/ui-version';

const cfg = (uiVersion?: unknown) => ({ components: { myIntegrations: { renderType: 'integration', uiVersion } } });

describe('parseUiVersion', () => {
  it('accepts short, full and v-prefixed versions', () => {
    expect(parseUiVersion('1.7')).toEqual([1, 7, 0]);
    expect(parseUiVersion('1.7.2')).toEqual([1, 7, 2]);
    expect(parseUiVersion('v2')).toEqual([2, 0, 0]);
  });
  it('rejects anything else', () => {
    expect(parseUiVersion('latest')).toBeNull();
    expect(parseUiVersion('1.7.0-beta')).toBeNull();
    expect(parseUiVersion(undefined)).toBeNull();
  });
});

describe('uiVersionAtLeast', () => {
  it('keeps the 1.6.1 UI when uiVersion is omitted', () => {
    expect(uiVersionAtLeast(cfg(), 'myIntegrations', UI_VERSIONS.CATALOG)).toBe(false);
    expect(uiVersionAtLeast({}, 'missingKey', UI_VERSIONS.CATALOG)).toBe(false);
  });
  it('turns on 1.7 features at 1.7.0 and later only', () => {
    expect(uiVersionAtLeast(cfg('1.6.1'), 'myIntegrations', UI_VERSIONS.CATALOG)).toBe(false);
    expect(uiVersionAtLeast(cfg('1.7'), 'myIntegrations', UI_VERSIONS.CATALOG)).toBe(true);
    expect(uiVersionAtLeast(cfg('1.10.0'), 'myIntegrations', UI_VERSIONS.CATALOG)).toBe(true);
    expect(uiVersionAtLeast(cfg('2.0.0'), 'myIntegrations', UI_VERSIONS.CATALOG)).toBe(true);
  });
  it('falls back to the baseline and warns once on a malformed version', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(uiVersionAtLeast(cfg('newest'), 'myIntegrations', UI_VERSIONS.CATALOG)).toBe(false);
    expect(uiVersionAtLeast(cfg('newest'), 'myIntegrations', UI_VERSIONS.CATALOG)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('uiVersionCss', () => {
  it('adds the thin-scrollbar sheet only for 1.7 components', () => {
    expect(uiVersionCss(cfg(), 'myIntegrations')).toBe('');
    expect(uiVersionCss(cfg('1.7.0'), 'myIntegrations')).toContain('--boomi-scrollbar-width:8px');
  });
});
