/**
 * @file ui-utils.roundtrip.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Seeded default mappings bring platform-defined functions (CurrentDate,
 * TrimWhitespace, UserDefined) onto the canvas. Saving must send them back
 * exactly as received; only Custom Scripting functions are authored here.
 */
import { describe, it, expect } from 'vitest';
import type { MapExtensionsFunction } from '@boomi/embedkit-sdk';
import { fromMapExtensionsFunctions, toMapExtensionsFunctions, isCustomScripting } from '../../utils/ui-utils';

// Shape as read back from the platform after the install-time seed.
const seeded: MapExtensionsFunction[] = [
  {
    id: 'FUNCEXT--0000000001', type: 'CurrentDate' as any, cacheType: 'None' as any,
    Inputs: { Input: [] }, Outputs: { Output: [{ key: 1, name: 'Result' }] }, Configuration: {},
  },
  {
    id: 'FUNCEXT--0000000002', type: 'UserDefined' as any, cacheType: 'None' as any,
    Inputs: { Input: [{ key: 1, name: 'firstName' }, { key: 2, name: 'lastName' }] },
    Outputs: { Output: [{ key: 1, name: 'userID' }] },
    Configuration: { UserDefinedFunction: { id: '727fc838-7f65-4ca5-b084-2b3e3a721bd3', version: 1 } },
  },
  {
    id: 'FUNCEXT--0000000003', type: 'TrimWhitespace' as any, cacheType: 'ByDocument' as any,
    Inputs: { Input: [{ key: 1, name: 'Original String' }] }, Outputs: { Output: [{ key: 1, name: 'Result' }] }, Configuration: {},
  },
  {
    id: 'FUNCEXT--0000000004', type: 'CustomScripting' as any, cacheType: 'None' as any,
    Inputs: { Input: [{ key: 1, name: 'in' }] }, Outputs: { Output: [{ key: 1, name: 'out' }] },
    Configuration: {
      Scripting: {
        language: 'Javascript' as any, Script: 'out = in;',
        Inputs: { Input: [{ index: 1, name: 'in', dataType: 'CHARACTER' as any }] },
        Outputs: { Output: [{ index: 1, name: 'out' }] },
      },
    },
  },
];

describe('platform-defined functions round-trip through the canvas model', () => {
  const nodes = fromMapExtensionsFunctions(seeded);

  it('gives every function its pins so mapping lines can be drawn', () => {
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId['FUNCEXT--0000000001'].outputs).toEqual([{ key: 1, name: 'Result' }]);
    expect(byId['FUNCEXT--0000000002'].inputs.map((i) => i.name)).toEqual(['firstName', 'lastName']);
    expect(byId['FUNCEXT--0000000002'].outputs).toEqual([{ key: 1, name: 'userID' }]);
    expect(byId['FUNCEXT--0000000004'].inputs).toEqual([{ key: 1, name: 'in', dataType: 'CHARACTER' }]);
  });

  it('marks only Custom Scripting as editable and keeps the original for the rest', () => {
    for (const n of nodes) {
      const scripting = isCustomScripting(n.type);
      expect(n.editable).toBe(scripting);
      expect(n.raw === undefined).toBe(scripting);
    }
  });

  it('sends platform-defined functions back byte-for-byte and re-authors only scripting ones', () => {
    const { functions, idMap } = toMapExtensionsFunctions(nodes);
    expect(idMap).toEqual({});
    expect(functions.slice(0, 3)).toEqual(seeded.slice(0, 3));
    const script = functions[3];
    expect(script.type).toBe('CustomScripting');
    expect(script.Configuration.Scripting?.Script).toBe('out = in;');
  });

  it('re-keys a platform-defined function when the canvas assigns a new id, keeping its definition', () => {
    const moved = nodes.map((n) => (n.id === 'FUNCEXT--0000000002' ? { ...n, newId: 'FUNCEXT--0000000002---y:120' } : n));
    const { functions, idMap } = toMapExtensionsFunctions(moved);
    expect(idMap).toEqual({ 'FUNCEXT--0000000002': 'FUNCEXT--0000000002---y:120' });
    const udf = functions.find((f) => f.id === 'FUNCEXT--0000000002---y:120')!;
    expect(udf.type).toBe('UserDefined');
    expect(udf.Configuration.UserDefinedFunction).toEqual({ id: '727fc838-7f65-4ca5-b084-2b3e3a721bd3', version: 1 });
  });
});
