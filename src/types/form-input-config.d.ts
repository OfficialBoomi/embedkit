/**
 * @file form-input-config.d.ts
 * @typedef FormInputConfig
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Configuration options for a single-line form input.
 * Properties here override the corresponding `Input` component props
 * when provided in plugin configuration.
 *
 * @property {string} [label] - Optional human-friendly label shown above or next to the input.
 * @property {string} [placeholder] - Optional placeholder text displayed when the field is empty.
 * @property {string} [validation] - Optional regex or pattern string applied to the `<input pattern>` attribute.
 * @property {InputHTMLAttributes<HTMLInputElement>['inputMode']} [inputMode] - Optional HTML input mode hint (e.g., `"numeric"`, `"email"`, `"decimal"`).
 * @property {string} [wrapClass] - Optional CSS class(es) applied to the outer wrapper element.
 * @property {string} [labelClass] - Optional CSS class(es) applied to the `<label>` element.
 * @property {string} [inputClass] - Optional CSS class(es) applied to the `<input>` element.
 * @property {string} [helperClass] - Optional CSS class(es) applied to helper text.
 * @property {string} [errorClass] - Optional CSS class(es) applied to error text.
 * @property {Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'name' | 'type' | 'required' | 'readOnly' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'className' | 'placeholder' | 'pattern' | 'inputMode' | 'aria-invalid' | 'aria-describedby'>} [attrs] - Extra attributes to spread directly onto the `<input>` element, excluding common properties managed by the form system.
 */
import type { InputHTMLAttributes } from 'react';

export type FormInputConfig = {
  label?: string;
  placeholder?: string;
  validation?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  wrapClass?: string;
  labelClass?: string;
  inputClass?: string;
  helperClass?: string;
  errorClass?: string;
  attrs?: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    | 'id'
    | 'name'
    | 'type'
    | 'required'
    | 'readOnly'
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'onBlur'
    | 'className'
    | 'placeholder'
    | 'pattern'
    | 'inputMode'
    | 'aria-invalid'
    | 'aria-describedby'
  >;
};
