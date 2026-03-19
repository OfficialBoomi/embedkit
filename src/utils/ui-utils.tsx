/**
 * @file map-extensions-transform.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import {
  MapExtensionsFunction,
  MapExtensionsScripting,
  ScriptingParameter,
} from '@boomi/embedkit-sdk';
import { PositionedFunction } from '../types/positioned-function';
import logger from '../logger.service';

/**
 * Converts an array of `PositionedFunction` (local UI model) into
 * Boomi `MapExtensionsFunction` objects, returning both the converted functions
 * and a map of original → final IDs (to account for any `newId` changes).
 *
 * @param {PositionedFunction[]} positioned - Local UI function nodes to convert.
 * @return {{ functions: MapExtensionsFunction[]; idMap: Record<string,string> }}
 * The converted Boomi functions and a mapping of old IDs to new IDs.
 */
export function toMapExtensionsFunctions(
  positioned: PositionedFunction[]
): {
  functions: MapExtensionsFunction[];
  idMap: Record<string, string>;
} {
  const idMap: Record<string, string> = {};

  const functions: MapExtensionsFunction[] = positioned.map((fn) => {
    const finalId = fn.newId || fn.id;

    if (fn.id !== finalId) {
      idMap[fn.id] = finalId;
    }

    return {
      id: finalId,
      type: MapExtensionsFunction.type.CUSTOM_SCRIPTING,
      cacheType: MapExtensionsFunction.cacheType.NONE,
      Inputs: {
        Input: (fn.inputs || []).map((input) => ({
          key: input.key,
          name: input.name,
        })),
      },
      Outputs: {
        Output: (fn.outputs || []).map((output) => ({
          key: output.key,
          name: output.name,
        })),
      },
      Configuration: {
        Scripting: {
          language: MapExtensionsScripting.language.JAVASCRIPT,
          Script: fn.script ?? '',
          Inputs: {
            Input: (fn.inputs || []).map((input) => ({
              index: input.key,
              name: input.name,
              dataType:
                ScriptingParameter.dataType[
                  input.dataType as keyof typeof ScriptingParameter.dataType
                ] ?? ScriptingParameter.dataType.CHARACTER,
            })),
          },
          Outputs: {
            Output: (fn.outputs || []).map((output) => ({
              index: output.key,
              name: output.name,
            })),
          },
        },
      },
    };
  });

  logger.debug('toMapExtensionsFunctions:', { functions, idMap });
  return { functions, idMap };
}

/**
 * Converts Boomi `MapExtensionsFunction` array into local `PositionedFunction` array.
 *
 * @param {MapExtensionsFunction[]} boomiFunctions - Boomi function definitions.
 * @return {PositionedFunction[]} Local UI function nodes.
 */
export function fromMapExtensionsFunctions(
  boomiFunctions: MapExtensionsFunction[]
): PositionedFunction[] {
  if (!boomiFunctions) return [];

  return boomiFunctions.map((fn) => {
    const inputs =
      fn.Configuration?.Scripting?.Inputs?.Input?.map((input) => ({
        key: input.index ?? 0,
        name: input.name ?? '',
        dataType: input.dataType ?? ScriptingParameter.dataType.CHARACTER,
      })) || [];

    const outputs =
      fn.Configuration?.Scripting?.Outputs?.Output?.map((output) => ({
        key: output.index ?? 0,
        name: output.name ?? '',
      })) || [];

    return {
      id: fn.id ?? '',
      name: fn.id ?? '',
      type: fn.type ?? 'CUSTOM_SCRIPTING',
      inputs,
      outputs,
      script: fn.Configuration?.Scripting?.Script ?? '',
      x: undefined,
      y: undefined,
    };
  });
}

/**
 * Removes the encoded Y-coordinate suffix (`---y:<number>`) from a function ID string.
 *
 * @param {string} id - Original function ID (e.g., `"funcA---y:120"`).
 * @return {string} ID without the Y-coordinate segment.
 */
export function stripYFromId(id: string): string {
  try {
    const newId = id.replace(/---y:-?\d+/, '');
    return newId;
  } catch (err) {
    logger.error('stripYFromId Error:', err);
    return id;
  }
}

/**
 * Extracts the encoded Y-coordinate value from a function ID string.
 *
 * @param {string} id - Function ID that may contain `---y:<number>`.
 * @return {number | undefined} Parsed Y value, or `undefined` if absent/invalid.
 */
