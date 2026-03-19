/**
 * @file Dropdown.tsx
 * @component Dropdown
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a customizable dropdown (select) element with support for labels,
 * validation errors, disabled state, and placeholder text.
 * Accepts an array of `Option` objects to populate the dropdown list.
 *
 * @return {JSX.Element} The rendered dropdown component.
 */

import { useState, useMemo } from 'react';
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { AiOutlineCheck, AiOutlineCaretDown } from 'react-icons/ai';

/**
 * @interface Option
 *
 * @description
 * Represents a selectable item in a dropdown, list, or other UI component.
 * Each option includes a unique identifier, a display name, and an optional
 * description that can provide additional context or details for the user.
 *
 * @property {string} id - Unique identifier for the option.
 * @property {string} name - Display name of the option.
 * @property {string} [description] - Optional description for the option.
 */
export interface Option {
  id: string;
  name: string;
  description?: string;
}

const placeholderOption: Option = { id: 'placeholder', name: 'Please select' };

/**
 * @interface DropdownProps
 *
 * @description
 * Props for the `Dropdown` component.
 *
 * @property {string} formName - The name of the form this dropdown is associated with.
 * @property {string} label - The label displayed above the dropdown.
 * @property {string} inputName - The HTML `name` attribute for the input element.
 * @property {Option[]} options - The list of selectable options.
 * @property {Option} [selected] - The currently selected option.
 * @property {boolean} [required] - Whether the field is required.
 * @property {boolean} [disabled=false] - Whether the dropdown is disabled.
 * @property {string} [error] - Validation error message displayed below the dropdown.
 * @property {(value: Option) => void} onChange - Callback fired when a new option is selected.
 * @property {(selected?: Option) => void} [onBlur] - Optional callback fired when the dropdown loses focus.
 * @property {string} [placeholder='Please select'] - Placeholder text displayed when no option is selected.
 */
interface DropdownProps {
  formName: string;
  label: string;
  inputName: string;
  options: Option[];
  selected?: Option;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  onChange: (value: Option) => void;
  onBlur?: (selected?: Option) => void;
  placeholder?: string;
}

const Dropdown: React.FC<DropdownProps> = ({
  formName,
  label,
  inputName,
  options,
  selected,
  required,
  disabled = false,
  error,
  onChange,
  onBlur,
  placeholder = 'Please select',
}) => {
  const [search, setSearch] = useState('');

  const optionMap = useMemo(() => {
    return options.reduce((acc, opt) => {
      acc[opt.id] = opt;
      return acc;
    }, {} as Record<string, Option>);
  }, [options]);

  const selectedId = selected?.id ?? 'placeholder';

  const filteredOptions = useMemo(() => {
    const q = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.name.toLowerCase().includes(q) ||
        opt.description?.toLowerCase().includes(q)
    );
  }, [search, options]);

  const handleInternalChange = (id: string) => {
    const opt = optionMap[id];
    if (opt) onChange(opt);
  };

  const inputId = `${formName}-${inputName}`;
  const errorId = `${inputId}-error`;

  return (
    <div className={`mb-4 ${disabled ? 'cursor-not-allowed' : ''}`}>
      <label htmlFor={inputId} className="boomi-form-label">
        {label}
        {required && <span className="boomi-form-required">*</span>}
      </label>

      <Listbox
        value={selectedId}
        onChange={handleInternalChange}
        disabled={disabled}
      >
        <div className="relative w-full">
          <ListboxButton
            id={inputId}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? errorId : undefined}
            onBlur={() => onBlur?.(selected)}
            className={[
              'boomi-select w-full',
              disabled ? 'boomi-select--disabled' : '',
              error ? 'boomi-select--error' : '',
            ].join(' ')}
          >
            <span className="block truncate">
              {selectedId in optionMap ? optionMap[selectedId].name : placeholder}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <AiOutlineCaretDown className="boomi-select-icon" aria-hidden="true" />
            </span>
          </ListboxButton>

          {!disabled && (
            <ListboxOptions className="boomi-options absolute w-full">
              {filteredOptions.length === 0 && (
                <div className="px-3 py-2 text-sm z-0">No options found</div>
              )}

              {filteredOptions.map((opt) => (
                <ListboxOption
                  key={opt.id}
                  value={opt.id}
                  className={({ selected, active }) =>
                    [
                      'boomi-option',
                      selected ? 'boomi-option--selected' : '',
                      active ? 'boomi-option--active' : '',
                      opt.id === 'placeholder' ? 'boomi-option--placeholder' : '',
                    ].join(' ')
                  }
                >
                  {({ selected }) => (
                    <>
                      <div className="flex flex-col">
                        <span className={`truncate ${selected ? 'font-semibold' : 'font-normal'}`}>
                          {opt.name}
                        </span>
                        {opt.description && opt.id !== 'placeholder' && (
                          <span className="text-xs opacity-80 truncate">{opt.description}</span>
                        )}
                      </div>
                      {selected && opt.id !== 'placeholder' && (
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3">
                          <AiOutlineCheck className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                    </>
                  )}
                </ListboxOption>
              ))}
            </ListboxOptions>
          )}
        </div>
      </Listbox>

      {error && (
        <p id={errorId} className="boomi-form-error mt-1">
          {label} {error}
        </p>
      )}
    </div>
  );
};

export default Dropdown;
