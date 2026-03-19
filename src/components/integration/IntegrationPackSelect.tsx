/**
 * @file IntegrationPackSelect.tsx
 * @component IntegrationPackSelect
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A presentational component that renders a dropdown for selecting an integration pack.
 * It fetches available integration packs via a hook and supports displaying a loading
 * state, error handling, and validation feedback. Selection changes are communicated
 * via callback props. Styling and labels can be customized through props.
 *
 * @return {JSX.Element} Rendered dropdown component or loading/error state.
 */

import { useState, useEffect, memo } from 'react';
import { 
  useFetchAccountGroupIntegrationPacks 
} from '../../hooks/account-group/useFetchAccountGroupIntegrationPack';
import AjaxLoader from '../ui/AjaxLoader';
import Dropdown, { Option } from '../ui/Dropdown';
import logger from '../../logger.service';

/**
 * @interface IntegrationPackSelectProps
 *
 * @description
 * Props for the `IntegrationPackSelect` component.
 *
 * @property {string} formName - Used to associate to the current form.
 * @property {string} [label='Available Integration'] - Label text shown above the dropdown.
 * @property {boolean} [disabled=false] - Disables the dropdown when `true`.
 * @property {boolean} [showLoading=true] - Whether to show a loading indicator while fetching.
 * @property {string} [loadingMessage='Loading Integrations...'] - Message shown during loading.
 * @property {string|null} [integrationPackId] - ID of the integration pack currently selected.
 * @property {string} [validationError] - Validation error message shown below the dropdown.
 * @property {(packs: any[]) => void} [onIntegrationChange] - Callback invoked when the selected integration pack changes.
 * @property {(selected?: Option) => void} [onBlur] - Optional blur event handler.
 */
interface IntegrationPackSelectProps {
  formName: string;
  renderType: string
  label?: string;
  disabled?: boolean;
  showLoading?: boolean;
  loadingMessage?: string;
  validationError?: string;
  onIntegrationChange?: (packs: any[]) => void;
  onBlur?: (selected?: Option) => void;
}

const IntegrationPackSelect: React.FC<IntegrationPackSelectProps> = ({
  formName,
  renderType = 'all',
  label = 'Available Integration',
  disabled = false,
  showLoading = true,
  loadingMessage = 'Loading Integrations...',
  validationError,
  onIntegrationChange,
  onBlur,
}) => {
  const { integrationPacks, isLoading, error } = useFetchAccountGroupIntegrationPacks({filter: renderType});
  const [options, setOptions] = useState<Option[]>([]);
  const placeholderOption = { id: 'placeholder', name: 'Please select' };
  const [selectedOption, setSelectedOption] = useState<Option>(placeholderOption);
  const integrationPackId = null;

  useEffect(() => {
    if (!integrationPacks) return;

    const mapped = integrationPacks.map((p) => ({ id: p.id, name: p.name }));
    setOptions([placeholderOption, ...mapped]);

    let nextSelected = placeholderOption;
    if (integrationPackId) {
      const match = mapped.find((opt) => opt.id === integrationPackId);
      if (match) {
        nextSelected = match;
        const full = integrationPacks.find((p) => p.id === integrationPackId);
        if (full) onIntegrationChange?.([full]);
      }
    }
    setSelectedOption((prev) => (prev.id === nextSelected.id ? prev : nextSelected));
  }, [integrationPacks, integrationPackId]); 

  const handleChange = (selected: Option) => {

    setSelectedOption(selected);
    logger.debug('IntegrationPackSelect handleChange', {
      selectedOption: selected,
      integrationPackId,
      options,
    });
    logger.debug('selected option', selectedOption.id);
    if (selected.id === 'placeholder') {
      onIntegrationChange?.([]);
      return;
    }
    const matched = integrationPacks?.find((p) => p.id === selected.id);
    if (matched) {
      onIntegrationChange?.([matched]);
    }
  };

  if (isLoading && showLoading) {
    return <AjaxLoader message={loadingMessage} />;
  }

  if (error) {
    return <p className="text-red-500 text-sm">Failed to load integrations.</p>;
  }

  return (
    <Dropdown
      key={selectedOption?.id ?? 'placeholder'}
      formName={formName}
      label={label}
      inputName="integrationPack"
      options={options}
      selected={selectedOption}
      onChange={handleChange}
      onBlur={onBlur}
      required
      disabled={disabled}
      error={validationError}
    />
  );
};

export default memo(IntegrationPackSelect);
