/**
 * @file UpdateConnections.tsx
 * @component UpdateConnections
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders UI for managing environment connections of a Boomi integration pack.
 * Handles loading existing connections, updating them via forms, and submitting changes.
 * Supports loading and error states. Can be used as a step within a wizard.
 *
 * @return {JSX.Element} The rendered UpdateConnections component.
 */

import {
  useEffect,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { usePlugin } from '../../context/pluginContext';
import { IntegrationPackInstance, EnvExtMinimal } from '@boomi/embedkit-sdk';
import { useUpdateEnvironmentExtensions } from '../../hooks/environment-extensions/useUpdateEnvironmentExtensions';
import { useFetchEnvironmentExtensions } from '../../hooks/environment-extensions/useFetchEnvironmentExtensions';
import { useFetchOauth2Url } from '../../hooks/environment-extensions/useFetchOauth2Url';
import { useFetchEnvironmentExtensionConnectionStatus } from '../../hooks/environment-extensions/useFetchEnvironmentExtensionConnectionStatus';
import AjaxLoader from '../ui/AjaxLoader';
import Button from '../ui/Button';
import ConnectorForm, { ConnectorFormRef } from './ConnectorForm';
import Dialog from '../ui/Dialog';
import Page from '../core/Page';
import logger from '../../logger.service';

/**
 * @typedef UpdateConnectionsRef
 *
 * @description
 * Methods exposed to parent components for controlling the `UpdateConnections` component.
 *
 * @property {boolean} [componentKey] - Unique key for the component instance
 * @property {() => Promise<boolean>} submit - Submits the current connection updates. Returns `true` if successful.
 * @property {() => void} load - Reloads the connection data.
 */
export type UpdateConnectionsRef = {
  submit: () => Promise<boolean>;
};

/**
 * @interface UpdateConnectionsProps
 *
 * @description
 * Props for the `UpdateConnections` component.
 *
 * @property {IntegrationPack} integration - The integration pack to update connections for.
 * @property {boolean} active - Whether this component is currently active/visible.
 * @property {boolean} wizard - Indicates if the component is used inside a wizard flow.
 * @property {() => void} [onSubmit] - Optional callback invoked after a successful submit.
 * @property {(val: boolean) => void} [setIsLoading] - Optional callback to set loading state externally.
 * @property {() => void} [onBack] - Optional callback invoked when navigating back.
 */
export interface UpdateConnectionsProps {
  componentKey: string
  integration: IntegrationPackInstance;
  active: boolean;
  wizard: boolean;
  simple?: boolean;
  onSubmit?: () => void;
  setIsLoading?: (val: boolean) => void;
  onBack?: () => void;
}

const UpdateConnections = forwardRef<UpdateConnectionsRef, UpdateConnectionsProps>(
  ({
    componentKey,
    integration,
    active,
    wizard,
    simple,
    onSubmit,
    onBack,
    setIsLoading,
  }, ref) => {

  const { boomiConfig, renderComponent } = usePlugin();
  const connectorFormRef = useRef<ConnectorFormRef>(null);
  const { updateFromCombined, editedConnections } = useUpdateEnvironmentExtensions();
  const { extensions, rawExtensions, isLoading, fetchEnvironmentExtensions } =
    useFetchEnvironmentExtensions();
  const [apiError, setApiError] = useState<string | null>(null);
  const [connections, setConnections] = useState<EnvExtMinimal[] | null>(null);
  const { url, isLoading: authLoading, error, fetchOauth2Url } = useFetchOauth2Url();
  const { status, fetchEnvironmentExtensionConnectionStatus } = useFetchEnvironmentExtensionConnectionStatus();
  const [authBusy, setAuthBusy] = useState<Record<string, boolean>>({});
  const [authConnected, setAuthConnected] = useState<Record<string, boolean>>({});
  const [authMessage, setAuthMessage] = useState<Record<string, string | null>>({});
  const popupRef = useRef<Window | null>(null);
  const pollersRef = useRef<
    Record<string, { interval?: number; timeout?: number; watch?: number }>
  >({});
  const keyFor = (connectionId: string, fieldId: string) => `${connectionId}:${fieldId}`;

  const handleSubmit = async () => {
    setApiError(null);
    try {
      const payload = connectorFormRef.current?.validateAndSubmit();
      if (!payload || !integration.environmentId) {
        logger.warn('Connector form is invalid or missing environmentId');
        return false;
      }

      setIsLoading?.(true);
      await updateFromCombined(rawExtensions ?? [], payload ?? [], integration.environmentId, integration.id || '');
      setIsLoading?.(false);
      onSubmit?.();
      return true;
    } catch (error: any) {
      setIsLoading?.(false);
      setApiError(error.message || 'Failed to update environment extensions');
      logger.error('Update error:', error);
      return false;
    }
  };

  const handleRenderHome = (updated: boolean) => {
    renderComponent?.({
      component: 'Integrations',
      props: {
        componentKey: componentKey || 'integrationsMain'
      },
    });
  };

  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
  }));

  const handleCancel = () => handleRenderHome(false);
  const handleSave = async () => {
    const ok = await handleSubmit();
    if (ok) handleRenderHome(true);
  };

  const startPollingConnection = (
    connectionId: string,
    fieldId: string,
    onDone: (success: boolean) => void
  ) => {
    const key = keyFor(connectionId, fieldId);
    const prior = pollersRef.current[key];
    if (prior?.interval) window.clearInterval(prior.interval);
    if (prior?.timeout) window.clearTimeout(prior.timeout);
    if (prior?.watch) window.clearInterval(prior.watch);

    // 2-minute timeout → close popup here
    const timeout = window.setTimeout(() => {
      stopPolling(key, {
        success: false,
        message: 'Authentication timed out. Please try again.',
        closePopup: true,
      });
      onDone(false);
    }, 120_000);

    // Poll every 5s
    const interval = window.setInterval(async () => {
      try {
        const result = await fetchEnvironmentExtensionConnectionStatus(
          integration.environmentId!,
          integration.id || '',
          connectionId,
          fieldId
        );
        const connected = !!(result === true || (result as any)?.connected || (result as any)?.status === 'CONNECTED');

        if (connected) {
          stopPolling(key, { success: true, message: null, closePopup: true });
          const isSingle = integration.installationType === 'SINGLE' || false;
          logger.debug('Connection authorized, reloading extensions', { isSingle });
          await fetchEnvironmentExtensions([], integration.environmentId!, integration.id || '', isSingle);
          onDone(true);
        } else {
          setAuthMessage((s) => ({ ...s, [key]: 'Waiting for connection to complete…' }));
        }
      } catch (e) {
        logger.warn('Polling error (connection status)', e);
      }
    }, 5000);

    const watch = window.setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        stopPolling(key, {
          success: false,
          message: 'Authorization window closed.',
          closePopup: false,
        });
        onDone(false);
      }
    }, 500);

    pollersRef.current[key] = { interval, timeout, watch };
  };

  const stopPolling = (key: string, {
    success,
    message,
    closePopup = true,
  }: { success: boolean; message?: string | null; closePopup?: boolean }) => {
    const p = pollersRef.current[key];
    if (p?.interval) window.clearInterval(p.interval);
    if (p?.timeout) window.clearTimeout(p.timeout);
    if (p?.watch) window.clearInterval(p.watch);
    delete pollersRef.current[key];

    setAuthBusy((s) => ({ ...s, [key]: false }));
    setAuthConnected((s) => ({ ...s, [key]: success }));
    if (message !== undefined) setAuthMessage((s) => ({ ...s, [key]: message }));

    if (closePopup) {
      try {
        if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      } catch { /* ignore */ }
    }
  };

  const handleAuthConnection = async (connectionId: string, fieldId: string) => {
    const key = keyFor(connectionId, fieldId);
    logger.log('Authenticate connection:', { connectionId, fieldId });

    setAuthBusy((s) => ({ ...s, [key]: true }));
    setAuthConnected((s) => ({ ...s, [key]: false }));
    setAuthMessage((s) => ({ ...s, [key]: 'Opening authorization window…' }));

    const w = 600, h = 750;
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top  = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    const popup = window.open('', 'oauth2_auth', `width=${w},height=${h},left=${left},top=${top},resizable,scrollbars`);
    popupRef.current = popup ?? null;

    try {
      const authUrl = await fetchOauth2Url(
        integration.id || '',
        integration.environmentId!,
        connectionId,
        fieldId
      );

      if (popupRef.current) popupRef.current.location.href = authUrl;
      else window.location.assign(authUrl);

      setAuthMessage((s) => ({ ...s, [key]: 'Please complete authentication in the new window…' }));

      startPollingConnection(connectionId, fieldId, (success) => {
        if (!success) {
          try {
            if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
          } catch { /* ignore */ }
        }
      });
    } catch (err: any) {
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      setAuthBusy((s) => ({ ...s, [key]: false }));
      setAuthMessage((s) => ({ ...s, [key]: null }));

      const msg = err?.message || 'Failed to fetch OAuth2 URL';
      setApiError(msg);
      logger.error('Failed to fetch oauth2Url', err);
    }
  };


  useEffect(() => {
    if (editedConnections && editedConnections.length > 0) {
      setConnections(editedConnections);
    }
  }, [editedConnections]);

  useEffect(() => {
    if (extensions) setConnections(extensions);
  }, [extensions]);

  useEffect(() => {
    return () => {
      Object.values(pollersRef.current).forEach(({ interval, timeout }) => {
        if (interval) window.clearInterval(interval);
        if (timeout) window.clearTimeout(timeout);
      });
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!integration?.environmentId || !integration?.id) return;
    if (active || !wizard) {
      fetchEnvironmentExtensions([], integration.environmentId, integration.id)
        .catch(err => {
          setApiError(err.message);
          logger.error('Failed to fetch environment extensions', err);
        });
    }
  }, [active, wizard, integration.environmentId, integration.id]);


  const showTitle = boomiConfig?.components?.[componentKey]?.updateConnections?.showTitle ?? true;
  const panelTitle =
    boomiConfig?.components?.[componentKey]?.updateConnections?.title ?? 'Update Connections';
  const showDescription = boomiConfig?.components?.[componentKey]?.updateConnections?.showDescription ?? true;
  const panelDesc =
    boomiConfig?.components?.[componentKey]?.updateConnections?.description ??
    'Please provide the necessary information to make connections to your target systems.';

  const bodyContent = (
    <>
      <div className={`${wizard && !simple ? 'boomi-update-wizard': 'boomi-update'}`}>
        {(showTitle || showDescription) && (
          <div className="boomi-update-header">
            {showTitle && <div className="boomi-update-title">{panelTitle}</div>}
            {showDescription && <div className="boomi-update-desc">{panelDesc}</div>}
          </div>
        )}

        {isLoading && !connections ? (
          <div className="boomi-center pt-6 m-6">
            <AjaxLoader message="Retrieving Connection Information..." />
          </div>
        ) : (
          <div className="boomi-update-body">
            {apiError && (
              <Dialog
                error={{
                  header: 'Error Updating Connections',
                  message: apiError,
                  errorType: 'error',
                }}
              />
            )}
            <ConnectorForm
              ref={connectorFormRef}
              extensions={connections || []}
              onAuthConnection={handleAuthConnection}
              authBusy={authBusy}
              authConnected={authConnected}
              authMessage={authMessage}
            />

            {!wizard || simple && (
              <div className="boomi-update-actions">
                <Button
                  toggle={false}
                  primary={false}
                  showIcon={false}
                  label="Cancel"
                  onClick={handleCancel}
                />
                <Button
                  toggle={false}
                  primary={true}
                  showIcon={false}
                  label="Save"
                  onClick={handleSave}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>

  );

  return !wizard ? (
    <>
      <Page
        componentKey={componentKey}
        componentName="updateConnections"
        isRootNavigation={false}
        title={`Update Connections ${integration.integrationPackOverrideName ?? ''}`}
        description={integration.integrationPackDescription || ''}
        headerContent={<></>}
        bodyContent={bodyContent}
        footerContent={<></>}
        levelOne="My Integrations"
        callbackOne={onBack}
      />
    </>
  ) : (
    <>{bodyContent}</>
  ); 
}); 

UpdateConnections.displayName = 'UpdateConnections';
export default UpdateConnections;