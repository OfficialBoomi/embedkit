/**
 * @file ConnectorForm.tsx
 * @component ConnectorForm
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A forwardRef functional component that renders input fields for each connection and
 * process property in the provided Boomi `EnvExtMinimal` (combined per-environment view).
 * It manages internal state for form values, validation errors, and tracks encrypted
 * field modifications. Exposes a `validateAndSubmit` method on the ref for external
 * validation and form submission.
 */

import {
  useImperativeHandle,
  forwardRef,
  useState,
  useEffect,
} from 'react';
import React from 'react';
import { AiOutlineLock, AiOutlineCheck, AiOutlineReload } from 'react-icons/ai';
import { usePlugin } from '../../context/pluginContext';
import { UIFieldError, EnvExtMinimal } from '@boomi/embedkit-sdk';
import AjaxLoader from '../ui/AjaxLoader';
import Input from '../ui/Input';
import labelMaker from '../../utils/labelMaker';
import Button from '../ui/Button';
import Notification from '../ui/Notification';
import logger from '../../logger.service';


/**
 * @type ConnectorFormRef
 *
 * @description
 * Type for the forwarded ref methods exposed by the ConnectorForm component.
 */
export type ConnectorFormRef = {
  validateAndSubmit: () => EnvExtMinimal[] | null;
};

type EncryptedTracking = Record<string, Record<string, boolean>>;

interface ConnectorFormProps {
  extensions: EnvExtMinimal[];
  onAuthConnection: (connectionId: string, fieldId: string) => void;
  authBusy?: Record<string, boolean>;
  authConnected?: Record<string, boolean>;
  authMessage?: Record<string, string | null>;
  propertiesName?: string;
}

