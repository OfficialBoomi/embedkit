/**
 * @file EditMapCandidateForm.tsx
 * @component EditMapCandidateForm
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A forwardRef form for collecting required credential/parameter values for
 * dynamic browse. Inputs are grouped by connection (connectionId/connectionName),
 * all fields are password type, and validation is enforced per field.
 *
 * Parent calls `validateAndSubmit()` via ref; if it returns updated candidates,
 * parent can proceed (e.g., close dialog). If it returns `null`, errors are shown inline.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { usePlugin } from '../../context/pluginContext';
import Input from '../ui/Input';
import type { BrowseCandidate } from '@boomi/embedkit-sdk';

export type EditMapCandidateFormResult = {
  candidates: BrowseCandidate[];
};

export type EditMapCandidateFormRef = {
  validateAndSubmit: () => EditMapCandidateFormResult | null;
  isFormReady: () => boolean;
  applyErrors: (errMap: Record<string, Record<string, string>>) => void;
  applyErrorsFromCandidates: (failed: BrowseCandidate[], defaultMessage?: string) => void;
};

type EditMapCandidateFormProps = {
  candidates: BrowseCandidate[];
  formName?: string;
};

type Grouped = Record<
  string, // connectionId
  {
    connectionId: string;
    connectionName: string;
    params: string[]; // paramName[]
  }
>;

type ValueState = Record<string, Record<string, string>>; // values[connectionId][paramName] -> string
type ErrorState = Record<string, Record<string, string>>; // errors[connectionId][paramName] -> error message or ''

const EditMapCandidateForm = forwardRef<EditMapCandidateFormRef, EditMapCandidateFormProps>(
({ candidates, formName = 'editMapCandidateForm'}, ref) => {
    const { boomiConfig } = usePlugin();
    const grouped: Grouped = useMemo(() => {
      const g: Grouped = {};
      for (const c of candidates) {
        if (!g[c.connectionId]) {
          g[c.connectionId] = {
            connectionId: c.connectionId,
            connectionName: c.connectionName || c.connectionId,
            params: [],
          };
        }
        if (!g[c.connectionId].params.includes(c.paramName)) {
          g[c.connectionId].params.push(c.paramName);
        }
      }
      return g;
    }, [candidates]);
    const [values, setValues] = useState<ValueState>({});
    const [errors, setErrors] = useState<ErrorState>({});
    const connectionHasErrors = useCallback(
      (connectionId: string) =>
        !!Object.values(errors[connectionId] ?? {}).find((m) => !!m),
      [errors]
    );

    useEffect(() => {
      const nextValues: ValueState = {};
      const nextErrors: ErrorState = {};

      for (const [connectionId, conn] of Object.entries(grouped)) {
        nextValues[connectionId] = nextValues[connectionId] ?? {};
        nextErrors[connectionId] = nextErrors[connectionId] ?? {};

        for (const paramName of conn.params) {
          const c = candidates.find(
            (x) => x.connectionId === connectionId && x.paramName === paramName
          );
          nextValues[connectionId][paramName] = c?.paramValue ?? '';
          nextErrors[connectionId][paramName] = '';
        }
      }

      setValues(nextValues);
      setErrors(nextErrors);
    }, [grouped, candidates]);

    const getValidationRegexForParam = useCallback(
      (paramName: string): RegExp | null => {
        const raw =
          boomiConfig?.form?.editMapCandidateForm?.[paramName]?.validation ??
          null;
        if (!raw) return null;
        try {
          const match = String(raw).match(/^\/(.+)\/([a-z]*)$/i);
          return match ? new RegExp(match[1], match[2]) : new RegExp(String(raw));
        } catch {
          return null;
        }
      },
      [boomiConfig]
    );

    const validateField = useCallback(
      (connectionId: string, paramName: string, val: string): string => {
        if (!val || !val.trim()) return 'Required';
        const re = getValidationRegexForParam(paramName);
        if (re && !re.test(val)) return 'Invalid format';

        return '';
      },
      [getValidationRegexForParam]
    );

    const validateAll = useCallback(() => {
      const nextErrors: ErrorState = {};
      let hasAnyError = false;

      for (const [connectionId, conn] of Object.entries(grouped)) {
        nextErrors[connectionId] = nextErrors[connectionId] ?? {};
        for (const paramName of conn.params) {
          const v = values[connectionId]?.[paramName] ?? '';
          const message = validateField(connectionId, paramName, v);
          nextErrors[connectionId][paramName] = message;
          if (message) hasAnyError = true;
        }
      }

      setErrors(nextErrors);
      return !hasAnyError;
    }, [grouped, values, validateField]);

    const isReady = useMemo(() => {
      for (const [connectionId, conn] of Object.entries(grouped)) {
        for (const p of conn.params) {
          const v = values[connectionId]?.[p] ?? '';
          if (!v || !v.trim()) return false;
          const re = getValidationRegexForParam(p);
          if (re && !re.test(v)) return false;
        }
      }
      return true;
    }, [grouped, values, getValidationRegexForParam]);

    const applyErrors = useCallback((errMap: Record<string, Record<string, string>>) => {
      setErrors((prev) => {
        const next = { ...prev };
        for (const [connId, perParam] of Object.entries(errMap || {})) {
          next[connId] ??= {};
          for (const [param, msg] of Object.entries(perParam || {})) {
            next[connId][param] = msg || 'Invalid value';
          }
        }
        return next;
      });
    }, []);

    const applyErrorsFromCandidates = useCallback(
      (failed: BrowseCandidate[], defaultMessage = 'Please supply valid credentials and try again.') => {
        const map: Record<string, Record<string, string>> = {};
        for (const c of failed || []) {
          if (!c?.connectionId || !c?.paramName) continue;
          const msg =
            (c as any).uiMessage ||
            (c as any).message ||
            defaultMessage;
          map[c.connectionId] ??= {};
          map[c.connectionId][c.paramName] = msg;
        }
        applyErrors(map);
      },
      [applyErrors]
    );

    useImperativeHandle(ref, () => ({
      validateAndSubmit: () => {
        const ok = validateAll();
        if (!ok) return null;
        const updated: BrowseCandidate[] = candidates.map((c) => ({
          ...c,
          paramValue: values[c.connectionId]?.[c.paramName] ?? '',
        }));

        const result: EditMapCandidateFormResult = { candidates: updated };
        return result;
      },
      isFormReady: () => isReady,
      applyErrors,
      applyErrorsFromCandidates,
    }));

    const handleChange = useCallback(
      (connectionId: string, paramName: string, val: string) => {
        setValues((prev) => ({
          ...prev,
          [connectionId]: { ...(prev[connectionId] ?? {}), [paramName]: val },
        }));
        setErrors((prev) => ({
          ...prev,
          [connectionId]: { ...(prev[connectionId] ?? {}), [paramName]: '' },
        }));
      },
      []
    );

    const handleBlur = useCallback(
      (connectionId: string, paramName: string) => {
        const val = values[connectionId]?.[paramName] ?? '';
        const message = validateField(connectionId, paramName, val);
        if (message) {
          setErrors((prev) => ({
            ...prev,
            [connectionId]: { ...(prev[connectionId] ?? {}), [paramName]: message },
          }));
        }
      },
      [values, validateField]
    );

    return (
      <div className="space-y-6">
        {Object.values(grouped).map((conn) => {
          const connError = connectionHasErrors(conn.connectionId);

          return (
            <div key={conn.connectionId} className="boomi-connector-group">
              <div className="boomi-connector-section">
                <h3 className="boomi-connector-heading">
                  {conn.connectionName}
                </h3>

                <div className="grid grid-cols-1 gap-4">
                  {conn.params.map((paramName) => {
                    const val = values[conn.connectionId]?.[paramName] ?? '';
                    const err = errors[conn.connectionId]?.[paramName] ?? '';

                    const inputId = `${formName}-${conn.connectionId}-${paramName}`;
                    const label = paramName; 

                    return (
                      <Input
                        key={inputId}
                        formName={formName}
                        label={label}
                        type="password"
                        required={true}
                        inputName={inputId}
                        value={val}
                        onChange={(e) =>
                          handleChange(conn.connectionId, paramName, e.target.value)
                        }
                        onBlur={() => handleBlur(conn.connectionId, paramName)}
                        error={err}
                        placeholder="Enter value"
                        readOnly={false}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);

EditMapCandidateForm.displayName = 'EditMapCandidateForm';
export default EditMapCandidateForm;
