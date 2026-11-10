/**
 * @file crtSave.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The rules behind saving a cross reference table. Pure data, no React and no fetching, so they can
 * be tested without a DOM or a server:
 *
 * - what the Save button will do, and how to say so (`describeSaveAction`),
 * - how big the request will be (`estimateSaveBytes`, `checkSaveSize`),
 * - what saving or resetting a table that other processes share does in each of them
 *   (`describeShareTargets`),
 * - what a failed save means, in words a customer can read (`classifySaveError`).
 */
import { getSessionMessage, isSessionError } from '../sessionError';
import type { CrtChangeSummary } from './crtStore';

type Rows = ReadonlyArray<ReadonlyArray<string>>;

const formatCount = (count: number): string => count.toLocaleString('en-US');

const rowsText = (count: number): string => `${formatCount(count)} ${count === 1 ? 'row' : 'rows'}`;

// ---- what Save does ----

/** What the Save button does for the table that is open. `none` means there is nothing to save. */
export interface SaveAction {
  mode: 'save' | 'reset' | 'none';
  text: string;
}

export const NO_CHANGES_TEXT = 'No changes to save';

/**
 * What Save will do and how the save bar says so.
 *
 * - Nothing differs from the load: `none`.
 * - The table had no rows of its own and now has: `save`, which creates the customer's own copy.
 * - The table had rows of its own and shows the defaults again: `reset`.
 * - The table had rows of its own and still does: `save`, described by how many rows changed.
 *
 * `dirty` is the store's `isDirty()`, `rowCount` the rows now in the table and `summary` the store's
 * `changeSummary()`.
 */
export function describeSaveAction(summary: CrtChangeSummary, rowCount: number, dirty: boolean): SaveAction {
  if (!dirty) return { mode: 'none', text: NO_CHANGES_TEXT };
  const changed = summary.added + summary.edited + summary.removed;

  if (!summary.loadedOverridden) {
    // Not overridden when loaded and not now: nothing can differ, so there is nothing to do.
    if (!summary.overridden) return { mode: 'none', text: NO_CHANGES_TEXT };
    const base = `Save will create your own copy (${rowsText(rowCount)})`;
    return { mode: 'save', text: changed > 0 ? `${base}, ${rowsText(changed)} changed` : base };
  }

  if (!summary.overridden) return { mode: 'reset', text: 'Save will restore the default values' };

  if (changed > 0) return { mode: 'save', text: `${rowsText(changed)} changed` };
  if (summary.reordered) return { mode: 'save', text: 'Row order changed' };
  // Reset and then override again: the rows are a fresh copy of the defaults and differ from the saved ones.
  return { mode: 'save', text: 'Save will replace your rows with a copy of the default values' };
}

// ---- size of the request ----

/** The request body limit of a server that does not say (the general limit of every route). */
export const DEFAULT_MAX_SAVE_BYTES = 1024 * 1024;

const BYTES_PER_MB = 1024 * 1024;

