/**
 * @file functionTypes.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Registry of the transformation function types the full Editor can create, with the
 * fields each one shows and, where it can run outside the platform, a pure evaluator. The
 * evaluators mirror the runtime semantics in embedkit-sdk's compileFunctionToScript, so the
 * Editor's test runs and the platform agree.
 *
 * Pin names, key order and Configuration elements follow the Platform API reference
 * (Environment Map Extension functions). Types whose result depends on the process run
 * (counters, properties, sequences) have no evaluator and cannot be tested locally.
 */

export type DataType = 'CHARACTER' | 'DATETIME' | 'FLOAT' | 'INTEGER';
export type CacheType = 'None' | 'ByDocument' | 'ByMap';

/** A pin. `key` is set only where the API reference numbers it differently from its position. */
export type PinDef = { name: string; dataType: DataType; key?: number };

export type ConfigField = {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'boolean';
  defaultValue: string;
  /** Choices for `select` fields. */
  options?: { value: string; label: string }[];
  helperText?: string;
};

export type FunctionCategory = 'String' | 'Math' | 'Numeric' | 'Date' | 'Property' | 'Language' | 'Scripting';

export type FunctionTypeDef = {
  type: string;
  category: FunctionCategory;
  label: string;
  /** Input pins, in order. */
  inputs: PinDef[];
  /** Output pins, in order. */
  outputs: PinDef[];
  config: ConfigField[];
  /** Name of the Configuration element, when it differs from the type (DocumentProperty). */
  configElement?: string;
  /** The user adds and names the pins (Custom Scripting); `inputs` and `outputs` are empty. */
  userPins?: boolean;
  /**
   * Pure evaluator: inputs in pin order, config values by key, returns output values in pin
   * order. Absent for types that only run on the platform.
   */
  evaluate?: (inputs: string[], config: Record<string, string>) => string[];
};

const CHAR = 'CHARACTER' as const;
const FLOAT = 'FLOAT' as const;
const DATETIME = 'DATETIME' as const;

const num = (v: string | undefined): number => {
  const n = parseFloat(v ?? '');
  return Number.isNaN(n) ? NaN : n;
};

const pad = (n: number, w: number) => String(n).padStart(w, '0');

const DATE_TOKEN = /yyyy|MM|dd|HH|mm|ss|SSS/g;

/** Parse `value` with a Boomi-style mask such as yyyyMMdd. Missing fields default as the SDK does. */
function parseDate(value: string, mask: string): Date {
  const parts: Record<string, number> = { yyyy: 1970, MM: 1, dd: 1, HH: 0, mm: 0, ss: 0, SSS: 0 };
  let m: RegExpExecArray | null;
  DATE_TOKEN.lastIndex = 0;
  while ((m = DATE_TOKEN.exec(mask)) !== null) {
    parts[m[0]] = parseInt(value.substr(m.index, m[0].length), 10) || 0;
  }
  return new Date(parts.yyyy, parts.MM - 1, parts.dd, parts.HH, parts.mm, parts.ss, parts.SSS);
}

/** Format a Date with a Boomi-style mask. Unknown characters pass through unchanged. */
function formatDate(d: Date, mask: string): string {
  return mask.replace(DATE_TOKEN, (token) => {
    switch (token) {
      case 'yyyy': return pad(d.getFullYear(), 4);
      case 'MM': return pad(d.getMonth() + 1, 2);
      case 'dd': return pad(d.getDate(), 2);
      case 'HH': return pad(d.getHours(), 2);
      case 'mm': return pad(d.getMinutes(), 2);
      case 'ss': return pad(d.getSeconds(), 2);
      default: return pad(d.getMilliseconds(), 3);
    }
  });
}

const str = (inputs: string[], i: number) => inputs[i] ?? '';

