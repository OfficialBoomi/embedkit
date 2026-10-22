import { describe, it, expect } from 'vitest';
import { FUNCTION_CATEGORIES, FUNCTION_TYPES, FUNCTION_TYPE_BY_ID, buildFunctionDefinition } from '../../utils/functionTypes';

const run = (type: string, inputs: string[], config: Record<string, string> = {}) => {
  const def = FUNCTION_TYPE_BY_ID.get(type);
  if (!def?.evaluate) throw new Error(`no evaluator for ${type}`);
  return def.evaluate(inputs, config);
};

describe('function type registry', () => {
  it('has one definition per type id', () => {
    expect(new Set(FUNCTION_TYPES.map((f) => f.type)).size).toBe(FUNCTION_TYPES.length);
  });

  it('covers every category in the Editor order, and nothing outside it', () => {
    const cats = new Set(FUNCTION_TYPES.map((f) => f.category));
    expect(FUNCTION_CATEGORIES.every((c) => cats.has(c))).toBe(true);
    expect([...cats].every((c) => FUNCTION_CATEGORIES.includes(c))).toBe(true);
  });

  it('leaves out the types the API cannot create', () => {
    for (const t of ['ConnectorCall', 'SqlLookup']) expect(FUNCTION_TYPE_BY_ID.has(t)).toBe(false);
  });

  it('has no local evaluator for types that only run on the platform', () => {
    for (const t of ['Count', 'Sum', 'RunningTotal', 'LineItemIncrement', 'SequentialValue', 'NumberFormat',
      'PropertyGet', 'PropertySet', 'DocumentPropertyGet', 'DocumentPropertySet', 'JapaneseCharacterConversion']) {
      expect(FUNCTION_TYPE_BY_ID.get(t)?.evaluate).toBeUndefined();
    }
  });
});

describe('String functions', () => {
  it('trims left, right and both sides', () => {
    expect(run('LeftTrim', ['  ab  '])).toEqual(['ab  ']);
    expect(run('RightTrim', ['  ab  '])).toEqual(['  ab']);
    expect(run('TrimWhitespace', ['  ab  '])).toEqual(['ab']);
  });

  it('changes case', () => {
    expect(run('StringToLower', ['AbC'])).toEqual(['abc']);
    expect(run('StringToUpper', ['AbC'])).toEqual(['ABC']);
  });

  it('appends and prepends up to a fixed length, or once with no length', () => {
    expect(run('StringAppend', ['7', '4', '0'])).toEqual(['7000']);
    expect(run('StringPrepend', ['7', '4', '0'])).toEqual(['0007']);
    expect(run('StringAppend', ['ab', '', '-'])).toEqual(['ab-']);
    expect(run('StringPrepend', ['ab', '', '-'])).toEqual(['-ab']);
  });

  it('removes and replaces every occurrence', () => {
    expect(run('StringRemove', ['a-b-c', '-'])).toEqual(['abc']);
    expect(run('StringReplace', ['a-b-c', '-', '+'])).toEqual(['a+b+c']);
  });

  it('concatenates with a delimiter', () => {
    expect(run('StringConcat', ['a', 'b'], { delimiter: ', ' })).toEqual(['a, b']);
  });

  it('splits into parts, and leaves missing parts empty', () => {
    expect(run('StringSplit', ['x,y'], { delimiter: ',' })).toEqual(['x', 'y']);
    expect(run('StringSplit', ['x'], { delimiter: ',' })).toEqual(['x', '']);
  });
});

describe('Math functions', () => {
  it('adds, subtracts and multiplies', () => {
    expect(run('MathAdd', ['2', '3'])).toEqual(['5']);
    expect(run('MathSubtract', ['2', '3'])).toEqual(['-1']);
    expect(run('MathMultiply', ['2', '3.5'])).toEqual(['7']);
  });

  it('gives an empty result when dividing by zero', () => {
    expect(run('MathDivide', ['6', '0'])).toEqual(['']);
    expect(run('MathDivide', ['6', '4'])).toEqual(['1.5']);
  });

  it('takes absolute value, ceiling and floor', () => {
    expect(run('MathABS', ['-2.5'])).toEqual(['2.5']);
    expect(run('MathCeil', ['2.1'])).toEqual(['3']);
    expect(run('MathFloor', ['2.9'])).toEqual(['2']);
  });

  it('sets decimal precision', () => {
    expect(run('MathSetPrecision', ['3.14159', '2'])).toEqual(['3.14']);
    expect(run('MathSetPrecision', ['3.6', ''])).toEqual(['4']);
  });
});