/** Bytes of one string as `JSON.stringify` writes it between its quotes, in UTF-8. */
function jsonStringBytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) {
      if (c === 0x22 || c === 0x5c) {
        bytes += 2; // \" and \\
      } else if (c >= 0x20) {
        bytes += 1;
      } else if (c === 0x08 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d) {
        bytes += 2; // \b \t \n \f \r
      } else {
        bytes += 6; // \u00XX
      }
    } else if (c < 0x800) {
      bytes += 2;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4; // a pair is one character of four bytes
        i += 1;
      } else {
        bytes += 6; // a lone half is written as \udXXX
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      bytes += 6;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * The UTF-8 byte length of `JSON.stringify(rows)`, worked out cell by cell without building the
 * text, so a table of 200,000 cells costs one pass and no large string.
 */
export function estimateSaveBytes(rows: Rows): number {
  let bytes = 2; // [ ]
  if (rows.length > 1) bytes += rows.length - 1; // commas between rows
  for (const row of rows) {
    bytes += 2; // [ ]
    if (row.length > 1) bytes += row.length - 1; // commas between cells
    for (const cell of row) bytes += 2 + jsonStringBytes(cell); // quotes around the cell
  }
  return bytes;
}

function formatSize(bytes: number, trimWhole: boolean, decimals = 1): string {
  if (bytes >= BYTES_PER_MB) {
    const mb = bytes / BYTES_PER_MB;
    return `${trimWhole && Number.isInteger(mb) ? String(mb) : mb.toFixed(decimals)} MB`;
  }
  const kb = bytes / 1024;
  return `${trimWhole && Number.isInteger(kb) ? String(kb) : kb.toFixed(decimals)} KB`;
}

/**
 * Null when the rows fit in a save request, otherwise a plain message. `maxBytes` is what the server
 * said it accepts; without one the general limit of 1 MB is assumed.
 */
export function checkSaveSize(rows: Rows, maxBytes?: number): string | null {
  const limit = typeof maxBytes === 'number' && Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_SAVE_BYTES;
  const size = estimateSaveBytes(rows);
  if (size <= limit) return null;
  const limitText = formatSize(limit, true);
  let sizeText = formatSize(size, false);
  // A table just over the limit must not read as equal to it ("8.0 MB" over "8 MB").
  if (sizeText === formatSize(limit, false)) sizeText = formatSize(size, false, 2);
  return `This table is about ${sizeText}, which is over the ${limitText} limit for saving. Remove some rows or shorten long values.`;
}

// ---- a table shared by several processes ----

/** What saving (or resetting) the open table does in another process that has the same table. */
export type ShareTargetKind =
  | 'has-edits'
  | 'replaces-own-rows'
  | 'already-has-rows'
  | 'creates-copy'
  | 'restores-defaults'
  | 'already-defaults';

/** Another process of the pack that has the open table too, as the share confirmation needs it. */
export interface ShareCandidate {
  processId: string;
  processName: string;
  /** The process has its own rows for the table now (as last loaded or saved). */
  overridden: boolean;
  /** Its own rows now, or [] when it has none. */
  rows: string[][];
  /** The process's copy of the table has unsaved edits in the editor. */
  hasUnsavedEdits: boolean;
  /** The table cannot be edited in that process, so it cannot be written there. */
  unavailable: boolean;
}

export interface ShareTarget {
  processId: string;
  processName: string;
  kind: ShareTargetKind;
  /** One sentence for the confirmation. */
  text: string;
  /** False when the process already ends up as it would after the write, so writing is pointless. */
  willChange: boolean;
}

const TARGET_TEXT: Record<ShareTargetKind, string> = {
  'has-edits': 'Has unsaved changes, which will be replaced.',
  'replaces-own-rows': 'Has its own different rows, which will be replaced.',
  'already-has-rows': 'Already has these rows.',
  'creates-copy': 'Uses the publisher defaults and will get its own copy.',
  'restores-defaults': 'Has its own rows, which will go back to the defaults.',
  'already-defaults': 'Already uses the defaults.',
};

/** True when both are the same table of text, cell by cell. */
export function sameRows(a: Rows, b: Rows): boolean {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    const left = a[r];
    const right = b[r];
    if (left.length !== right.length) return false;
    for (let c = 0; c < left.length; c++) if (left[c] !== right[c]) return false;
  }
  return true;
}

/**
 * For each OTHER process that has the open table, what saving (`mode: 'save'`, with `rows`) or
 * resetting (`mode: 'reset'`) the open table would do there. A process whose table cannot be
 * edited is left out, as it cannot be written. The open process itself is left out too. The answer
 * keeps the order of `others`.
 */
export function describeShareTargets(
  open: { processId: string; tableId: string },
  mode: 'save' | 'reset',
  rows: Rows,
  others: readonly ShareCandidate[]
): ShareTarget[] {
  const targets: ShareTarget[] = [];
  for (const other of others) {
    if (other.unavailable || other.processId === open.processId) continue;
    let kind: ShareTargetKind;
    if (other.hasUnsavedEdits) kind = 'has-edits';
    else if (mode === 'reset') kind = other.overridden ? 'restores-defaults' : 'already-defaults';
    else if (!other.overridden) kind = 'creates-copy';
    else kind = sameRows(other.rows, rows) ? 'already-has-rows' : 'replaces-own-rows';
    targets.push({
      processId: other.processId,
      processName: other.processName,
      kind,
      text: TARGET_TEXT[kind],
      willChange: kind !== 'already-has-rows' && kind !== 'already-defaults',
    });
  }
  return targets;
}

