/**
 * @file ExecutionHistoryTable.tsx
 * @component ExecutionHistoryTable
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a table listing execution records with controls for sorting,
 * searching, and pagination. Supports user interaction to view detailed
 * information for individual execution entries.
 *
 * @return {JSX.Element} The execution history table component.
 */

import { useState, useMemo, useCallback } from 'react';
import { AiOutlineReload } from 'react-icons/ai';
import { format } from 'date-fns';
import { ExecutionRecord } from '@boomi/embedkit-sdk';
import { useFetchExecutionRecords } from '../../hooks/execution-summary-record/useFetchExecutionSummaryRecords';
import AjaxLoader from '../ui/AjaxLoader';
import Button from '../ui/Button';
import ExecutionHistoryActions from './ExecutionHistoryActions';
import Pagination from '../ui/Pagination';
import SearchBar from '../ui/SearchBar';

/**
 * @type SortField
 * 
 * @description
 * Represents the fields by which the execution records can be sorted.
 * - 'executionTime' sorts by the timestamp of the execution.
 * - 'status' sorts by the execution status string.
 * - null means no sorting applied.
 */
type SortField = 'executionTime' | 'status' | null;

/**
 * @type SortOrder
 * 
 * @description
 * Represents the order direction for sorting.
 * - 'asc' for ascending order.
 * - 'desc' for descending order.
 */
type SortOrder = 'asc' | 'desc';

/**
 * @constant statusColorMap
 * 
 * @description
 * A mapping of Boomi process execution status strings to Tailwind CSS class names.
 * Used for styling status badges with color-coded indicators based on execution results.
 * 
 * @example
 * statusColorMap['COMPLETE'] // => "text-green-600 bg-green-100 rounded-lg p-1 px-2"
 */
const statusColorMap: Record<string, string> = {
  COMPLETE: 'text-green-600 bg-green-100 rounded-lg p-1 px-2',
  COMPLETE_WARN: 'text-yellow-600 bg-yellow-100 rounded-lg p-1 px-2',
  DISCARDED: 'text-yellow-600 bg-yellow-100 rounded-lg p-1 px-2',
  ERROR: 'text-red-600 bg-red-100 rounded-lg p-1 px-2',
};

/**
 * @function sortRecords
 *
 * @description
 * Sorts an array of execution records by the specified field and order.
 *
 * @param {any[]} records - The list of execution records to sort.
 * @param {SortField} field - The field to sort by ('executionTime' or 'status').
 * @param {SortOrder} order - The sort direction ('asc' or 'desc').
 * 
 * @return {any[]} A new array sorted according to the specified criteria.
 */
const sortRecords = (
  records: any[],
  field: SortField,
  order: SortOrder
): any[] => {
  if (!field) return records;

  return [...records].sort((a, b) => {
    let valA, valB;

    if (field === 'executionTime') {
      valA = new Date(a.executionTime).getTime();
      valB = new Date(b.executionTime).getTime();
    } else if (field === 'status') {
      valA = a.status ?? '';
      valB = b.status ?? '';
    } else {
      return 0;
    }

    if (valA < valB) return order === 'asc' ? -1 : 1;
    if (valA > valB) return order === 'asc' ? 1 : -1;
    return 0;
  });
};

/**
 * @interface ExecutionHistoryTableProps
 *
 * @description
 * Props for the `ExecutionHistoryTable` component.
 *
 * @property {string} id - Integration environment ID to fetch execution records for.
 * @property {(record: ExecutionRecord) => void} onViewDetails - Callback to open a detailed view for a selected execution record.
 */
interface ExecutionHistoryTableProps {
  id: string;
  onViewDetails: (record: ExecutionRecord) => void;
}

