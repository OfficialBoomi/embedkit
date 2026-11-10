import { describe, expect, it } from 'vitest';
import { describeEnvironment, describeScheduleLoadError } from '../../utils/scheduleLoadError';

const NO_ATOMS =
  'Unexpected error fetching process schedules: Unable to fetch process schedules for env=e1 ipi=i1: No atoms found for environmentId: e1';
const OTHER = 'Unexpected error fetching process schedules: Service Unavailable';
const named = { environmentId: 'e1', environments: [{ id: 'e1', name: 'Production' }, { id: 'e2', name: 'Test' }] };

describe('describeEnvironment', () => {
  it('names the environment from the list the integration carries, with its id', () => {
    expect(describeEnvironment(named)).toBe('"Production" (e1)');
  });
  it('falls back to the id when the list has no name for it', () => {
    expect(describeEnvironment({ environmentId: 'e1', environments: [{ id: 'e1' }] })).toBe('e1');
    expect(describeEnvironment({ environmentId: 'e1', environments: [{ id: 'e1', name: '   ' }] })).toBe('e1');
    expect(describeEnvironment({ environmentId: 'e1' })).toBe('e1');
  });
  it('picks the entry of the environment in use, not another one', () => {
    expect(describeEnvironment({ environmentId: 'e2', environments: named.environments })).toBe('"Test" (e2)');
  });
  it('is empty when there is no environment id', () => {
    expect(describeEnvironment({})).toBe('');
    expect(describeEnvironment({ environmentId: '  ', environments: named.environments })).toBe('');
  });
});

describe('describeScheduleLoadError', () => {
  it('says plainly that no runtime is attached, naming the environment', () => {
    expect(describeScheduleLoadError(NO_ATOMS, named)).toBe('No runtime is attached to environment "Production" (e1). Attach one in Boomi.');
  });
  it('still says it without a name, and without any environment', () => {
    expect(describeScheduleLoadError(NO_ATOMS, { environmentId: 'e1' })).toBe('No runtime is attached to environment e1. Attach one in Boomi.');
    expect(describeScheduleLoadError(NO_ATOMS, {})).toBe('No runtime is attached to the environment of this integration. Attach one in Boomi.');
  });
  it('for any other failure puts the environment first and keeps the reason as it came', () => {
    expect(describeScheduleLoadError(OTHER, named)).toBe(`Environment "Production" (e1): ${OTHER}`);
  });
  it('leaves the reason alone when there is no environment to name', () => {
    expect(describeScheduleLoadError(OTHER, {})).toBe(OTHER);
  });
  it('does not call a different "not found" a missing runtime', () => {
    const raw = 'Unexpected error fetching process schedules: No processes found for integrationPackInstanceId: i1';
    expect(describeScheduleLoadError(raw, named)).toBe(`Environment "Production" (e1): ${raw}`);
  });
});
