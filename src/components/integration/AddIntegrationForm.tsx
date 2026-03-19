/**
 * @file AddIntegrationForm.tsx
 * @component AddIntegrationForm
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 * 
 * @description
 * A forwardRef component that lets users configure a new integration by:
 * - Selecting an integration pack
 * - Selecting an environment
 * - Naming the integration
 * 
 * The parent component can invoke `validateAndSubmit()` and `isFormReady()` through the ref.
 * 
 * @return {JSX.Element} A form layout for integration configuration.
 */

import {
  useImperativeHandle,
  forwardRef,
  useState,
  useEffect,
  useCallback
} from 'react';
import { usePlugin } from '../../context/pluginContext';
import { Environment, IntegrationPack } from '@boomi/embedkit-sdk';
import { Option } from '../ui/Dropdown';
import EnvironmentSelect from './EnvironmentSelect';
import Input from '../ui/Input';
import IntegrationPackSelect from './IntegrationPackSelect';
import logger from '../../logger.service';

/**
 * @typedef AddIntegrationFormResult
 * 
 * @description
 * The result returned when the form is successfully validated and submitted.
 * 
 * @property {IntegrationPack} integrationPack - The selected integration pack.
 * @property {any} environment - The selected environment.
 * @property {string} integrationName - The name of the integration.
 */
export type AddIntegrationFormResult = {
  integrationPackId: string;
  environmentId: string;
  integrationName: string;
  isSingle: boolean;
};

/**
 * @interface AddIntegrationProps
 *
 * @description
 * Props for the `AddIntegration` component.
 *
 * @property {boolean} [componentKey] - Unique key for the component instance
 */
export interface AddIntegrationsProps {
  componentKey: string 
}

/**
 * @typedef AddIntegrationFormRef
 * 
 * @description
 * Public methods exposed to parent components via ref.
 * 
 * @property {() => AddIntegrationFormResult | null} validateAndSubmit - Validates and submits the form, returning the result or `null` if validation fails.
 * @property {() => boolean} isFormReady - Returns `true` if the form is ready for submission.
 */
export type AddIntegrationFormRef = {
  validateAndSubmit: () => AddIntegrationFormResult | null;
  isFormReady: () => boolean;
};

