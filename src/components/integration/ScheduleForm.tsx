/**
 * @file ScheduleForm.tsx
 * @component ScheduleForm
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A forwardRef functional component that renders one or more Boomi process
 * schedule editors. Each schedule allows selecting intervals, days, time ranges,
 * and advanced cron expressions. The form tracks internal UI state and exposes
 * a `validateAndSubmit` method to the parent via ref for submission handling.
 *
 * @return {JSX.Element} The rendered schedule form component.
 */

import { 
  forwardRef, 
  useImperativeHandle, 
  useState
} from 'react';
import { 
  AiOutlinePlus, 
  AiOutlineDelete, 
  AiOutlineDown, 
  AiOutlineUp 
} from 'react-icons/ai';
import { ProcessSchedules, Schedule } from  '@boomi/embedkit-sdk';
import { ScheduleUIState } from '../../types/schedule-ui-state';
import Button from '../ui/Button';
import Dropdown from '../ui/Dropdown';
import Input from '../ui/Input';
import logger from '../../logger.service';

/**
 * @type ScheduleFormRef
 * 
 * @description
 * Methods exposed via ref to parent components.
 */
export type ScheduleFormRef = {
  validateAndSubmit: () => ProcessSchedules | null;
};

/**
 * @constant days
 * 
 * @description
 * List of human-readable day names used for schedule selection.
 */
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * @constant dayToBoomiNumber
 * 
 * @description
 * Mapping of day names to Boomi's expected numerical day format.
 */
const dayToBoomiNumber: Record<string, string> = {
  Sunday: '1',
  Monday: '2',
  Tuesday: '3',
  Wednesday: '4',
  Thursday: '5',
  Friday: '6',
  Saturday: '7',
};

/**
 * @constant scheduleTypes
 * 
 * @description
 * Supported schedule types available for selection in the form.
 */
const scheduleTypes: { id: string; name: string }[] = [
  { id: 'minutes', name: 'Minutes' },
  { id: 'hour', name: 'Hour' },
  { id: 'day', name: 'Day' },
  { id: 'advanced', name: 'Advanced' },
];

/**
 * @function defaultUIState
 *
 * @description
 * Default UI state for a newly added schedule entry.
 *
 * @return {ScheduleUIState} A pre-configured default schedule state.
 */
const defaultUIState = (): ScheduleUIState => ({
  type: 'minutes',
  selectedDays: ['2','3','4','5','6'],
  interval: 15,
  startHour: '08',
  startMinute: '00',
  endHour: '18',
  endMinute: '59',
});

/**
 * @interface ScheduleFormProps
 *
 * @description
 * Props for the `ScheduleForm` component.
 *
 * @property {ProcessSchedules | null} [defaultSchedule] - An optional existing schedule configuration to load.
 * @property {string} environmentId - The ID of the Boomi environment this schedule applies to.
 */
interface ScheduleFormProps {
  defaultSchedule?: ProcessSchedules | null;
  environmentId: string;
}