export const FUNCTION_TYPES: FunctionTypeDef[] = [
  // ---- String -------------------------------------------------------------
  {
    type: 'LeftTrim', category: 'String', label: 'Left Character Trim',
    inputs: [{ name: 'Original String', dataType: CHAR }], outputs: [{ name: 'Result', dataType: CHAR }], config: [],
    evaluate: (i) => [str(i, 0).replace(/^\s+/, '')],
  },
  {
    type: 'RightTrim', category: 'String', label: 'Right Character Trim',
    inputs: [{ name: 'Original String', dataType: CHAR }], outputs: [{ name: 'Result', dataType: CHAR }], config: [],
    evaluate: (i) => [str(i, 0).replace(/\s+$/, '')],
  },
  {
    type: 'TrimWhitespace', category: 'String', label: 'Whitespace Trim',
    inputs: [{ name: 'Original String', dataType: CHAR }], outputs: [{ name: 'Result', dataType: CHAR }], config: [],
    evaluate: (i) => [str(i, 0).replace(/^\s+|\s+$/g, '')],
  },
  {
    type: 'StringToLower', category: 'String', label: 'String To Lower',
    inputs: [{ name: 'Original String', dataType: CHAR }], outputs: [{ name: 'Result', dataType: CHAR }], config: [],
    evaluate: (i) => [str(i, 0).toLowerCase()],
  },
  {
    type: 'StringToUpper', category: 'String', label: 'String To Upper',
    inputs: [{ name: 'Original String', dataType: CHAR }], outputs: [{ name: 'Result', dataType: CHAR }], config: [],
    evaluate: (i) => [str(i, 0).toUpperCase()],
  },
  {
    // Pads with the character until the fixed length is reached; without a length, appends once.
    type: 'StringAppend', category: 'String', label: 'String Append',
    inputs: [
      { name: 'Original String', dataType: CHAR },
      { name: 'Fix to Length', dataType: FLOAT },
      { name: 'Char to Append', dataType: CHAR },
    ],
    outputs: [{ name: 'Result', dataType: CHAR }], config: [],
    evaluate: (i) => {
      let s = str(i, 0);
      const len = parseInt(str(i, 1), 10);
      const ch = str(i, 2);
      if (!Number.isNaN(len)) { while (ch.length && s.length < len) s += ch; } else { s += ch; }
      return [s];
    },
  },
  {
    type: 'StringPrepend', category: 'String', label: 'String Prepend',
    inputs: [
      { name: 'Original String', dataType: CHAR },
      { name: 'Fix to Length', dataType: FLOAT },
      { name: 'Char to Prepend', dataType: CHAR },
    ],
    outputs: [{ name: 'Result', dataType: CHAR }], config: [],
    evaluate: (i) => {
      let s = str(i, 0);
      const len = parseInt(str(i, 1), 10);
      const ch = str(i, 2);
      if (!Number.isNaN(len)) { while (ch.length && s.length < len) s = ch + s; } else { s = ch + s; }
      return [s];
    },
  },
  {
    type: 'StringRemove', category: 'String', label: 'String Remove',
    inputs: [{ name: 'Original String', dataType: CHAR }, { name: 'Text to Remove', dataType: CHAR }],
    outputs: [{ name: 'Result', dataType: CHAR }], config: [],
    evaluate: (i) => [str(i, 0).split(str(i, 1)).join('')],
  },
  {
    type: 'StringReplace', category: 'String', label: 'String Replace',
    inputs: [
      { name: 'Original String', dataType: CHAR },
      { name: 'Find', dataType: CHAR },
      { name: 'Replace With', dataType: CHAR },
    ],
    outputs: [{ name: 'Result', dataType: CHAR }], config: [],
    evaluate: (i) => [str(i, 0).split(str(i, 1)).join(str(i, 2))],
  },
  {
    type: 'StringConcat', category: 'String', label: 'String Concat',
    inputs: [{ name: 'Value 1', dataType: CHAR }, { name: 'Value 2', dataType: CHAR }],
    outputs: [{ name: 'Result', dataType: CHAR }],
    config: [{ key: 'delimiter', label: 'Delimiter', kind: 'text', defaultValue: '' }],
    evaluate: (i, c) => [i.join(c.delimiter ?? '')],
  },
  {
    type: 'StringSplit', category: 'String', label: 'String Split',
    inputs: [{ name: 'Original String', dataType: CHAR }],
    outputs: [{ name: 'Part 1', dataType: CHAR }, { name: 'Part 2', dataType: CHAR }],
    config: [{ key: 'delimiter', label: 'Delimiter', kind: 'text', defaultValue: ',' }],
    evaluate: (i, c) => {
      const parts = str(i, 0).split(c.delimiter ?? '');
      return [parts[0] ?? '', parts[1] ?? ''];
    },
  },

  // ---- Math ---------------------------------------------------------------
  {
    type: 'MathAdd', category: 'Math', label: 'Math Add',
    inputs: [{ name: 'Value 1', dataType: FLOAT }, { name: 'Value 2', dataType: FLOAT }],
    outputs: [{ name: 'Result', dataType: FLOAT }], config: [],
    evaluate: (i) => [String(num(i[0]) + num(i[1]))],
  },
  {
    type: 'MathSubtract', category: 'Math', label: 'Math Subtract',
    inputs: [{ name: 'Value 1', dataType: FLOAT }, { name: 'Value 2', dataType: FLOAT }],
    outputs: [{ name: 'Result', dataType: FLOAT }], config: [],
    evaluate: (i) => [String(num(i[0]) - num(i[1]))],
  },
  {
    type: 'MathMultiply', category: 'Math', label: 'Math Multiply',
    inputs: [{ name: 'Value 1', dataType: FLOAT }, { name: 'Value 2', dataType: FLOAT }],
    outputs: [{ name: 'Result', dataType: FLOAT }], config: [],
    evaluate: (i) => [String(num(i[0]) * num(i[1]))],
  },
  {
    // Division by zero (or a non-number) gives an empty result, as the SDK's runtime does.
    type: 'MathDivide', category: 'Math', label: 'Math Divide',
    inputs: [{ name: 'Value 1', dataType: FLOAT }, { name: 'Value 2', dataType: FLOAT }],
    outputs: [{ name: 'Result', dataType: FLOAT }], config: [],
    evaluate: (i) => {
      const den = num(i[1]);
      return [den === 0 || Number.isNaN(den) ? '' : String(num(i[0]) / den)];
    },
  },
  {
    type: 'MathABS', category: 'Math', label: 'Math Absolute Value',
    inputs: [{ name: 'Value', dataType: FLOAT }], outputs: [{ name: 'Result', dataType: FLOAT }], config: [],
    evaluate: (i) => [String(Math.abs(num(i[0])))],
  },
  {
    type: 'MathCeil', category: 'Math', label: 'Math Ceiling',
    inputs: [{ name: 'Value', dataType: FLOAT }], outputs: [{ name: 'Result', dataType: FLOAT }], config: [],
    evaluate: (i) => [String(Math.ceil(num(i[0])))],
  },
  {
    type: 'MathFloor', category: 'Math', label: 'Math Floor',
    inputs: [{ name: 'Value', dataType: FLOAT }], outputs: [{ name: 'Result', dataType: FLOAT }], config: [],
    evaluate: (i) => [String(Math.floor(num(i[0])))],
  },
  {
    type: 'MathSetPrecision', category: 'Math', label: 'Math Set Precision',
    inputs: [{ name: 'Value', dataType: FLOAT }, { name: 'Precision', dataType: FLOAT }],
    outputs: [{ name: 'Result', dataType: FLOAT }], config: [],
    evaluate: (i) => [num(i[0]).toFixed(parseInt(str(i, 1), 10) || 0)],
  },

  // ---- Date ---------------------------------------------------------------
  {
    type: 'CurrentDate', category: 'Date', label: 'Get Current Date',
    inputs: [], outputs: [{ name: 'Result', dataType: CHAR }], config: [],
    // Boomi's default mask, yyyyMMdd HHmmss.SSS. Evaluated against the clock, so tests check the shape.
    evaluate: () => [formatDate(new Date(), 'yyyyMMdd HHmmss.SSS')],
  },
  {
    type: 'DateFormat', category: 'Date', label: 'Date Format',
    inputs: [
      { name: 'Date String', dataType: CHAR },
      { name: 'Input Mask', dataType: CHAR },
      { name: 'Output Mask', dataType: CHAR },
    ],
    outputs: [{ name: 'Result', dataType: DATETIME }], config: [],
    evaluate: (i) => [formatDate(parseDate(str(i, 0), str(i, 1)), str(i, 2))],
  },
];