// ---- a failed save ----

export type SaveErrorKind =
  | 'conflict'
  | 'busy'
  | 'too-large'
  | 'not-found'
  | 'not-verified'
  | 'rejected'
  | 'throttled'
  | 'session'
  | 'too-old'
  | 'network'
  | 'invalid'
  | 'other';

export interface SaveErrorInfo {
  kind: SaveErrorKind;
  /** A plain sentence for the customer. */
  message: string;
  /** For `conflict`: the stamp of the table as it is now, so the customer may choose to overwrite it. */
  currentStamp?: string;
}

const INVALID_FALLBACK = 'The server did not accept this table. Check the values and try again.';
const OTHER_FALLBACK = 'The table could not be saved. Try again.';

/** The server's text when it is a short plain sentence, otherwise null (an HTML page, "HTTP 500", a wall of text). */
function plainText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 300 || text.startsWith('<') || /^HTTP \d{3}$/.test(text)) return null;
  return text;
}

/**
 * Turns whatever a save or reset threw into a kind and a message. It reads an `HttpError` by its
 * shape (`status`, and the server's `error` and `code` in `body`), so it needs no import of the HTTP
 * client. The server's codes are in `body.code`; the status decides when a code is missing.
 */
export function classifySaveError(err: unknown): SaveErrorInfo {
  if (isSessionError(err)) return { kind: 'session', message: getSessionMessage() };

  const e = (err ?? {}) as { status?: unknown; body?: unknown; message?: unknown };
  const status = typeof e.status === 'number' ? e.status : undefined;
  const body = e.body && typeof e.body === 'object' ? (e.body as { code?: unknown; error?: unknown; currentStamp?: unknown }) : undefined;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  const serverText = (): string | null => plainText(body?.error) ?? plainText(e.message) ?? (typeof err === 'string' ? plainText(err) : null);

  if (code === 'TABLE_CHANGED') {
    return {
      kind: 'conflict',
      message: 'This table was changed by someone else after you opened it.',
      ...(typeof body?.currentStamp === 'string' ? { currentStamp: body.currentStamp } : {}),
    };
  }
  if (code === 'TABLE_BUSY') {
    return { kind: 'busy', message: 'Another save of this table is still running. Try again in a moment.' };
  }
  if (status === 413 || code === 'TOO_LARGE') return { kind: 'too-large', message: 'This table is too large to save.' };
  if (code === 'TABLE_NOT_FOUND') {
    return {
      kind: 'not-found',
      message: 'This table is no longer part of this process, so it cannot be saved. Reload the screen.',
    };
  }
  if (status === 404 || status === 501) {
    return {
      kind: 'too-old',
      message: 'This server does not support saving cross reference tables yet. Update the embedkit server and try again.',
    };
  }
  if (code === 'SAVE_NOT_VERIFIED') {
    return {
      kind: 'not-verified',
      message: 'Boomi accepted the save but the table does not read back as saved. Check the table and try again.',
    };
  }
  if (code === 'BOOMI_REJECTED') {
    return {
      kind: 'rejected',
      message: 'Boomi did not accept the save. Check that the account the server uses to reach Boomi may edit environment extensions.',
    };
  }
  if (status === 503 || status === 429 || code === 'THROTTLED') {
    return { kind: 'throttled', message: 'Boomi is busy right now. Try again in a moment.' };
  }
  if (status === 400) return { kind: 'invalid', message: serverText() ?? INVALID_FALLBACK };
  if (status === 0) {
    return { kind: 'network', message: 'The server could not be reached. Check your connection and try again.' };
  }
  return { kind: 'other', message: serverText() ?? OTHER_FALLBACK };
}