const ScheduleForm = forwardRef<ScheduleFormRef, ScheduleFormProps>(
  ({ defaultSchedule, environmentId }, ref) => {
    const [schedules, setSchedules] = useState<Schedule[]>(
      defaultSchedule?.Schedule?.length
        ? defaultSchedule.Schedule
        : [{
            minutes: '0-59/',
            hours: '00-18',
            daysOfWeek: '2,3,4,5,6',
            daysOfMonth: '*',
            months: '*',
            years: '*',
          }]
    );
    const parseScheduleToUIState = (sched: Schedule): ScheduleUIState => {
      if (!sched) return defaultUIState();

      logger.debug('Parsing schedule:', sched);

      const selectedDays = (sched.daysOfWeek?.split(',') ?? [])
        .map(num => Object.keys(dayToBoomiNumber).find(day => dayToBoomiNumber[day] === num))
        .filter((d): d is string => !!d);

      let type = 'advanced';
      let startHour = '00', startMinute = '00', endHour = '23', endMinute = '59';
      let interval = 15;
      if (
        sched.minutes?.startsWith('0-59/') &&
        sched.hours?.includes('-') &&
        sched.daysOfWeek &&
        sched.daysOfMonth === '*' &&
        sched.months === '*' &&
        sched.years === '*'
      ) {
        type = 'minutes';
        interval = parseInt(sched.minutes.split('/')[1], 10) || 15;
        [startHour, endHour] = sched.hours.split('-');
      } else if (
        sched.hours?.includes('/') &&
        sched.daysOfMonth === '1-31/1' &&
        sched.months === '*' &&
        sched.years === '*'
      ) {
        type = 'hour';
        const [range, step] = sched.hours.split('/');
        const [start, end] = range.split('-');
        startHour = start || '00';
        endHour = end || '23';
        interval = parseInt(step, 10) || 1;
        startMinute = sched.minutes || '00';
      } else if (
        sched.daysOfMonth?.includes('/') &&
        sched.hours &&
        sched.minutes &&
        sched.months === '*' &&
        sched.years === '*'
      ) {
        type = 'day';
        interval = parseInt(sched.daysOfMonth.split('/')[1], 10) || 1;
        startHour = sched.hours;
        startMinute = sched.minutes;
      }
      logger.debug('Parsed type:', type, 'Start/End:', startHour, endHour, startMinute, endMinute, 'Interval:', interval);

      return {
        type,
        selectedDays,
        interval,
        startHour,
        startMinute,
        endHour,
        endMinute,
      };
    };
    const [uiStates, setUiStates] = useState<ScheduleUIState[]>(
      schedules.map(parseScheduleToUIState)
    );
    const [openIndex, setOpenIndex] = useState(0);

    const isValidCronField = (value: string, min: number, max: number) =>
      value.split(',').every(v => {
        if (v.trim() === '*') return true;
        const num = parseInt(v.trim(), 10);
        return !isNaN(num) && num >= min && num <= max;
      });

    const handleDropdownChange = (index: number, selected: { id: string }) => {
      const updatedStates = [...uiStates];
      updatedStates[index].type = selected.id;
      setUiStates(updatedStates);

      if (selected.id === 'advanced') {
        const ui = updatedStates[index];
        const mins = `0-59/${ui.interval}`;
        const hrs = `${ui.startHour}-${ui.endHour}`;
        const days = ui.selectedDays
          .map(day => dayToBoomiNumber[day])
          .filter(Boolean) 
          .join(',') || '*'

        updateSchedule(index, {
          minutes: mins,
          hours: hrs,
          daysOfWeek: days,
        });
      }
    };

    const updateSchedule = (index: number, updates: Partial<Schedule>) => {
      const updated = [...schedules];
      updated[index] = { ...updated[index], ...updates };
      setSchedules(updated);
    };

    const handleAddSchedule = () => {
      setSchedules(prev => [
        ...prev,
        {
          minutes: '*',
          hours: '*',
          daysOfWeek: '*',
          daysOfMonth: '*',
          months: '*',
          years: '*',
        },
      ]);
      setUiStates(prev => [...prev, defaultUIState()]);
      setOpenIndex(schedules.length);
    };

    const handleDeleteSchedule = (index: number) => {
      setSchedules(prev => prev.filter((_, i) => i !== index));
      setUiStates(prev => prev.filter((_, i) => i !== index));
      setOpenIndex(0);
    };

    const toggleDay = (index: number, day: string) => {
      const updatedStates = [...uiStates];
      const selected = updatedStates[index].selectedDays;
      updatedStates[index].selectedDays = selected.includes(day)
        ? selected.filter(d => d !== day)
        : [...selected, day];
      setUiStates(updatedStates);
    };

    const handleUiInputChange = (index: number, field: keyof ScheduleUIState, value: string | number) => {
      const updatedStates = [...uiStates];
      (updatedStates[index][field] as any) = value;
      setUiStates(updatedStates);
    };

    useImperativeHandle(ref, () => ({
      validateAndSubmit: () => {
        const resultSchedules = schedules.map((sched, i) => {
          const ui = uiStates[i];
          let rSched: Schedule = sched;
          switch (ui.type) {
            case 'avanced':
              break;
            case 'day':
              rSched = {
                minutes: `${ui.startMinute}`,
                hours: `${ui.startHour}`,
                daysOfWeek: ui.selectedDays
                  .map(day => dayToBoomiNumber[day])
                  .filter(Boolean)
                  .join(',') || '*',
                daysOfMonth: '1-31/1',
                months: '*',
                years: '*',
              };
              break;
            case 'hours':
              rSched = {
                minutes: `${ui.startMinute}`,
                hours: `${ui.startHour}-${ui.endHour}/${ui.interval}`,
                daysOfWeek: ui.selectedDays
                  .map(day => dayToBoomiNumber[day])
                  .filter(Boolean)
                  .join(',') || '*',
                daysOfMonth: '1-31/1',
                months: '*',
                years: '*',
              };
              break;
            case 'minutes':
              rSched = {
                minutes: `0-59/${ui.interval}`,
                hours: `${ui.startHour}-${ui.endHour}`,
                daysOfWeek: ui.selectedDays
                  .map(day => dayToBoomiNumber[day])
                  .filter(Boolean)
                  .join(',') || '*',
                daysOfMonth: '*',
                months: '*',
                years: '*',
              };
              break;
            default:
              rSched = sched;
          }
          return rSched;
        });

        return {
          ...defaultSchedule,
          atomId: environmentId,
          processId: defaultSchedule?.processId ?? '',
          Schedule: resultSchedules,
        };
      },
    }));

    return (
      <div className="boomi-sched">
        <div className="boomi-sched-actions">
          <Button
            toggle={false}
            primary={false}
            label="Add"
            icon={<AiOutlinePlus className="w-4 h-4" />}
            onClick={handleAddSchedule}
          />
        </div>

        {schedules.map((sched, index) => {
          const isOpen = openIndex === index;
          const ui = uiStates[index];
          const isAdvanced = ui.type === 'advanced';
          const isDay = ui.type === 'day';
          const isHour = ui.type === 'hour';
          const isMinutes = ui.type === 'minutes';

          return (
            <div key={index} className="boomi-sched-card">
              <div
                className="boomi-sched-card__header"
                onClick={() => setOpenIndex(prev => (prev === index ? -1 : index))}
              >
                <span className="boomi-sched-card__title">
                  Schedule #{index + 1} ({ui.type})
                </span>
                <div className="boomi-sched-card__controls">
                  <button
                    className="boomi-sched-card__delete"
                    onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(index); }}
                  >
                    <AiOutlineDelete />
                  </button>
                  {isOpen ? <AiOutlineUp /> : <AiOutlineDown />}
                </div>
              </div>

              {isOpen && (
                <div className="boomi-sched-card__body">
                  <Dropdown
                    formName={`dropdown-${index}`}
                    inputName="scheduleType"
                    label="Schedule Type"
                    required
                    options={scheduleTypes}
                    selected={scheduleTypes.find(st => st.id === ui.type)!}
                    onChange={(val) => handleDropdownChange(index, val)}
                  />

                  {!isAdvanced && (
                    <>
                      <div className="boomi-sched-row">
                        <label className="boomi-sched-label">Start Time</label>
                        <select
                          className="boomi-sched-select"
                          value={ui.startHour}
                          onChange={(e) => handleUiInputChange(index, 'startHour', e.target.value)}
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={String(i).padStart(2, '0')}>
                              {String(i).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                        <select
                          className={`boomi-sched-select ${isMinutes ? 'cursor-not-allowed' : ''}`}
                          value={ui.startMinute}
                          disabled={isMinutes}
                          onChange={(e) => handleUiInputChange(index, 'startMinute', e.target.value)}
                        >
                          {Array.from({ length: 60 }, (_, i) => (
                            <option key={i} value={String(i).padStart(2, '0')}>
                              {String(i).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                      </div>

                      {!isDay && (
                        <div className="boomi-sched-row">
                          <label className="boomi-sched-label">End Time</label>
                          <select
                            className="boomi-sched-select"
                            value={ui.endHour}
                            onChange={(e) => handleUiInputChange(index, 'endHour', e.target.value)}
                          >
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={String(i).padStart(2, '0')}>
                                {String(i).padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                          <select
                            className={`boomi-sched-select ${isMinutes || isHour ? 'cursor-not-allowed' : ''}`}
                            value={ui.endMinute}
                            disabled={isMinutes || isHour}
                            onChange={(e) => handleUiInputChange(index, 'endMinute', e.target.value)}
                          >
                            {Array.from({ length: 60 }, (_, i) => (
                              <option key={i} value={String(i).padStart(2, '0')}>
                                {String(i).padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="boomi-sched-row">
                        <label className="boomi-sched-label">Interval</label>
                        <input
                          type="number"
                          min={1}
                          max={59}
                          className="boomi-sched-input-number"
                          value={ui.interval}
                          onChange={(e) => handleUiInputChange(index, 'interval', Number(e.target.value))}
                        />
                      </div>

                      <div>
                        <p className="boomi-sched-days__label">Select Day(s) to Run</p>
                        <div className="boomi-sched-days">
                          {days.map(day => (
                            <label key={day} className="boomi-sched-day">
                              <input
                                type="checkbox"
                                checked={ui.selectedDays.includes(day)}
                                onChange={() => toggleDay(index, day)}
                              />
                              {day}
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {isAdvanced && (
                    <div className="grid grid-cols-1 gap-4">
                      {(['minutes', 'hours', 'daysOfWeek', 'daysOfMonth', 'months', 'years'] as (keyof Schedule)[]).map(field => (
                        <Input
                          key={field}
                          formName={`advanced-${index}`}
                          label={field}
                          inputName={field}
                          value={sched[field] ?? ''}
                          onChange={(e) => updateSchedule(index, { [field]: e.target.value })}
                          readOnly={false}
                          required={true}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);

export default ScheduleForm;
