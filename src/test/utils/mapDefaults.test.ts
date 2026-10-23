import { describe, it, expect } from 'vitest';
import {
  changedFunctions,
  changedMappings,
  mergeDefaultFunctions,
  mergeDefaultMappings,
} from '../../utils/mapDefaults';

const defaultMapping = { fromXPath: '/Order/Id', toXPath: '/Invoice/OrderId' };
const defaultFunctionRaw = {
  id: 'fn-trim',
  type: 'TrimWhitespace',
  Configuration: {},
  Inputs: { Input: [{ key: 1, name: 'value' }] },
  Outputs: { Output: [{ key: 1, name: 'result' }] },
};

describe('mergeDefaultMappings', () => {
  it('shows the defaults when the customer has changed nothing', () => {
    expect(mergeDefaultMappings([defaultMapping], [])).toEqual([defaultMapping]);
  });

  it('lets a customer mapping replace the default for the same target', () => {
    const override = { fromXPath: '/Order/Ref', toXPath: '/Invoice/OrderId' };
    expect(mergeDefaultMappings([defaultMapping], [override])).toEqual([override]);
  });

  it('keeps defaults for other targets alongside the customer mappings', () => {
    const own = { fromXPath: '/Order/Total', toXPath: '/Invoice/Total' };
    expect(mergeDefaultMappings([defaultMapping], [own])).toEqual([defaultMapping, own]);
  });
});

describe('changedMappings', () => {
  it('drops untouched defaults so they are not saved', () => {
    expect(changedMappings([defaultMapping], [defaultMapping])).toEqual([]);
  });

  it('keeps a default the customer edited, and anything new', () => {
    const edited = { fromXPath: '/Order/Ref', toXPath: '/Invoice/OrderId' };
    const added = { fromXPath: '/Order/Total', toXPath: '/Invoice/Total' };
    expect(changedMappings([edited, added], [defaultMapping])).toEqual([edited, added]);
  });

  it('treats a default restored to its original content as unchanged', () => {
    const restored = { ...defaultMapping };
    expect(changedMappings([restored], [defaultMapping])).toEqual([]);
  });
});

describe('mergeDefaultFunctions and changedFunctions', () => {
  it('shows a default function and saves nothing for it when untouched', () => {
    const shown = mergeDefaultFunctions([defaultFunctionRaw as any], []);
    expect(shown).toHaveLength(1);
    expect(changedFunctions(shown, [defaultFunctionRaw as any])).toEqual([]);
  });

  it('saves a default function the customer changed under the same id', () => {
    const edited = { ...defaultFunctionRaw, Inputs: { Input: [{ key: 1, name: 'text' }] } };
    const merged = mergeDefaultFunctions([defaultFunctionRaw as any], [edited as any]);
    expect(merged).toEqual([edited]);
    expect(changedFunctions(merged, [defaultFunctionRaw as any])).toEqual([edited]);
  });

  it('saves a function the customer added', () => {
    const added = { id: 'fn-own', type: 'TrimWhitespace', Configuration: {}, Inputs: { Input: [] }, Outputs: { Output: [] } };
    expect(changedFunctions([defaultFunctionRaw as any, added as any], [defaultFunctionRaw as any])).toEqual([added]);
  });
});
