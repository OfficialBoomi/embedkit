/**
 * @file environmentExtensionsService.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import {  
  UISide, 
  UIFieldError,
  FieldWithUI,
  BrowseCandidateResponse,
  EnvExtMinimal,
  Field,
  Conn
 } from '@boomi/embedkit-sdk';
import logger from '../../logger.service';

/** ---------- Types ---------- */

export type AccessTokenFieldData = {
  connectionId: string;
  fieldId: string;
  fetchedURL: string;
};

export type CompletenessOptions = {
  /** Ignore certain field ids (case-insensitive substring match usually enough) */
  ignoreField?: (fieldId: string) => boolean;
  /** Treat encrypted fields with encryptedValueSet=true as “has value” (default: true) */
  treatEncryptedAsSet?: boolean;
  /** Ignore the special process property named "_validation" (default: true) */
  ignoreValidationProp?: boolean;
};

/** ---------- Pure / Focused Helpers ---------- */

/** Normalize error to a string. */
export function normalizeError(err: any): string {
  return (
    err?.response?.data?.message ||
    err?.message ||
    'Code [2004] - Unknown error fetching environment extensions'
  );
}


/**  Small helper to match a field by id or name against the browse param */
const fieldMatchesParam = (f: Field, paramName: string) => {
  const fid = (f as any)?.id ?? (f as any)?.['@id'];
  const fname = (f as any)?.name ?? (f as any)?.['@name'];
  return fid === paramName || fname === paramName;
};

/* Update connections with errors */
export async function updateEditedWithErrors(
  errors: BrowseCandidateResponse,
  edits: EnvExtMinimal[]
): Promise<EnvExtMinimal[]> {
  if (!errors?.failedCandidates?.length || !edits?.length) return edits;
  const idx = new Map<string, Map<string, Map<string, UISide>>>();
  for (const e of errors?.failedCandidates) {
    const envId = e.environmentId;
    const connId = e.connectionId;
    const field = e.paramName;

    if (!envId || !connId || !field) continue;

    const byConn = idx.get(envId) ?? new Map<string, Map<string, UISide>>();
    const byField = byConn.get(connId) ?? new Map<string, UISide>();
    byField.set(field, (e.candidateSource as UISide) ?? undefined);
    byConn.set(connId, byField);
    idx.set(envId, byConn);
  }

  if (idx.size === 0) return edits;

  const DEFAULT_MESSAGE =
    'Please supply valid credentials and try again.';

  const out = edits.map((env) => {
    const envErrs = env?.environmentId ? idx.get(env.environmentId) : undefined;
    if (!envErrs) return env;

    const conns = env.connections?.connection ?? [];
    let envChanged = false;

    const newConnections = conns.map((conn) => {
      const connId = (conn as Conn)?.id;
      if (!connId) return conn;

      const fieldErrs = envErrs.get(connId);
      if (!fieldErrs || !(conn.field?.length)) return conn;

      let connChanged = false;
      const newFields = (conn.field as Field[]).map((f) => {
        for (const [paramName, side] of fieldErrs.entries()) {
          if (fieldMatchesParam(f, paramName)) {
            connChanged = true;
            envChanged = true;
            const prevUI = (f as any).__ui as UIFieldError | undefined;
            const flagged: FieldWithUI = {
              ...(f as any),
              __ui: {
                ...prevUI,
                invalid: true,
                message: prevUI?.message || DEFAULT_MESSAGE,
                side,
                connectionId: connId,
                fieldName: paramName,
              },
            };
            logger.error('UI FLAG', {
              fieldId: (f as any).id ?? (f as any)['@id'],
              label: (f as any).label ?? (f as any).name ?? (f as any)['@name'],
              assignedMessage: prevUI?.message || DEFAULT_MESSAGE,
            });
            return flagged as unknown as Field;
          }
        }
        return f;
      });
      return connChanged ? ({ ...conn, field: newFields } as Conn) : conn;
    });

    return envChanged
      ? {
          ...env,
          connections: { connection: newConnections as any },
        }
      : env;
  });
  return out;
}

/**
 * Returns true if all required connection fields and process property values are present.
 * - Empty strings or whitespace-only values are treated as missing.
 * - Encrypted fields count as present if encryptedValueSet === true (configurable).
 * - Skips the "_validation" process property by default.
 * - Skips fields whose id contains "clientSecret" or "accessToken" by default (configurable).
 */
export function hasAllEnvExtValues(
  extensions: EnvExtMinimal[] | undefined | null,
  opts: CompletenessOptions = {}
): boolean {
  logger.debug('Checking environment extensions completeness');
  if (!extensions || extensions.length === 0) return true;
  const {
    treatEncryptedAsSet = true,
    ignoreValidationProp = true,
    ignoreField = (fieldId: string) => {
      const id = (fieldId || '').toLowerCase();
      return id.includes('clientsecret') || id.includes('accesstoken');
    },
  } = opts;

  const isNonEmpty = (v: unknown) =>
    typeof v === 'string' ? v.trim().length > 0 : v != null;

  for (const ext of extensions) {
    const conns = ext?.connections?.connection ?? [];
    for (const conn of conns) {
      const fields = (conn as any)?.field as Field[] | undefined;
      if (!fields || fields.length === 0) continue;

      for (const f of fields) {
        const fid: string =
          (f as any)?.id ??
          (f as any)?.['@id'] ??
          (f as any)?.name ??
          (f as any)?.['@name'] ??
          '';

        // Skip ignorable ids (e.g., clientSecret/accessToken)
        if (fid && ignoreField(fid)) continue;

        // Encrypted fields count as present if encryptedValueSet is true
        if (treatEncryptedAsSet && (f as any)?.encryptedValueSet === true) continue;

        // Otherwise require a concrete non-empty value
        if (!isNonEmpty((f as any)?.value)) {
          logger.debug('Missing connection field value', {
            environmentId: ext?.environmentId,
            connectionId: (conn as any)?.id,
            fieldId: fid,
          });
          return false;
        }
      }
    }

    // ---- Process Properties ----
    const props = ext?.processProperties?.ProcessProperty ?? [];
    for (const p of props) {
      if (!p) continue;
      if (ignoreValidationProp && p.name === '_validation' || p.ProcessPropertyValue?.length === 0) continue;

      const vals = p.ProcessPropertyValue ?? [];
      if (vals.length === 0) {
        logger.debug('Missing process property values', {
          environmentId: ext?.environmentId,
          processPropertyId: p.id,
          processPropertyName: p.name,
        });
        return false;
      }

      for (const v of vals) {
        if (!isNonEmpty(v?.value)) {
          logger.debug('Empty process property value', {
            environmentId: ext?.environmentId,
            processPropertyId: p.id,
            key: v?.key,
          });
          return false;
        }
      }
    }
  }
  logger.debug('All environment extension values present');
  return true;
}
