import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent } from '@testing-library/react';

vi.mock('../../context/pluginContext', () => ({
  usePluginOptional: () => ({}),
  usePlugin: () => ({ boomiConfig: {} }),
}));

import ScheduleForm, { ScheduleFormRef } from '../../components/integration/ScheduleForm';

const setup = (schedule: Record<string, string>) => {
  const ref = createRef<ScheduleFormRef>();
  const { container } = render(
    <ScheduleForm ref={ref} environmentId="env-1" defaultSchedule={{ Schedule: [schedule] } as any} />
  );
  const selects = () => Array.from(container.querySelectorAll('select.boomi-sched-select')) as HTMLSelectElement[];
  const interval = () => container.querySelector('input[type="number"]') as HTMLInputElement;
  const submit = () => ref.current!.validateAndSubmit()!.Schedule![0];
  return { selects, interval, submit };
};

describe('ScheduleForm saves what the user edited', () => {
  it('Hour card: interval and start minute edits are kept', () => {
    const { selects, interval, submit } = setup({
      minutes: '59', hours: '23-23/1', daysOfWeek: '1', daysOfMonth: '1-31/1', months: '*', years: '*',
    });
    fireEvent.change(interval(), { target: { value: '3' } });
    fireEvent.change(selects()[1], { target: { value: '58' } });

    const saved = submit();
    expect(saved.minutes).toBe('58');
    expect(saved.hours).toBe('23-23/3');
    expect(saved.daysOfMonth).toBe('1-31/1');
  });

  it('Minutes card: interval edit is kept', () => {
    const { interval, submit } = setup({
      minutes: '0-59/15', hours: '00-18', daysOfWeek: '2,3', daysOfMonth: '*', months: '*', years: '*',
    });
    fireEvent.change(interval(), { target: { value: '10' } });

    expect(submit().minutes).toBe('0-59/10');
  });

  it('Advanced card: the raw fields are saved unchanged', () => {
    const raw = { minutes: '5', hours: '1', daysOfWeek: '2', daysOfMonth: '*', months: '1', years: '*' };
    const { submit } = setup(raw);

    expect(submit()).toMatchObject(raw);
  });
});