const INTEGER = 'INTEGER' as const;

/**
 * Types that run only on the platform. Their pins and configuration follow the Platform API
 * reference; none has an evaluator, because the result depends on the process run.
 */
const PLATFORM_TYPES: FunctionTypeDef[] = [
  // ---- Numeric ------------------------------------------------------------
  {
    type: 'Count', category: 'Numeric', label: 'Count',
    inputs: [{ name: 'Field to Count', dataType: CHAR }, { name: 'Reset Value', dataType: CHAR }],
    outputs: [{ name: 'Result', dataType: INTEGER }], config: [],
  },
  {
    type: 'Sum', category: 'Numeric', label: 'Sum',
    inputs: [{ name: 'Value to Sum', dataType: FLOAT }, { name: 'Reset Value', dataType: CHAR }],
    outputs: [{ name: 'Result', dataType: FLOAT }], config: [],
  },
  {
    type: 'RunningTotal', category: 'Numeric', label: 'Running Total',
    inputs: [{ name: 'Value to Sum', dataType: FLOAT }],
    outputs: [{ name: 'Result', dataType: FLOAT }], config: [],
  },
  {
    type: 'LineItemIncrement', category: 'Numeric', label: 'Line Item Increment',
    inputs: [{ name: 'Increment Basis', dataType: CHAR }, { name: 'Reset Value', dataType: CHAR }],
    outputs: [{ name: 'Result', dataType: INTEGER }], config: [],
  },
  {
    type: 'SequentialValue', category: 'Numeric', label: 'Sequential Value',
    inputs: [{ name: 'Increment Basis', dataType: CHAR }],
    outputs: [{ name: 'Result', dataType: CHAR }],
    config: [
      { key: 'keyName', label: 'Key Name', kind: 'text', defaultValue: '', helperText: 'A unique name for this sequence.' },
      { key: 'batchSize', label: 'Batch Size', kind: 'number', defaultValue: '1' },
      { key: 'keyFixToLength', label: 'Fix to Length', kind: 'number', defaultValue: '' },
    ],
  },
  {
    // Java DecimalFormat masks; not evaluated locally.
    type: 'NumberFormat', category: 'Numeric', label: 'Number Format',
    inputs: [
      { name: 'Number String', dataType: CHAR },
      { name: 'Input Mask', dataType: CHAR },
      { name: 'Output Mask', dataType: CHAR },
    ],
    outputs: [{ name: 'Result', dataType: CHAR }], config: [],
  },

  // ---- Property -----------------------------------------------------------
  {
    type: 'PropertyGet', category: 'Property', label: 'Get Dynamic Process Property',
    inputs: [{ name: 'Property Name', dataType: CHAR }, { name: 'Default Value', dataType: CHAR }],
    outputs: [{ name: 'Result', dataType: CHAR }], config: [],
  },
  {
    type: 'PropertySet', category: 'Property', label: 'Set Dynamic Process Property',
    inputs: [{ name: 'Property Name', dataType: CHAR }, { name: 'Property Value', dataType: CHAR }],
    outputs: [], config: [],
  },
  {
    type: 'DocumentPropertyGet', category: 'Property', label: 'Get Document Property',
    inputs: [],
    outputs: [{ name: 'Result', dataType: CHAR }],
    configElement: 'DocumentProperty',
    config: [
      {
        key: 'propertyId', label: 'Property ID', kind: 'text', defaultValue: '',
        helperText: 'connector.<connectorType>.<propertyId>, dynamicdocument.<name>, or meta.base.<propertyId>',
      },
      { key: 'defaultValue', label: 'Default Value', kind: 'text', defaultValue: '' },
      { key: 'persist', label: 'Persist', kind: 'boolean', defaultValue: 'false' },
    ],
  },
  {
    type: 'DocumentPropertySet', category: 'Property', label: 'Set Document Property',
    inputs: [{ name: 'Value', dataType: CHAR }],
    outputs: [],
    configElement: 'DocumentProperty',
    config: [
      {
        key: 'propertyId', label: 'Property ID', kind: 'text', defaultValue: '',
        helperText: 'connector.<connectorType>.<propertyId>, dynamicdocument.<name>, or meta.base.<propertyId>',
      },
      { key: 'defaultValue', label: 'Default Value', kind: 'text', defaultValue: '' },
      { key: 'persist', label: 'Persist', kind: 'boolean', defaultValue: 'false' },
    ],
  },

  // ---- Language -----------------------------------------------------------
  {
    // The API reference numbers this output 2. Option values other than fullwidth_hiragana and
    // halfwidth_katakana are inferred from the documented labels and need checking on the platform.
    type: 'JapaneseCharacterConversion', category: 'Language', label: 'Japanese Character Conversion',
    inputs: [{ name: 'String to Convert', dataType: CHAR }],
    outputs: [{ name: 'Result', dataType: CHAR, key: 2 }],
    config: [
      {
        key: 'convertFrom', label: 'Convert from', kind: 'select', defaultValue: 'any',
        options: [
          { value: 'any', label: 'Any' },
          { value: 'fullwidth_hiragana', label: 'Full-Width Hiragana' },
          { value: 'katakana', label: 'Katakana' },
        ],
      },
      {
        key: 'convertTo', label: 'Convert to', kind: 'select', defaultValue: 'fullwidth_hiragana',
        options: [
          { value: 'fullwidth_hiragana', label: 'Full-Width Hiragana' },
          { value: 'fullwidth_katakana', label: 'Full-Width Katakana' },
          { value: 'halfwidth_katakana', label: 'Half-Width Katakana' },
        ],
      },
    ],
  },

  // ---- Scripting ----------------------------------------------------------
  {
    // Inline scripts only (the API does not take Custom Scripting components). The script,
    // language and pins are edited in the script editor; JavaScript can be tested locally.
    type: 'CustomScripting', category: 'Scripting', label: 'Custom Scripting',
    inputs: [], outputs: [], config: [], userPins: true,
  },
];

