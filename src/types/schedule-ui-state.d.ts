/**
 * @file schedule-ui-state.d.ts
 * @typedef ScheduleUIState
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Represents a schedule configuration as managed in the UI.
 * Includes details on timing, selected days, and intervals for various schedule types.
 *
 * @property {string} type - The schedule type (e.g., `'minutes'`, `'hour'`, `'day'`, `'advanced'`).
 * @property {string[]} selectedDays - Days of the week on which the schedule should run (e.g., `['MONDAY']`).
 * @property {number} interval - The time interval used for `'minutes'` or `'hour'` schedules.
 * @property {string} startHour - The hour at which the schedule starts (24-hour format).
 * @property {string} startMinute - The minute at which the schedule starts.
 * @property {string} endHour - The hour at which the schedule ends (24-hour format).
 * @property {string} endMinute - The minute at which the schedule ends.
 */
export type ScheduleUIState = {
  type: string;
  selectedDays: string[];
  interval: number;
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
};