describe('Date functions', () => {
  it('formats a date from one mask to another', () => {
    expect(run('DateFormat', ['20261021', 'yyyyMMdd', 'MM/dd/yyyy'])).toEqual(['10/21/2026']);
    expect(run('DateFormat', ['10/21/2026 13:05', 'MM/dd/yyyy HH:mm', 'yyyy-MM-dd HH:mm'])).toEqual(['2026-10-21 13:05']);
  });

  it('returns the current date in the default mask shape', () => {
    expect(run('CurrentDate', [])[0]).toMatch(/^\d{8} \d{6}\.\d{3}$/);
  });
});

describe('buildFunctionDefinition', () => {
  it('numbers pins from 1 and keeps the configuration under the type name', () => {
    const def = FUNCTION_TYPE_BY_ID.get('StringSplit')!;
    const built = buildFunctionDefinition(def, { id: 'fn-1', config: { delimiter: '|' } });
    expect(built.type).toBe('StringSplit');
    expect(built.cacheType).toBe('None');
    expect(built.Inputs.Input).toEqual([{ key: 1, name: 'Original String' }]);
    expect(built.Outputs.Output).toEqual([{ key: 1, name: 'Part 1' }, { key: 2, name: 'Part 2' }]);
    expect(built.Configuration).toEqual({ StringSplit: { delimiter: '|' } });
  });

  it('omits Configuration for types without settings', () => {
    const built = buildFunctionDefinition(FUNCTION_TYPE_BY_ID.get('MathAdd')!, { id: 'fn-2' });
    expect('Configuration' in built).toBe(false);
  });
});

// Pin names, keys and Configuration elements as given in the Platform API reference
// (Environment Map Extension functions).
const build = (type: string, opts: Parameters<typeof buildFunctionDefinition>[1] = { id: 'fn' }) =>
  buildFunctionDefinition(FUNCTION_TYPE_BY_ID.get(type)!, opts);

describe('platform function definitions match the API reference', () => {
  it('PropertyGet takes a name and default, PropertySet a name and value with no output', () => {
    expect(build('PropertyGet').Inputs.Input).toEqual([{ key: 1, name: 'Property Name' }, { key: 2, name: 'Default Value' }]);
    expect(build('PropertyGet').Outputs.Output).toEqual([{ key: 1, name: 'Result' }]);
    expect(build('PropertySet').Inputs.Input).toEqual([{ key: 1, name: 'Property Name' }, { key: 2, name: 'Property Value' }]);
    expect(build('PropertySet').Outputs.Output).toEqual([]);
  });

  it('document properties use the DocumentProperty element', () => {
    const get = build('DocumentPropertyGet', { id: 'fn', config: { propertyId: 'connector.disk.filename' } });
    expect(get.Inputs.Input).toEqual([]);
    expect(get.Configuration).toEqual({ DocumentProperty: { propertyId: 'connector.disk.filename', defaultValue: '', persist: 'false' } });
    expect(build('DocumentPropertySet').Outputs.Output).toEqual([]);
  });

  it('counters take their documented inputs', () => {
    expect(build('Count').Inputs.Input.map((i) => i.name)).toEqual(['Field to Count', 'Reset Value']);
    expect(build('Sum').Inputs.Input.map((i) => i.name)).toEqual(['Value to Sum', 'Reset Value']);
    expect(build('RunningTotal').Inputs.Input.map((i) => i.name)).toEqual(['Value to Sum']);
    expect(build('LineItemIncrement').Inputs.Input.map((i) => i.name)).toEqual(['Increment Basis', 'Reset Value']);
    expect(build('NumberFormat').Inputs.Input.map((i) => i.name)).toEqual(['Number String', 'Input Mask', 'Output Mask']);
  });

  it('SequentialValue carries key name, batch size and fixed length', () => {
    const seq = build('SequentialValue', { id: 'fn', config: { keyName: 'somekey', keyFixToLength: '12' } });
    expect(seq.Configuration).toEqual({ SequentialValue: { keyName: 'somekey', batchSize: '1', keyFixToLength: '12' } });
  });

  it('Japanese Character Conversion numbers its output 2', () => {
    const jcc = build('JapaneseCharacterConversion', { id: 'fn', config: { convertFrom: 'fullwidth_hiragana', convertTo: 'halfwidth_katakana' } });
    expect(jcc.Outputs.Output).toEqual([{ key: 2, name: 'Result' }]);
    expect(jcc.Configuration).toEqual({ JapaneseCharacterConversion: { convertFrom: 'fullwidth_hiragana', convertTo: 'halfwidth_katakana' } });
  });
});

describe('input defaults', () => {
  it('sets default on inputs that have one and leaves blank ones out', () => {
    const built = build('PropertyGet', { id: 'fn', inputDefaults: ['', 'none'] });
    expect(built.Inputs.Input).toEqual([{ key: 1, name: 'Property Name' }, { key: 2, name: 'Default Value', default: 'none' }]);
  });
});