FUNCTION_TYPES.push(...PLATFORM_TYPES);

/** Script languages the API accepts for Custom Scripting. Only JavaScript runs in the local test. */
export const SCRIPT_LANGUAGES = [
  { value: 'Javascript', label: 'JavaScript' },
  { value: 'GROOVY', label: 'Groovy 1.5' },
  { value: 'GROOVY2', label: 'Groovy 2.4' },
] as const;
export type ScriptLanguage = (typeof SCRIPT_LANGUAGES)[number]['value'];

/** Category order in the Editor, as in the platform's Add a Function dialog. */
export const FUNCTION_CATEGORIES: FunctionCategory[] = ['String', 'Math', 'Numeric', 'Date', 'Property', 'Language', 'Scripting'];

export const FUNCTION_TYPE_BY_ID = new Map(FUNCTION_TYPES.map((f) => [f.type, f]));

/** The Boomi function object for a type, with its pins and config, ready to save. */
export function buildFunctionDefinition(
  def: FunctionTypeDef,
  opts: {
    id: string;
    cacheType?: CacheType;
    config?: Record<string, string>;
    /** Default value per input, by position (the platform's Configure Defaults). Blank is left out. */
    inputDefaults?: string[];
    inputs?: PinDef[];
    outputs?: PinDef[];
  }
) {
  const inputs = opts.inputs ?? def.inputs;
  const outputs = opts.outputs ?? def.outputs;
  const cfg = opts.config ?? {};
  const defaults = opts.inputDefaults ?? [];
  return {
    id: opts.id,
    type: def.type,
    cacheType: opts.cacheType ?? 'None',
    Inputs: {
      Input: inputs.map((p, idx) => ({
        key: p.key ?? idx + 1,
        name: p.name,
        ...(defaults[idx] ? { default: defaults[idx] } : {}),
      })),
    },
    Outputs: { Output: outputs.map((p, idx) => ({ key: p.key ?? idx + 1, name: p.name })) },
    ...(def.config.length
      ? {
          Configuration: {
            [def.configElement ?? def.type]: Object.fromEntries(
              def.config.map((f) => [f.key, cfg[f.key] ?? f.defaultValue])
            ),
          },
        }
      : {}),
  };
}
