/**
 * @file Input.tsx
 * @component Input
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A reusable text input component with label, validation, helper text, and
 * accessibility attributes. Supports both controlled (`value`/`onChange`)
 * and uncontrolled (`defaultValue`) usage, as well as HTML validation via
 * `required`, `pattern`, and `inputMode`. Can be marked `readOnly`.
 *
 * @return {JSX.Element} The rendered input with optional label, helper, and error text.
 */

import { usePlugin } from '../../context/pluginContext';

/**
 * @typedef InputType
 *
 * @description
 * Supported HTML input types for the `Input` component.
 */
type InputType = 'text' | 'email' | 'password' | 'number';

/**
 * @interface InputProps
 *
 * @description
 * Props for the `Input` component.
 *
 * @property {string} formName - The name of the form this input belongs to (useful for analytics or styling hooks).
 * @property {string} label - The label displayed for the input.
 * @property {boolean} required - Whether the field is required. Adds HTML `required` and can drive validation UI.
 * @property {string} inputName - The HTML `name` attribute for the input.
 * @property {boolean} readOnly - If true, renders the input as read-only.
 * @property {InputType} [type='text'] - HTML input type.
 * @property {string} [defaultValue] - Uncontrolled default value for the input.
 * @property {string} [value] - Controlled value for the input.
 * @property {string} [helperText] - Optional helper text shown below the input.
 * @property {(event: React.ChangeEvent<HTMLInputElement>) => void} [onChange] - Change handler for controlled usage.
 * @property {(event: React.FocusEvent<HTMLInputElement>) => void} [onBlur] - Blur handler for validation or formatting on focus loss.
 * @property {string} [error] - Validation error message displayed below the input.
 * @property {string} [placeholder] - Placeholder text shown when the input is empty.
 * @property {string} [pattern] - Regex pattern applied to the input’s `pattern` attribute.
 * @property {React.InputHTMLAttributes<HTMLInputElement>['inputMode']} [inputMode] - Hint to browsers for the expected data type (e.g., `'numeric'`, `'email'`).
 */
interface InputProps {
  formName: string;
  label: string;
  required: boolean;
  inputName: string;
  readOnly: boolean;
  type?: InputType;
  defaultValue?: string;
  value?: string;
  helperText?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  error?: string;
  placeholder?: string;
  pattern?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
}

const Input: React.FC<InputProps> = ({
  formName,
  label,
  required,
  inputName,
  readOnly,
  type = 'text',
  defaultValue,
  value,
  helperText,
  onChange,
  onBlur,
  error,
  placeholder,
  pattern,
  inputMode,
}) => {
  const { boomiConfig } = usePlugin();
  const fieldCfg = boomiConfig?.form?.[formName]?.[inputName] ?? {};
  const inputLabel = fieldCfg.label ?? label;
  const finalPlaceholder = fieldCfg.placeholder ?? placeholder;
  const finalPattern = fieldCfg.validation ?? pattern;
  const finalInputMode = fieldCfg.inputMode ?? inputMode;
  const wrapClass = fieldCfg.wrapClass || '';
  const labelClass = fieldCfg.labelClass || '';
  const inputClassExtra = fieldCfg.inputClass || '';
  const helperClass = fieldCfg.helperClass || '';
  const errorClass = fieldCfg.errorClass || '';
  const inputId = `${formName}-${inputName}`;
  const helperId = `${inputId}-help`;
  const errorId = `${inputId}-err`;
  const hasError = Boolean(error);
  const isControlled = typeof value !== 'undefined' && typeof onChange === 'function';

  return (
    <div className={wrapClass}>
      <label
        htmlFor={inputId}
        className={`boomi-form-label ${labelClass}`}
      >
        {inputLabel}
        {required && <span className="boomi-form-required">*</span>}
      </label>

      <input
        id={inputId}
        name={inputName}
        type={type}
        required={required}
        readOnly={readOnly}
        placeholder={finalPlaceholder}
        pattern={finalPattern}
        inputMode={finalInputMode}
        onBlur={onBlur}
        aria-invalid={hasError || undefined}
        aria-describedby={
          hasError
            ? `${helperText ? helperId + ' ' : ''}${errorId}`
            : helperText
            ? helperId
            : undefined
        }
        className={[
          'boomi-input w-full rounded-md p-2',
          readOnly ? 'boomi-input--readonly' : '',
          hasError ? 'boomi-input--error' : '',
          inputClassExtra,
        ].join(' ').trim()}
        {...(isControlled ? { value, onChange } : { defaultValue })}
        {...(fieldCfg.attrs || {})}
      />

      {helperText && (
        <p id={helperId} className={`boomi-form-helper ${helperClass}`}>
          {helperText}
        </p>
      )}

      {hasError && (
        <p id={errorId} className={`boomi-form-error ${errorClass}`}>
          {error}
        </p>
      )}
    </div>
  );
};

export default Input;
