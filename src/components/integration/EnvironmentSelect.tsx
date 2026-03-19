/**
 * @file EnvironmentSelect.tsx
 * @component EnvironmentSelect
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a dropdown for selecting an environment associated with a specific integration pack.
 * Supports loading state, optional filtering by environment type, and validation display.
 * Integrates with plugin configuration via `componentName` for class overrides.
 *
 * @return {JSX.Element} The rendered environment dropdown.
 */

import { useEffect, useState, memo} from 'react';
import { usePlugin } from '../../context/pluginContext';
import { useFetchEnvironments } from '../../hooks/environment/useFetchEnvironments';
import AjaxLoader from '../ui/AjaxLoader';
import Dropdown, { Option } from '../ui/Dropdown';
import logger from '../../logger.service';

/**
 * @interface EnvironmentSelectProps
 *
 * @description
 * Props for the `EnvironmentSelect` component.
 *
 * @property {string} formName - Used to associate to the current form.
 * @property {string} [label='Environment'] - Label displayed above the dropdown.
 * @property {boolean} [disabled=false] - Disables the dropdown when true.
 * @property {EnvironmentType} [includeEnvironments] - Filters environments by type (e.g., `PROD`, `TEST`).
 * @property {string|null} [environmentId] - ID of the currently selected environment.
 * @property {boolean} [showLoading=true] - Whether to show a loading spinner while fetching.
 * @property {string} [loadingMessage='Loading Environments...'] - Message displayed during loading.
 * @property {string} [validationError] - Error message displayed beneath the dropdown.
 * @property {(env: { id: string; name: string }) => void} [onEnvironmentChange] - Callback when selection changes.
 * @property {(selected?: Option) => void} [onBlur] - Optional blur handler from the parent form.
 */
interface EnvironmentSelectProps {
  componentKey: string 
  formName: string;
  label?: string;
  disabled?: boolean;
  showLoading?: boolean;
  loadingMessage?: string;
  validationError?: string;
  onEnvironmentChange?: (env: { id: string; name: string }) => void;
  onBlur?: (selected?: Option) => void;
}

const EnvironmentSelect: React.FC<EnvironmentSelectProps> = ({
  componentKey,
  formName,
  label = 'Environment',
  disabled = false,
  showLoading = true,
  loadingMessage = 'Loading Environments...',
  validationError,
  onEnvironmentChange,
  onBlur,
}) => {
  const { boomiConfig } = usePlugin();
  const { fetchEnvironments, environments, isLoading, error } = useFetchEnvironments();
  const placeholderOption = { id: 'placeholder', name: 'Please select' };
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedOption, setSelectedOption] = useState<Option>(placeholderOption);
  const includeEnvironments = boomiConfig?.components?.[componentKey]?.environmentSelect?.includeEnvironments ?? 'ALL';
  const envId = boomiConfig?.components?.[componentKey]?.environmentSelect?.environmentId ?? null;
  const environmentId = null;

  const fetchData = async () => {
    try {
      logger.debug(`EnvironmentSelect: Fetching environments with includeEnvironments=${includeEnvironments} and environmentId=${envId}`);
      await fetchEnvironments(includeEnvironments, envId);
    } catch (err) {
      logger.error("Failed to fetch environments", err);
    }
  };
  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!environments?.length) return;

    const mapped = environments.map((e) => ({ id: e.id, name: e.name }));
    setOptions([placeholderOption, ...mapped]);

    let nextSelected = placeholderOption;
    if (environmentId) {
      const match = mapped.find((o) => o.id === environmentId);
      if (match) {
        nextSelected = match;
        const full = environments.find((e) => e.id === environmentId);
        if (full) onEnvironmentChange?.({ id: full.id, name: full.name });
      }
    }
    setSelectedOption((prev) => (prev.id === nextSelected.id ? prev : nextSelected));
  }, [environments]);

  const handleChange = (selected: Option) => {
    setSelectedOption(selected);

    if (selected.id === 'placeholder') {
      onEnvironmentChange?.({ id: '', name: '' });
      return;
    }

    const matched = environments?.find((env) => env.id === selected.id);
    if (matched) {
      onEnvironmentChange?.({ id: matched.id, name: matched.name });
    }
  };

  if (isLoading && showLoading) {
    return <AjaxLoader message={loadingMessage} />;
  }

  if (error) {
    return <p className="text-red-500 text-sm">Failed to load environments.</p>;
  }

  if (!environments?.length) {
    return <p className="text-gray-500 text-sm">No environments found.</p>;
  }

  return (
    <Dropdown
      key={selectedOption?.id ?? 'placeholder'}
      formName={formName}
      label={label}
      inputName="environment"
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

export default memo(EnvironmentSelect);