const AddIntegrationForm = forwardRef<AddIntegrationFormRef, AddIntegrationsProps>(({
  componentKey
}, ref) => {
    const { boomiConfig } = usePlugin();
    const [integrationPack, setIntegrationPack] = useState<IntegrationPack | null>(null);
    const [environment, setEnvironment] = useState<Environment | null>(null);
    const [integrationName, setIntegrationName] = useState('');
    const [formErrors, setFormErrors] = useState({
      integrationPackId: '',
      environmentId: '',
      integrationName: '',
    });
    const isEnvironmentEnabled = !!integrationPack?.id;
    const showIntegrationPackSelect = boomiConfig?.components?.[componentKey]?.form?.addIntegration?.showIntegrationPackSelect ?? true;
    const defaultIntegrationPackId = boomiConfig?.components?.[componentKey]?.form?.addIntegration?.defaultIntegrationPackId ?? '';
    const showEnvironmentSelect = boomiConfig?.components?.[componentKey]?.form?.addIntegration?.showEnvironmentSelect ?? true;
    const defaultEnvironmentId = boomiConfig?.components?.[componentKey]?.form?.addIntegration?.defaultEnvironmentId ?? '';
    const defaultIntegrationPackName = boomiConfig?.components?.[componentKey]?.form?.addIntegration?.integrationPackName?.defaultIntegrationPackName ?? null;
    const integrationPackNameEditable = boomiConfig?.components?.[componentKey]?.form?.addIntegration?.integrationPackName?.editable ?? false;
    const integrationPackNameLabel = boomiConfig?.components?.[componentKey]?.form?.addIntegration?.integrationPackName?.label ?? 'Integration Name';
    const isNameEnabled = !!environment?.id;
    const isNameLocked = integrationPack?.installationType === 'SINGLE';
    const renderType = boomiConfig?.components?.[componentKey]?.renderType || 'integration';

    useEffect(() => {
      if (integrationPack?.name) {
        setIntegrationName(integrationPack.name);
        setFormErrors((prev) => ({ ...prev, integrationName: '' }));
      }
    }, [integrationPack]);

    const handleIntegrationChange = useCallback((packs: any[]) => {
      const pack = packs[0] || null;
      setIntegrationPack(pack);
      setFormErrors(prev => ({ ...prev, integrationPack: '' }));
    }, []);

    const handleIntegrationBlur = useCallback((pack?: Option) => {
      if (!pack?.id) setFormErrors(prev => ({ ...prev, integrationPack: 'Required' }));
    }, []);

    const handleEnvironmentChange = useCallback((env: { id: string; name: string }) => {
      setEnvironment(env as any);
      setFormErrors(prev => ({ ...prev, environment: '' }));
    }, []);

    const handleEnvironmentBlur = useCallback((env?: Option) => {
      if (!env?.id) setFormErrors(prev => ({ ...prev, environment: 'Required' }));
    }, []);

    useImperativeHandle(ref, () => ({
      validateAndSubmit: () => {
        logger.debug('Validating AddIntegrationForm with state:', {
          integrationPack,
          environment,
          integrationName,
          formErrors
        });
        const integrationPackId = integrationPack?.id || defaultIntegrationPackId || '';
        const environmentId = environment?.id || defaultEnvironmentId || '';
        const iName = integrationName || defaultIntegrationPackName || '';
        const isSingle = integrationPack?.installationType === 'SINGLE';

        logger.debug('Derived IDs:', {
          integrationPackId,
          environmentId,
          iName,
          isSingle
        });

        const errors = {
          integrationPackId: integrationPackId ? '' : 'Required',
          environmentId: environmentId ? '' : 'Required',
          integrationName: iName ? '' : 'Required',
        };

        const regex = boomiConfig?.components?.[componentKey]?.form?.addIntegrationForm?.['integrationName']?.validation;
        if (iName && regex && !new RegExp(regex).test(iName)) {
          errors.integrationName = 'Invalid format';
        }

        setFormErrors(errors);

        const hasError = Object.values(errors).some((e) => !!e);
        if (hasError || !integrationPackId || !environmentId) return null;

        return {
          integrationPackId,
          environmentId,
          integrationName: iName,
          isSingle
        };
      },
      isFormReady: () => !!integrationName,
    }));

  return (
    <div className="space-y-4 relative">
      {showIntegrationPackSelect && (
        <IntegrationPackSelect
          formName="addIntegrationForm"
          onIntegrationChange={handleIntegrationChange}
          onBlur={handleIntegrationBlur}
          showLoading
          loadingMessage={boomiConfig?.components?.[componentKey]?.form?.addIntegration?.integrationPackSelect?.loadingMessage || 'Loading...'}
          validationError={formErrors.integrationPackId}
          label={boomiConfig?.components?.[componentKey]?.form?.addIntegration?.integrationPackSelect?.label || 'Available Integrations'}
          renderType={renderType}
        />
      )}
      {showEnvironmentSelect && (
        <EnvironmentSelect
          componentKey={componentKey}
          formName="addIntegrationForm"
          disabled={!isEnvironmentEnabled}
          onEnvironmentChange={handleEnvironmentChange}
          onBlur={handleEnvironmentBlur}
          showLoading
          loadingMessage="Loading..."
          validationError={formErrors.environmentId}
        />
      )}
      <Input
        formName="addIntegrationForm"
        label={integrationPackNameLabel}
        type="text"
        required={true}
        inputName="integrationName"
        value={integrationName}
        readOnly={integrationPackNameEditable && (isNameLocked || !isNameEnabled)}
        onChange={(e) => {
          setIntegrationName(e.target.value);
          setFormErrors((prev) => ({ ...prev, integrationName: '' }));
        }}
        onBlur={(e) => {
          const val = e.target.value;
          if (!val) {
            setFormErrors((prev) => ({ ...prev, integrationName: 'Required' }));
          } else {
            const regex = boomiConfig?.components?.[componentKey]?.form?.addIntegrationForm?.['integrationName']?.validation;
            if (regex && !new RegExp(regex).test(val)) {
              setFormErrors((prev) => ({ ...prev, integrationName: 'Invalid format' }));
            }
          }
        }}
        error={formErrors.integrationName}
      />
    </div>
  );

  }
);

AddIntegrationForm.displayName = 'AddIntegrationForm';
export default AddIntegrationForm;
