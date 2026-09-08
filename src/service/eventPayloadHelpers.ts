/**
 * @file eventPayloadHelpers.ts
 * @module eventPayloadHelpers
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Small helpers that turn SDK response/request shapes into safe event
 * payloads for `events.service.ts`. "Safe" means: identifying keys only,
 * never the actual field values — `EnvExtMinimal` connection/process-property
 * fields commonly carry connector credentials (API keys, passwords, OAuth
 * tokens), so no caller of these helpers should ever forward `.value`.
 */

import type { EnvExtMinimal } from '@boomi/embedkit-sdk';

/**
 * Extracts `connectionId:fieldId` and `processProperty:key` identifiers from
 * an environment-extensions update payload, for the `connection.extensions.updated`
 * event. Intentionally never reads `.value` / `.values`.
 */
export function extractUpdatedFieldKeys(payload: EnvExtMinimal[] | null | undefined): string[] {
  if (!payload) return [];
  const keys: string[] = [];

  for (const ext of payload) {
    for (const conn of ext.connections?.connection ?? []) {
      const connKey = conn.id || conn.name || 'connection';
      for (const field of conn.field ?? []) {
        keys.push(`${connKey}:${field.id ?? 'field'}`);
      }
    }
    for (const prop of ext.processProperties?.ProcessProperty ?? []) {
      const propKey = prop.id || prop.name || 'processProperty';
      for (const val of prop.ProcessPropertyValue ?? []) {
        keys.push(`${propKey}:${val.key ?? val.label ?? 'value'}`);
      }
    }
  }

  return keys;
}