const ConnectorForm = forwardRef<ConnectorFormRef, ConnectorFormProps>(
  ({ extensions, onAuthConnection, authBusy, authConnected, authMessage, propertiesName}, ref) => {
    const { boomiConfig } = usePlugin();
    const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>({});
    const [formErrors, setFormErrors] = useState<Record<string, Record<string, string>>>({});
    const [encryptedTouched, setEncryptedTouched] = useState<EncryptedTracking>({});
    const [connectionErrors, setConnectionErrors] = useState<Record<string, string>>({});
    const [isTokenSet, setTokenSet] = useState<boolean>(false);
    const processPropertiesName = propertiesName || 'Process Properties';

    useEffect(() => {
      const newFormValues: Record<string, Record<string, string>> = {};
      const newFormErrors: Record<string, Record<string, string>> = {};
      const newEncryptedTouched: Record<string, Record<string, boolean>> = {};
      const newConnectionErrors: Record<string, string> = {};

      extensions.forEach((extension) => {
        const connections = extension.connections?.connection ?? [];
        connections.forEach((conn) => {
          const connId = conn.id;
          if (!connId) return;

          newFormValues[connId] = {};
          newFormErrors[connId] = {};
          newEncryptedTouched[connId] = {};

          let anyFieldHasError = false;
          let firstConnErrorMsg: string | undefined;

          const connUi = (conn as any).__ui as UIFieldError | undefined;
          if (connUi?.message?.trim()) {
            anyFieldHasError = true;
            firstConnErrorMsg = connUi.message.trim();
          }

          (conn.field ?? []).forEach((field) => {
            const ui = (field as any).__ui as UIFieldError | undefined;

            const uiMsg = typeof ui?.message === 'string' ? ui.message.trim() : '';
            const hasUiError = Boolean(ui?.invalid) || Boolean(uiMsg);
            if (hasUiError) {
              anyFieldHasError = true;
              if (!firstConnErrorMsg) firstConnErrorMsg = uiMsg || 'Validation Error.';
            }

            const fieldId =
              (field as any).id ??
              (field as any)['@id'] ??
              (field as any).name ??
              (field as any)['@name'];

            if (!fieldId) return;

            const defaultValue = field.encryptedValueSet ? '••••• (stored)' : field.value ?? '';
            newFormValues[connId][fieldId] = defaultValue;
            const fieldErr = hasUiError ? (uiMsg || 'Validation Error.') : '';
            newFormErrors[connId][fieldId] = fieldErr;
            newEncryptedTouched[connId][fieldId] = false;

            const skipClientSecretValidation = fieldId.includes('accessToken');

            if (skipClientSecretValidation && defaultValue !== '') {
              setTokenSet(true);
            }
          });

          newConnectionErrors[connId] = anyFieldHasError
            ? (firstConnErrorMsg ?? 'Validation Error.')
            : '';
        });

        const processProps = extension.processProperties?.ProcessProperty ?? [];
        processProps.forEach((prop) => {
          const propId = prop.id;
          logger.debug('Processing process property:', propId, prop.name);
          if (!propId) return;

          newFormValues[propId] = {};
          newFormErrors[propId] = {};

          (prop.ProcessPropertyValue ?? []).forEach((val) => {
            const key = val.key;
            if (!key) return;

            const isValidationProp = prop.name === '_validation';
            const defaultValue = isValidationProp ? 'validated' : val.value ?? '';
            newFormValues[propId][key] = defaultValue;
            newFormErrors[propId][key] = '';
          });
        });
      });

      setFormValues(newFormValues);
      setFormErrors(newFormErrors);
      setEncryptedTouched(newEncryptedTouched);
      setConnectionErrors(newConnectionErrors);
    }, [extensions]);

    useImperativeHandle(ref, () => ({
      validateAndSubmit: () => {
        let isValid = true;
        const newErrors: Record<string, Record<string, string>> = {};

        for (const groupId in formValues) {
          const isValidationGroup = extensions.some((ext) =>
            ext.processProperties?.ProcessProperty?.some(
              (prop) => prop.id === groupId && prop.name === '_validation'
            )
          );
          if (isValidationGroup) continue;

          for (const fieldId in formValues[groupId]) {
            const value = formValues[groupId][fieldId];
            const errorMessage: string[] = [];

            const isEncrypted = extensions.some((ext) =>
              ext.connections?.connection?.some(
                (conn) =>
                  conn.id === groupId &&
                  (conn.field ?? []).some(
                    (field) => field.id === fieldId && field.encryptedValueSet
                  )
              )
            );

            const wasEncryptedAndUntouched =
              isEncrypted &&
              value === '••••• (stored)' &&
              !encryptedTouched[groupId]?.[fieldId];

            const skipClientSecretValidation = fieldId.includes('accessToken');

            if (skipClientSecretValidation && isEncrypted && encryptedTouched[groupId]?.[fieldId]) {
              setTokenSet(true);
            }

            if (
              !skipClientSecretValidation &&
              !value.trim() &&
              !wasEncryptedAndUntouched
            ) {
              isValid = false;
              errorMessage.push('is required.');
            }

            const regex = boomiConfig?.form?.connectorForm?.[fieldId]?.validation;
            if (regex && !wasEncryptedAndUntouched && !skipClientSecretValidation) {
              try {
                const regexObj = new RegExp(regex);
                if (!regexObj.test(value)) {
                  isValid = false;
                  errorMessage.push('is invalid.');
                }
              } catch (e) {
                logger.warn(`Invalid regex for ${fieldId}: ${regex}`);
              }
            }

            if (errorMessage.length) {
              if (!newErrors[groupId]) newErrors[groupId] = {};
              newErrors[groupId][fieldId] = errorMessage.join(' ');
            }
          }
        }

        setFormErrors(newErrors);
        if (!isValid) return null;
        const updatedExtensions: EnvExtMinimal[] = extensions.map((extension) => {
          const updatedConnections =
            (extension.connections?.connection ?? []).map((conn) => {
              const connId = conn.id;
              if (!connId) return conn;

              const updatedFields =
                (conn.field ?? []).map((field) => {
                  const fieldId = field.id;
                  if (!fieldId) return field;

                  const userModified = encryptedTouched[connId]?.[fieldId];
                  const currentValue = formValues[connId]?.[fieldId] ?? '';

                  const shouldSubmitValue =
                    !field.encryptedValueSet || userModified;

                  const value = shouldSubmitValue
                    ? currentValue
                    : field.value ?? '';

                  return { ...field, value, useDefault: false };
                });

              return { ...conn, field: updatedFields };
            });

          const updatedProcessProps =
            (extension.processProperties?.ProcessProperty ?? []).map((prop) => {
              const propId = prop.id;
              if (!propId) return prop;

              const updatedValues = (prop.ProcessPropertyValue ?? []).map((val) => {
                const k = val.key;
                if (!k) return val;

                const isValidationProp = prop.name === '_validation';
                const newValue = isValidationProp
                  ? (formValues[propId]?.[k] ?? 'validated')
                  : (formValues[propId]?.[k] ?? val.value ?? '');

                return { ...val, value: newValue, useDefault: false };
              });

              return { ...prop, ProcessPropertyValue: updatedValues };
            });

          return {
            id: extension.id,
            environmentId: extension.environmentId,
            extensionGroupId: extension.extensionGroupId,
            connections: { connection: updatedConnections },
            processProperties: { ProcessProperty: updatedProcessProps },
          };
        });

        return updatedExtensions;
      },
    }));
    
    const handleFieldChange = (groupId: string, fieldId: string, value: string) => {
      setFormValues((prev) => ({
        ...prev,
        [groupId]: {
          ...prev[groupId],
          [fieldId]: value,
        },
      }));

      setFormErrors((prev) => ({
        ...prev,
        [groupId]: {
          ...prev[groupId],
          [fieldId]: '',
        },
      }));

      if (value !== '••••• (stored)') {
        setEncryptedTouched((prev) => ({
          ...prev,
          [groupId]: {
            ...(prev[groupId] ?? {}),
            [fieldId]: true,
          },
        }));
      }
    };

    const handleFieldBlur = (groupId: string, fieldId: string, value: string) => {
      const regex = boomiConfig?.form?.connectorForm?.[fieldId]?.validation;
      let errorMessage = '';

      const isEncrypted = extensions.some((ext) =>
        ext.connections?.connection?.some(
          (conn) =>
            conn.id === groupId &&
            (conn.field ?? []).some(
              (field) => field.id === fieldId && field.encryptedValueSet
            )
        )
      );

      const wasEncryptedAndUntouched =
        isEncrypted && value === '••••• (stored)' && !encryptedTouched[groupId]?.[fieldId];

      const skipClientSecretValidation =
        fieldId.includes('clientSecret') || fieldId.includes('accessToken');

      if (!skipClientSecretValidation && !value.trim() && !wasEncryptedAndUntouched) {
        errorMessage = 'is required.';
      } else if (regex && !wasEncryptedAndUntouched && !skipClientSecretValidation) {
        try {
          const regexObj = new RegExp(regex);
          if (!regexObj.test(value)) {
            errorMessage = 'is invalid.';
          }
        } catch {}
      }

      setFormErrors((prev) => ({
        ...prev,
        [groupId]: {
          ...prev[groupId],
          [fieldId]: errorMessage,
        },
      }));
    };

    return (
      <div className="boomi-connector">
        {extensions.map((extension, extIndex) => {
          const connections = extension.connections?.connection ?? [];
          const processProps = extension.processProperties?.ProcessProperty ?? [];

          return (
            <div key={extIndex} className="boomi-connector-group">
              {connections.map((connection, connIndex) => {
                const connId = connection.id;
                if (!connId) return null;
                const connErrorMsg = connectionErrors?.[connId] || '';
                const connErrorId = `conn-error-${(extension.environmentId || 'env')}-${connId}`
                  .replace(/[^a-zA-Z0-9_-]/g, '_');

                return (
                  <React.Fragment key={connId}>
                    <div
                      key={`conn-${connIndex}`}
                      className={[
                        'boomi-connector-section',
                        connErrorMsg ? 'boomi-connector-section--error' : '',
                      ].join(' ').trim()}
                      data-connid={connId}
                      aria-invalid={connErrorMsg ? true : undefined}
                      aria-describedby={connErrorMsg ? connErrorId : undefined}
                    >
                      <h3
                        className={[
                          'boomi-connector-heading',
                          connErrorMsg ? 'boomi-connector-heading--error' : '',
                        ].join(' ').trim()}
                      >
                        {connection.name || connId}
                      </h3>

                      {(connection.field ?? []).map((field, fieldIndex) => {
                        const fieldId = field.id;
                        if (!fieldId) return null;

                        const isClientSecret = fieldId.includes('clientSecret');
                        const isAccessToken = fieldId.includes('accessToken');

                        const value = formValues?.[connId]?.[fieldId] ?? '';
                        const fieldErr = formErrors?.[connId]?.[fieldId] ?? '';
                        const effectiveError = connErrorMsg ? '' : fieldErr;

                        const labelText = labelMaker(fieldId) || fieldId;
                        const fieldType = field.usesEncryption || isClientSecret ? 'password' : 'text';

                        const key = `${connId}:${fieldId}`;
                        const busy = !!authBusy?.[key];
                        const connected = !!authConnected?.[key];
                        const message = authMessage?.[key] ?? null;
                        const isConnected = connected || isTokenSet;
                        const authIcon = busy
                          ? <AiOutlineReload className="w-4 h-4 animate-spin" />
                          : isConnected
                            ? <AiOutlineCheck className="w-5 h-5" />
                            : <AiOutlineLock className="w-5 h-5" />;

                        return (
                          <React.Fragment key={fieldId}>
                            {isAccessToken ? (
                              <div
                                key={`field-${fieldIndex}`}
                                className="boomi-connector-field flex flex-col items-start space-y-2"
                              >
                                {busy ? (
                                  <div className="mt-2" aria-live="polite">
                                    <AjaxLoader message={message ?? 'Authorizing…'} inline align="start" />
                                  </div>
                                ) : (
                                  <>
                                    {isConnected ? (
                                      <Notification
                                        type="Success"
                                        message={message ?? 'Connection is authenticated.'}
                                      />
                                    ) : (
                                      <Notification
                                        type="Warning"
                                        message={message ?? 'Connection is not authenticated.'}
                                      />
                                    )}

                                    <Button
                                      toggle={false}
                                      primary={!isConnected}
                                      showIcon
                                      label={isConnected ? 'Re-Authenticate' : 'Authenticate'}
                                      isLoading={busy}
                                      disabled={busy}
                                      icon={<AiOutlineLock className="w-5 h-5" />}
                                      buttonClass={isConnected ? 'boomi-btn-success' : undefined}
                                      onClick={() => onAuthConnection(connId, fieldId)}
                                    />
                                  </>
                                )}
                              </div>
                            ) : (
                              <div key={`field-${fieldIndex}`} className="boomi-connector-field">
                                <Input
                                  type={fieldType}
                                  formName={`connectionForm-${connId}`}
                                  inputName={fieldId}
                                  label={labelText}
                                  required={!isClientSecret}
                                  value={value}
                                  error={effectiveError}
                                  readOnly={false}
                                  onChange={(e) => handleFieldChange(connId, fieldId, e.target.value)}
                                  onBlur={(e) => handleFieldBlur(connId, fieldId, e.target.value)}
                                />
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {connErrorMsg && (
                      <p
                        id={connErrorId}
                        className="boomi-form-error"
                        role="alert"
                        aria-live="polite"
                      >
                        {connErrorMsg}
                      </p>
                    )}
                  </React.Fragment>
                );
              })}

              {processProps.length > 0 && (
                processProps.map((prop, propIndex) => {
                  const propId = prop.id;
                  if (!propId || prop.name === '_validation' || prop.ProcessPropertyValue?.length === 0) return null;

                  const headingText =
                    prop.name === 'Process Properties'
                      ? processPropertiesName
                      : (prop.name || propId);

                  return (
                    <div key={`prop-${propIndex}`} className="boomi-connector-section">
                      <h3 className="boomi-connector-heading">
                        {headingText}
                      </h3>

                      {(prop.ProcessPropertyValue ?? []).map((val, valIndex) => {
                        const key = val.key;
                        if (!key) return null;
                        const labelText = val.label || key;
                        const value = formValues?.[propId]?.[key] ?? '';
                        const error = formErrors?.[propId]?.[key] ?? '';

                        return (
                          <div key={`ppval-${valIndex}`} className="boomi-connector-field">
                            <Input
                              formName={`processPropForm-${propId}`}
                              inputName={key}
                              label={labelText}
                              required={true}
                              value={value}
                              error={error}
                              readOnly={false}
                              onChange={(e) => handleFieldChange(propId, key, e.target.value)}
                              onBlur={(e) => handleFieldBlur(propId, key, e.target.value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    );
  }
);

ConnectorForm.displayName = 'ConnectorForm';
export default ConnectorForm;