export function parseYFromId(id: string): number | undefined {
  try {
    const match = id.match(/---y:(-?\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  } catch (err) {
    logger.error('parseYFromId Error:', err);
    return undefined;
  }
}

/**
 * Embeds (or replaces) a Y-coordinate value in the function ID string.
 *
 * @param {string} id - Base function ID (existing `---y:` suffix will be stripped).
 * @param {number} y - Y-coordinate to embed (will be rounded to an integer).
 * @return {string} ID with `---y:<y>` appended.
 */
export function embedYInId(id: string, y: number): string {
  try {
    const wholeY = Math.round(y);
    logger.debug(`embedYInId parsing: ${id}, y: ${wholeY}`);
    return `${stripYFromId(id)}---y:${wholeY}`;
  } catch (err) {
    logger.error('embedYInId Error:', err);
    return id;
  }
}

/**
 * Sanitizes a string for safe usage as an HTML element ID or similar attribute.
 * Removes characters that are not word characters (`[A-Za-z0-9_]`) or hyphen (`-`).
 *
 * @param {string | undefined} id - Candidate string to sanitize.
 * @return {string} A sanitized string (or `''` on error/invalid input).
 */
export function sanitize(id: string | undefined): string {
  try {
    if (typeof id !== 'string') {
      throw new TypeError(`Expected string but got ${typeof id}`);
    }
    return id.replace(/[^\w-]/g, '');
  } catch (err) {
    logger.error('sanitize Error:', err);
    return '';
  }
}

/** Extract a useful error message from XML/JSON/plain text or ApiError-like objects. */
export function extractErrorMessage(raw: unknown): string | null {
  if (raw == null) return null;

  // Gather candidate text payloads in priority order
  const any: any = raw as any;
  const candidates: string[] = [];

  if (typeof raw === 'string') candidates.push(raw);
  if (typeof any?.body === 'string') candidates.push(any.body);                 // OpenAPI ApiError
  if (typeof any?.response?.data === 'string') candidates.push(any.response.data); // Axios-style
  if (typeof any?.data === 'string') candidates.push(any.data);
  if (typeof any?.message === 'string') candidates.push(any.message);

  for (const candidate of candidates) {
    const text = candidate?.trim?.();
    if (!text) continue;

    // 1) JSON
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const j = JSON.parse(text);
        const cand =
          j?.message ??
          j?.error?.message ??
          j?.error_description ??
          j?.Data;
        if (typeof cand === 'string' && cand.trim()) return cand.trim();
      } catch { /* not JSON */ }
    }

    // 2) XML via DOMParser
    if (text.startsWith('<') && typeof DOMParser !== 'undefined') {
      try {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        if (!doc.querySelector('parsererror')) {
          // Boomi-specific
          const boomi = doc.querySelector('UserMessage > Data')?.textContent?.trim();
          if (boomi) return boomi;

          // Generic XML/SOAP
          const sel =
            doc.querySelector('error > message') ||
            doc.querySelector('message') ||
            doc.querySelector('faultstring');
          const xmlMsg = sel?.textContent?.trim();
          if (xmlMsg) return xmlMsg;

          // SOAP 1.2 Fault Reason/Text
          for (const el of Array.from(doc.getElementsByTagName('*'))) {
            if (
              el.localName?.toLowerCase() === 'text' &&
              el.parentElement?.localName?.toLowerCase() === 'reason'
            ) {
              const t = el.textContent?.trim();
              if (t) return t;
            }
          }

          // Fallback: any text content
          const all = doc.documentElement?.textContent?.trim();
          if (all) return all;
        }
      } catch { /* ignore */ }
    }

    // 3) Regex fallbacks (no DOM required)
    const regexes = [
      /<UserMessage[^>]*>\s*<Data[^>]*>([\s\S]*?)<\/Data>\s*<\/UserMessage>/i, // Boomi
      /<error>\s*<message>([\s\S]*?)<\/message>\s*<\/error>/i,
      /<faultstring>([\s\S]*?)<\/faultstring>/i,
      /<message>([\s\S]*?)<\/message>/i,
      /<Text[^>]*>([\s\S]*?)<\/Text>/i,
    ];
    for (const re of regexes) {
      const m = text.match(re);
      if (m?.[1]?.trim()) return m[1].trim();
    }

    // 4) Plain string fallback
    if (text) return text;
  }

  return null;
}

export function formatWhen(ts?: string | number | Date): string {
  if (!ts) return 'Untitled chat';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'Untitled chat';
  // Example: "Oct 30, 2025, 2:19 PM"
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  });
}



