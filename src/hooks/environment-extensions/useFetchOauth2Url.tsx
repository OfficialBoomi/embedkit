/**
 * @file useFetchOauth2Url.tsx
 * @function useFetchOauth2Url
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * React hook that generates a provider OAuth2 authorization URL via Boomi's
 * `EnvironmentOAuth2AccessTokenExtensionGenerationRequest/execute` SOAP endpoint.
 *
 * This version both:
 *  1) Updates local state (`url`, `isLoading`, `error`) for UI binding, and
 *  2) Directly RETURNS the generated authorization URL from `fetchOauth2Url(...)`
 *     so callers can immediately navigate a pre-opened popup and avoid popup blockers.
 *
 * Notes:
 * - Sends raw SOAP XML (do NOT JSON.stringify).
 * - Looks up per-connection credentials in `boomiConfig.oauth2.connections[connectionId]`.
 * - Tolerates namespaced response keys (e.g., `bns:authorizationCodeRequestUrl`).
 */

import { useState, useCallback } from 'react';
import { useEnvironmentExtensionsService } from '../../service/environmentExtensions.service';
import logger from '../../logger.service';

/**
 * Function signature for generating the OAuth2 URL for a specific
 * Integration Pack Instance, Environment, Connection, and OAuth field.
 *
 * @param {string} integrationPackInstanceId - ID of the Integration Pack Instance.
 * @param {string} environmentId - Target Environment ID.
 * @param {string} connectionId - Connection ID used to locate client credentials in config.
 * @param {string} oAuthFieldId - OAuth2 field ID within the environment extensions.
 *
 * @returns {Promise<string>} The provider authorization URL to which the user should be sent.
 *
 * @throws {Error}
 *  - If required inputs are missing.
 *  - If Boomi client is unavailable.
 *  - If the connection’s `clientId`/`clientSecret` are not configured.
 *  - If the SOAP response does not contain an authorization URL.
 */
type FetchOauth2Url = (
  integrationPackInstanceId: string,
  environmentId: string,
  connectionId: string,
  oAuthFieldId: string
) => Promise<string>;

/**
 * @typedef UseFetchOauth2UrlReturn
 * @property {string | null} url - Last generated authorization URL (also returned directly by `fetchOauth2Url`).
 * @property {FetchOauth2Url} fetchOauth2Url - Generates the authorization URL and returns it directly.
 * @property {boolean} isLoading - True while the SOAP request is in-flight.
 * @property {string | null} error - Non-null when a recoverable error occurs.
 */
export const useFetchOauth2Url = () => {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { fetchOauth2Url: fetchUrl} = useEnvironmentExtensionsService();

  /**
   * @function fetchOauth2Url
   *
   * @description
   * Builds and sends a SOAP request to Boomi to generate an OAuth2 authorization
   * URL for the specified connection/field. Parses the SOAP response to extract
   * the URL, handling potential XML namespaces. Updates local state and also
   * returns the URL directly for immediate use.
   *
   * Implementation details:
   *  - Validates required inputs
   *  - Resolves connection credentials from `boomiConfig.oauth2.connections`
   *  - Resolves the process/extension group ID via `fetchFirstProcess`
   *  - Sends raw SOAP XML to Boomi execute endpoint
   *  - Extracts `authorizationCodeRequestUrl` (namespace-agnostic)
   */
  const fetchOauth2Url: FetchOauth2Url = useCallback(async (
    integrationPackInstanceId,
    environmentId,
    connectionId,
    oAuthFieldId
  ) => {
    const ipi = integrationPackInstanceId?.trim();
    const envId = environmentId?.trim();
    const connId = connectionId?.trim();
    const fieldId = oAuthFieldId?.trim();

    logger.debug('useFetchOauth2Url: Fetching url...', ipi, envId, connId, fieldId);

    const hasValidEnvInput = !!ipi && !!envId && !!connId && !!fieldId;

    try {
      setIsLoading(true);
      setError(null);

      if (!hasValidEnvInput) {
        throw new Error('Missing required inputs: integrationPackInstanceId, environmentId, connectionId, oAuthFieldId.');
      }

      const extractedUrl = await fetchUrl({
        integrationPackInstanceId: ipi,
        environmentId: envId,
        connectionId: connId,
        fieldId: fieldId
      });
      logger.debug('Fetched url:', extractedUrl);
      setUrl(extractedUrl);    
      return extractedUrl;     
    } catch (e: any) {
      const message = e?.message || 'An unknown error occurred while fetching the OAuth2 URL.';
      setError(message);
      logger.error('Failed to fetch OAuth2 URL:', message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { url, fetchOauth2Url, isLoading, error };
};

