/**
 * @file ConfigureAgent.tsx
 * @component ConfigureAgent
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * 
 *
 * @return {JSX.Element} 
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
import ConnectorForm, { ConnectorFormRef } from '../integration/ConnectorForm';
import Dialog from '../ui/Dialog';
import logger from '../../logger.service';
import Spinner from '../ui/Spinner';

/**
 * @typedef ConfigureAgentRef
 *
 * @description
 * Methods exposed to parent components for controlling the `ConfigureAgent` component.
 *
 * @property {boolean} [componentKey] - Unique key for the component instance
 * @property {() => Promise<boolean>} submit - Submits the current connection updates. Returns `true` if successful.
 * @property {() => void} load - Reloads the connection data.
 */
export type ConfigureAgentRef = {
  submit: () => Promise<boolean>;
};

/**
 * @interface AgentProps
 *
 * @description Props for the `Agent` component.
 *
 * @property {string} [integrationPackId] - The ID of the integration pack to display.
 * @property {string} [environmentId] - The ID of the environment to filter integrations.
 */
export interface ConfigureAgentProps {
  componentKey: string;
  integration: IntegrationPackInstance;
  onInstalled?: () => void;
  onSubmit?: () => void;
  setIsLoading?: (val: boolean) => void;
  onCancel?: () => void;
}

const ConfigureAgent = forwardRef<ConfigureAgentRef, ConfigureAgentProps>(({
    componentKey,
    integration,
    onSubmit,
    setIsLoading,
    onCancel
  }, ref) => {
  const { boomiConfig, setPageIsLoading } = usePlugin();
  const connectorFormRef = useRef<ConnectorFormRef>(null);
  const { updateFromCombined, editedConnections } = useUpdateEnvironmentExtensions();
  const { extensions, rawExtensions, isLoading, fetchEnvironmentExtensions } =
    useFetchEnvironmentExtensions();
  const [apiError, setApiError] = useState<string | null>(null);
  const [connections, setConnections] = useState<EnvExtMinimal[] | null>(null);
  const { fetchOauth2Url } = useFetchOauth2Url();
  const { fetchEnvironmentExtensionConnectionStatus } = useFetchEnvironmentExtensionConnectionStatus();
  const [authBusy, setAuthBusy] = useState<Record<string, boolean>>({});
  const [authConnected, setAuthConnected] = useState<Record<string, boolean>>({});
  const [authMessage, setAuthMessage] = useState<Record<string, string | null>>({});
  const popupRef = useRef<Window | null>(null);
  const pollersRef = useRef<
    Record<string, { interval?: number; timeout?: number; watch?: number }>
  >({});
  const keyFor = (connectionId: string, fieldId: string) => `${connectionId}:${fieldId}`;

  const [localBusy, setLocalBusy] = useState(false);
  const agentConfig = boomiConfig?.agents?.[integration.integrationPackId || ''];
  const isModalAgent = agentConfig?.ui?.mode === 'modal';
  const setLoading = (val: boolean) => {
    if (isModalAgent) setLocalBusy(val);
    else setPageIsLoading(val);
    setIsLoading?.(val);
  };

  const handleSubmit = async () => {
    setApiError(null);
    setLoading(true);
    try {
      const payload = connectorFormRef.current?.validateAndSubmit();
      if (!payload || !integration.environmentId) {
        logger.warn('Connector form is invalid or missing environmentId');
        return false;
      }
      const isSingle = integration.installationType === 'SINGLE' || false;
      await updateFromCombined(rawExtensions ?? [], payload ?? [], integration.environmentId, integration.id || '', isSingle);
      onSubmit?.();
      return true;
    } catch (error: any) {
      setApiError(error.message || 'Failed to update environment extensions');
      logger.error('Update error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
  }));

  const handleSave = async () => {
    const ok = await handleSubmit();
    if (ok) onCancel?.();
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
          await fetchEnvironmentExtensions(
            [],
            integration.environmentId!,
            integration.id || '',
            true
          );
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
    const isSingle = integration.installationType === 'SINGLE' || false;
    fetchEnvironmentExtensions([], integration.environmentId, integration.id, isSingle)
      .catch(err => {
        setApiError(err.message);
        logger.error('Failed to fetch environment extensions', err);
      });
  }, [integration.environmentId, integration.id]);

  const showTitle = boomiConfig?.agents?.[componentKey]?.form?.configureAgent?.showTitle ?? true;
  const panelTitle =
    boomiConfig?.agents?.[componentKey]?.form?.configureAgent?.title ?? 'Update Connections';
  const showDescription = boomiConfig?.agents?.[componentKey]?.form?.configureAgent?.showDescription ?? true;
  const panelDesc =
    boomiConfig?.agents?.[componentKey]?.form?.configureAgent?.description ??
    'Please provide the necessary information to make connections to your target systems.';

  const bodyContent = (
    <>
      <div className="boomi-agent-update p-2">
        {isModalAgent && localBusy && (
          <Spinner variant="contained" message="Updating..." />
        )}
        {isLoading && !connections ? (
          <div className="boomi-center pt-6 m-6">
            <AjaxLoader message="Loading..." />
          </div>
        ) : (
          <div className="boomi-agent-update__body">
            {apiError && (
              <Dialog
                error={{
                  header: 'Error',
                  message: apiError,
                  errorType: 'error',
                }}
              />
            )}
            {showTitle || showDescription ? (
              <div className="boomi-agent-update__header">
                {showTitle && (
                  <div className="boomi-agent-update__title">
                    {panelTitle} 
                  </div>
                )}
                {showDescription && (
                  <div className="boomi-agent-update__desc">
                    {panelDesc}
                  </div>
                )}
              </div>
            ) : null} 
            <ConnectorForm
              ref={connectorFormRef}
              extensions={connections || []}
              onAuthConnection={handleAuthConnection}
              authBusy={authBusy}
              authConnected={authConnected}
              authMessage={authMessage}
              propertiesName="Agent Properties"
            />
            <div className="boomi-agent-update__actions">
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label="Cancel"
                onClick={onCancel}
              />
              <Button
                toggle={false}
                primary={true}
                showIcon={false}
                label="Save"
                onClick={handleSave}
              />
            </div>

          </div>
        )}
      </div>
    </>
  );

  return (
    <>{bodyContent}</>
  );
});

export default ConfigureAgent;
