/**
 * @file Pagination.tsx
 * @component Pagination
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders pagination controls for navigating through multiple pages of content.
 * Displays the current page, total pages, and allows navigation via the provided
 * `onPageChange` callback.
 *
 * @return {JSX.Element} The rendered pagination controls.
 */

import { useState } from 'react';
import Button from '../ui/Button';
import { AiOutlineDoubleLeft, AiOutlineDoubleRight } from 'react-icons/ai';

/**
 * @interface PaginationProps
 *
 * @description
 * Props for the `Pagination` component.
 *
 * @property {number} currentPage - The currently active page number (1-based index).
 * @property {number} totalPages - The total number of available pages.
 * @property {(page: number) => void} onPageChange - Callback invoked when the user selects a different page.
 */
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const [inputPage, setInputPage] = useState(currentPage.toString());

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
      setInputPage(page.toString());
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputPage(e.target.value);
  };

  const handleGoClick = () => {
    const parsed = parseInt(inputPage, 10);
    if (!isNaN(parsed)) {
      goToPage(parsed);
    }
  };

  return (
    <div className="flex justify-end items-center space-x-2 mt-4">
      <Button
        toggle={false}
        primary={false}
        showIcon={true}
        iconOnly={true}
        disabled={currentPage === 1}
        icon={<AiOutlineDoubleLeft className="text-indigo-400 hover:text-indigo-500 w-6 h-6" />}
        onClick={() => goToPage(currentPage - 1)}
      />

      {Array.from({ length: totalPages }).map((_, i) => {
        const pageNum = i + 1;
        return (
          <button
            key={pageNum}
            className={`px-2 py-1 rounded cursor-pointer ${
              currentPage === pageNum
                ? 'text-indigo-500 bg-indigo-100 rounded-md'
                : 'text-indigo-400'
            }`}
            onClick={() => goToPage(pageNum)}
          >
            {pageNum}
          </button>
        );
      })}

      <Button
        toggle={false}
        primary={false}
        showIcon={true}
        iconOnly={true}
        disabled={currentPage === totalPages}
        icon={<AiOutlineDoubleRight className="w-6 h-6" />}
        onClick={() => goToPage(currentPage + 1)}
      />

      <span className="text-sm text-gray-700 ml-2">Go to page</span>
      <input
        type="number"
        value={inputPage}
        onChange={handleInputChange}
        className="w-12 px-1 py-1 border rounded text-sm "
      />
      <Button
        toggle={false}
        primary={false}
        showIcon={false}
        label="Go"
        onClick={handleGoClick}
      />
    </div>
  );
};

export default Pagination;