const ExecutionHistoryTable: React.FC<ExecutionHistoryTableProps> = ({ id, onViewDetails }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');

  const handleSearch = useCallback(
    (term: string) => {
      setSearchTerm(term);
      goToPage(1);
    },
    []
  );

  const { 
    records = [], 
    isLoading, 
    error, 
    currentPage,
    totalPages,
    goToPage,
    refetch,
  } = useFetchExecutionRecords(id, searchTerm); 

  const [sortField, setSortField] = useState<SortField>('executionTime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const sortedRecords = useMemo(() => 
    sortRecords(records, sortField, sortOrder),
    [records, sortField, sortOrder]
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  const tableBodyContent = (
    <>
      {isLoading ? (
        <tr>
          <td colSpan={4}>
            <div className="flex justify-center items-center py-6"><AjaxLoader /></div>
          </td>
        </tr>
      ) : sortedRecords && sortedRecords.length > 0 ? (
        sortedRecords.map((record, idx) => (
          <tr key={idx}> 
            <td className="py-2 pl-2 text-xs">{format(new Date(record.executionTime), 'yyyy-MM-dd HH:mm:ss')}</td>
            <td className={`py-2 text-xs`}>
              <span className={`${statusColorMap[record.status] || 'text-gray-600'}`}>
                {record.status}
              </span>
            </td>
            <td className="py-2 text-xs">{record.message}</td>
            <td className="px-4 pt-4 text-right">
              <div className="flex items-end justify-end gap-2">
                <ExecutionHistoryActions onViewDetails={() => onViewDetails?.(record)} />
              </div>
            </td>
          </tr>
        ))
      ) : (
        <tr>
          <td colSpan={4}>
            <div className="flex justify-center items-center py-4">
              <p className="text-gray-500 text-xs">No execution history found.</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );

  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <div className="flex-none w-92">
          <SearchBar searchCallback={handleSearch}/>
        </div>
        <div className="flex-none">
          <Button
            toggle={false}
            primary={true}
            showIcon={true}
            label="Refresh"
            icon={<AiOutlineReload className="w-4 h-4" />}
            onClick={() => refetch()}
          />
        </div>
      </div>
      <table className='w-full table-auto rounded-lg shadow-sm'>
        <thead className="boomi-table-header">
          <tr>
            <th
              className="py-3 pl-2 text-left text-sm font-semibold w-48 cursor-pointer select-none"
              onClick={() => handleSort('executionTime')}
              aria-sort={sortField === 'executionTime' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              Execution Time{renderSortIndicator('executionTime')}
            </th>
            <th
              className="py-3 text-left text-sm font-semibold w-24 cursor-pointer select-none"
              onClick={() => handleSort('status')}
              aria-sort={sortField === 'status' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              Status{renderSortIndicator('status')}
            </th>
            <th className="py-3 text-left text-sm font-semibold flex-grow">
              Message
            </th>
            <th className="py-3 text-right w-12"></th>
          </tr>
        </thead>

        <tbody className="divide-y">
          {isLoading ? (
            <tr>
              <td colSpan={5}>
                <div className="flex justify-center items-center py-6"><AjaxLoader /></div>
              </td>
            </tr>
            ) : sortedRecords && sortedRecords.length > 0 ? (
              sortedRecords.map((record, idx) => (
                <tr key={idx} className="boomi-table-row boomi-table-row-scale">
                  <td className="py-2 pl-2 text-xs">{format(new Date(record.executionTime), 'yyyy-MM-dd HH:mm:ss')}</td>
                  <td className={`py-2 text-xs`}>
                    <span className={`${statusColorMap[record.status] || 'text-gray-600'}`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="py-2 text-xs">{record.message}</td>
                  <td className="px-4 pt-4 text-right">
                    <div className="flex items-end justify-end gap-2">
                      <ExecutionHistoryActions onViewDetails={() => onViewDetails?.(record)} />
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>
                  <div className="flex justify-center items-center py-4">
                    <p className="text-gray-500 text-xs">No execution history found.</p>
                  </div>
                </td>
              </tr>
            )}
        </tbody>
      </table>
      <div className="text-xs text-gray-500">
        Note: Execution history is available for the last 30 days.
      </div>
      {!isLoading && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
        />
      )}
      {error && (
        <div className="mt-2 text-red-600 text-sm font-medium text-center">{error}</div>
      )}
    </>
  );
};

export default ExecutionHistoryTable;
