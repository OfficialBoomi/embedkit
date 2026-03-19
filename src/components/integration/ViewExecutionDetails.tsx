/**
 * @file ViewExecutionDetails.tsx
 * @component ViewExecutionDetails
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A functional React component that displays detailed information
 * about a single execution record of a Boomi process. It renders
 * key execution metadata such as process name, execution ID, status,
 * timestamps, document counts, and any error or warning messages.
 *
 * The component visually distinguishes execution statuses with
 * color-coded labels and provides a clear layout of execution details.
 *
 * @return {JSX.Element} The rendered execution detail view.
 */

import classNames from 'classnames';
import { format } from 'date-fns';
import { ExecutionRecord } from '@boomi/embedkit-sdk';

/**
 * @constant statusColorMap
 *
 * Maps execution statuses to Tailwind CSS class strings for color-coding.
 */
const statusColorMap: Record<string, string> = {
  COMPLETE: 'text-green-600 bg-green-100',
  COMPLETE_WARN: 'text-yellow-600 bg-yellow-100',
  DISCARDED: 'text-yellow-600 bg-yellow-100',
  ERROR: 'text-red-600 bg-red-100',
};

/**
 * @interface ViewExecutionDetailsProps
 *
 * @description
 * Props for the `ViewExecutionDetails` component.
 *
 * @property {ExecutionRecord} record - The execution record data to display.
 */
interface ViewExecutionDetailsProps {
  record: ExecutionRecord;
}

const ViewExecutionDetails: React.FC<ViewExecutionDetailsProps> = ({ record }) => {
  const {
    processName,
    executionId,
    executionTime,
    recordedDate,
    status,
    atomName,
    launcherID,
    executionType,
    inboundDocumentCount,
    outboundDocumentCount,
    message,
  } = record;

  const statusClass = classNames(
    'text-xs font-semibold rounded-full px-2 py-1',
    statusColorMap[status] || 'bg-gray-100 text-gray-600'
  );

  return (
    <div className="border rounded-xl p-5 shadow-md bg-white space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-md font-bold text-gray-800">{processName}</h2>
          <span className="text-xs font-normal text-gray-700 mt-1">Execution ID: {executionId}</span>
        </div>
        <div className="flex flex-col">
          <span className={statusClass}>{status}</span>
          <span className="text-xs font-normal text-gray-700 mt-1">{executionType}</span>
        </div>

      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-700">
        <div>
          <span className="font-medium">Start Time:</span>{' '}
          {format(new Date(executionTime), 'PPpp')}
        </div>
        <div>
          <span className="font-medium">End Time:</span>{' '}
          {format(new Date(recordedDate), 'PPpp')}
        </div>
        <div>
          <span className="font-medium">Runtime:</span> {atomName}
        </div>
        <div>
          <span className="font-medium">Launcher:</span> {launcherID}
        </div>

        <div>
          <span className="font-medium">Inbound Docs:</span>{' '}
          {inboundDocumentCount ?? 0}
        </div>
        <div>
          <span className="font-medium">Outbound Docs:</span>{' '}
          {outboundDocumentCount ?? 0}
        </div>
      </div>

      {message && status === 'ERROR' && (
        <div className="mt-3 bg-red-50 border border-red-300 rounded p-3 text-sm text-red-700">
          <strong>Error:</strong> {message}
        </div>
      )}
      {message && status === 'COMPLETE_WARN' && (
        <div className="mt-3 bg-yellow-50 border border-red-300 rounded p-3 text-sm text-yellow-700">
          <strong>Error:</strong> {message}
        </div>
      )}
      {message && status === 'DISCARDED' && (
        <div className="mt-3 bg-yellow-50 border border-red-300 rounded p-3 text-sm text-yellow-700">
          <strong>Error:</strong> {message}
        </div>
      )}
      {message && status === 'COMPLETE' && (
        <div className="mt-3 bg-green-50 border border-red-300 rounded p-3 text-sm text-green-700">
          <strong>Error:</strong> {message}
        </div>
      )}
    </div>
  );
};

export default ViewExecutionDetails;
