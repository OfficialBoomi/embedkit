import { useMemo } from 'react';

type JsonEditorFieldProps = {
  label: string;
  labelAddon?: React.ReactNode;
  value: string;
  placeholder?: string;
  helperText?: string;
  error?: string | null;
  onChange: (next: string) => void;
};

const JsonEditorField: React.FC<JsonEditorFieldProps> = ({
  label,
  labelAddon,
  value,
  placeholder,
  helperText,
  error,
  onChange,
}) => {
  const lineCount = useMemo(() => Math.max(1, value.split('\n').length), [value]);
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => String(i + 1)).join('\n'),
    [lineCount]
  );

  return (
    <div>
      <label className="boomi-form-label inline-flex items-center gap-2">
        <span>{label}</span>
        {labelAddon}
      </label>
      <div
        className={[
          'flex w-full rounded-md border overflow-hidden',
          'bg-[color-mix(in_srgb,var(--boomi-card-bg,#ffffff)_92%,#000000)]',
          error ? 'boomi-input--error' : '',
        ].join(' ').trim()}
      >
        <pre
          className={[
            'm-0 py-2 px-3 text-xs font-mono leading-5',
            'text-[color-mix(in_srgb,var(--boomi-card-fg,#111)_55%,transparent)]',
            'bg-[color-mix(in_srgb,var(--boomi-card-bg,#ffffff)_86%,#000000)]',
            'border-r border-[color-mix(in_srgb,var(--boomi-card-border,#e5e7eb)_80%,transparent)]',
            'select-none text-right min-w-[2.5rem]',
          ].join(' ')}
        >
          {lineNumbers}
        </pre>
        <textarea
          className={[
            'boomi-input flex-1 rounded-none border-0 font-mono text-xs leading-5',
            'bg-transparent p-2 min-h-[120px]',
            'focus:outline-none',
          ].join(' ')}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {helperText && <p className="boomi-form-helper">{helperText}</p>}
      {error && <p className="boomi-form-error">{error}</p>}
    </div>
  );
};

export default JsonEditorField;
