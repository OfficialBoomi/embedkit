/**
 * @file mapDefaults.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * The partner's default mappings and functions are shown in the map editor next to the
 * customer's own changes. Only the customer's changes are saved: a default that has not
 * been touched is never written to ExtendedMappings / ExtendedFunctions.
 *
 * Rules:
 * - An extended mapping overrides a default mapping that writes to the same target.
 *   Removing it brings the default back.
 * - An extended function overrides a default function with the same id.
 */
import type { MapExtensionsFunction, MapExtensionsMapping } from '@boomi/embedkit-sdk';
import { fromMapExtensionsFunctions, toMapExtensionsFunctions } from './ui-utils';

/** JSON with object keys sorted, so equal objects always serialize to the same string. */
const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );

const targetKey = (m: MapExtensionsMapping): string => `${m.toFunction ?? ''}|${m.toXPath ?? ''}`;

const sameMapping = (a: MapExtensionsMapping, b: MapExtensionsMapping): boolean =>
  (a.fromFunction ?? null) === (b.fromFunction ?? null) &&
  (a.fromXPath ?? null) === (b.fromXPath ?? null) &&
  (a.toFunction ?? null) === (b.toFunction ?? null) &&
  (a.toXPath ?? null) === (b.toXPath ?? null);

/**
 * The mappings to show: each default mapping, except where the customer has a mapping to
 * the same target, then the customer's own mappings.
 */
export function mergeDefaultMappings(
  defaults: MapExtensionsMapping[],
  extended: MapExtensionsMapping[]
): MapExtensionsMapping[] {
  const overridden = new Set(extended.map(targetKey));
  return [...defaults.filter((d) => !overridden.has(targetKey(d))), ...extended];
}

/** The mappings to save: everything shown that is not an untouched default. */
export function changedMappings(
  effective: MapExtensionsMapping[],
  defaults: MapExtensionsMapping[]
): MapExtensionsMapping[] {
  return effective.filter((m) => !defaults.some((d) => sameMapping(d, m)));
}

/**
 * The functions to show: each default function, except one the customer has under the same
 * id, then the customer's own functions.
 */
export function mergeDefaultFunctions(
  defaults: MapExtensionsFunction[],
  extended: MapExtensionsFunction[]
): MapExtensionsFunction[] {
  const overridden = new Set(extended.map((f) => f.id));
  return [...defaults.filter((d) => !overridden.has(d.id)), ...extended];
}

/**
 * A default function as the canvas round-trips it on save. Applied to both sides of a
 * comparison, so a scripting function that the canvas rebuilds still matches its default
 * when nothing was changed.
 */
const canonicalFunction = (fn: MapExtensionsFunction): string =>
  stableJson(toMapExtensionsFunctions(fromMapExtensionsFunctions([fn])).functions[0]);

/** The functions to save: everything shown that differs from its untouched default (or has none). */
export function changedFunctions(
  effective: MapExtensionsFunction[],
  defaults: MapExtensionsFunction[]
): MapExtensionsFunction[] {
  const defaultById = new Map(defaults.map((d) => [d.id, canonicalFunction(d)]));
  return effective.filter((f) => defaultById.get(f.id) !== stableJson(f));
}
