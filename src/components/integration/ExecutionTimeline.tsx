/**
 * @file ExecutionTimeline.tsx
 * @component ExecutionTimeline
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a horizontal timeline of execution statuses for the past 30 days.
 * Each day shows a colored bar indicating the status of the most recent execution.
 * Users can click on a day to view detailed information for that day's latest execution.
 *
 * @return {JSX.Element} Timeline of execution statuses with interactive day indicators.
 */

import classNames from 'classnames';
import { format, subDays, isSameDay } from 'date-fns';
import { ExecutionRecord } from '@boomi/embedkit-sdk';
import { useFetchExecutionRecords } from '../../hooks/execution-summary-record/useFetchExecutionSummaryRecords';

/**
 * @function getColorForStatus
 * 
 * @description
 * Maps a Boomi process execution status string to a corresponding Tailwind CSS 
 * background color class for use in status indicators (e.g., pills, charts, legends).
 *
 * @param {string} status - The process execution status (e.g., 'COMPLETE', 'ERROR').
 * @return {string} A Tailwind background color class representing the given status.
 *
 * @example
 * getColorForStatus('ERROR'); // => 'bg-red-500'
 */
const getColorForStatus = (status: string): string => {
  switch (status) {
    case 'COMPLETE':
      return 'bg-green-500';
    case 'COMPLETE_WARN':
      return 'bg-yellow-400';
    case 'DISCARDED':
      return 'bg-yellow-400';
    case 'ERROR':
      return 'bg-red-500';
    default:
      return 'bg-gray-300';
  }
};

/**
 * @interface ExecutionTimelineProps
 *
 * @description
 * Props for the `ExecutionTimeline` component.
 *
 * @property {string} id - Integration environment ID to fetch execution history for.
 * @property {boolean} [showHeader] - Whether to display the timeline header.
 * @property {boolean} [showFooter] - Whether to display the timeline footer.
 * @property {(record: ExecutionRecord) => void} onViewDetails - Callback triggered when a day's execution record is selected.
 */
interface ExecutionTimelineProps {
  id: string;
  showHeader?: boolean;
  showFooter?: boolean;
  onViewDetails: (record: ExecutionRecord) => void;
}

const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({
  id,
  showHeader,
  showFooter,
  onViewDetails,
}) => {
  const {
    records = [],
    isLoading,
    error,
  } = useFetchExecutionRecords(id);
  const parseTime = (r: ExecutionRecord) => {
    const t = (r.executionTime ?? r.recordedDate) as unknown as string | number | undefined;
    return t ? new Date(t).getTime() || 0 : 0;
  };
  const last30Runs: (ExecutionRecord | null)[] = (() => {
    if (error) return Array(30).fill(null);
    const asc = [...records].sort((a, b) => parseTime(a) - parseTime(b));
    const latestAsc = asc.slice(-30);
    const slots: (ExecutionRecord | null)[] = Array(30).fill(null);
    const offset = 30 - latestAsc.length;
    for (let i = 0; i < latestAsc.length; i++) {
      slots[offset + i] = latestAsc[i];
    }
    return slots;
  })();

  return (
    <>
      {showHeader && (
        <div className="flex justify-between mb-1 text-xs">
          <div>Latest 30 Runs</div>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-lg px-3 py-1 text-xs w-24">...Loading</div>
      ) : (
        <div className="flex items-center w-full pr-6 gap-1">
          {last30Runs.map((record, idx) => {
            const colorClass = getColorForStatus(record?.status ?? '');
            const hasRecord = !!record;

            let tooltip = 'No Record.';
            if (hasRecord) {
              const t = (record!.executionTime ?? record!.recordedDate) as unknown as string | number | undefined;
              tooltip = t ? format(new Date(t), 'dd MMM yyyy, HH:mm') : 'Unknown time';
            }

            return (
              <div
                key={`slot-${idx}-${hasRecord ? (record!.executionId ?? parseTime(record!)) : 'empty'}`}
                className="relative group flex flex-col items-center flex-grow flex-shrink-0 basis-0"
              >
                <div
                  className={classNames(
                    'w-2 h-6 rounded-sm',
                    hasRecord ? 'cursor-pointer' : 'cursor-default',
                    colorClass
                  )}
                  onClick={() => {
                    if (hasRecord) onViewDetails(record!);
                  }}
                  aria-label={hasRecord ? `Run ${idx + 1} (newest on right)` : 'Empty slot'}
                  title={tooltip}
                />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-black text-white text-xs px-2 py-1 rounded shadow-md z-10 whitespace-nowrap max-w-xs break-words text-center">
                  {tooltip}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showFooter && (
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <div>Older</div>
          <div className="text-right">Newest</div>
        </div>
      )}
    </>
  );
};

export default ExecutionTimeline;