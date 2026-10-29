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
import { paginationRootClass } from '../../utils/pagination';
import type { PaginationAlignment, PaginationPosition, PaginationStyles } from '../../types/pagination.config';

/**
 * @interface PaginationProps
 *
 * @description
 * Props for the `Pagination` component.
 *
 * @property {number} currentPage - The currently active page number (1-based index).
 * @property {number} totalPages - The total number of available pages.
 * @property {(page: number) => void} onPageChange - Callback invoked when the user selects a different page.
 * @property {PaginationPosition} [position] - Where the controls sit. Default 'bottom'.
 * @property {PaginationAlignment} [alignment] - Horizontal alignment. Default 'end'.
 * @property {PaginationStyles} [styles] - Inline style overrides per part (already validated by the caller).
 */
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  position?: PaginationPosition;
  alignment?: PaginationAlignment;
  styles?: PaginationStyles;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  position = 'bottom',
  alignment = 'end',
  styles,
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
    <div className={paginationRootClass(position, alignment)} style={styles?.root}>
      <Button
        toggle={false}
        primary={false}
        showIcon={true}
        iconOnly={true}
        disabled={currentPage === 1}
        icon={<AiOutlineDoubleLeft className="boomi-pagination__arrow w-6 h-6" />}
        onClick={() => goToPage(currentPage - 1)}
      />

      {Array.from({ length: totalPages }).map((_, i) => {
        const pageNum = i + 1;
        const active = currentPage === pageNum;
        return (
          <button
            key={pageNum}
            className={`px-2 py-1 rounded cursor-pointer boomi-pagination__page ${
              active ? 'boomi-pagination__page--active rounded-md' : ''
            }`.trim()}
            style={active ? { ...styles?.pageButton, ...styles?.activePageButton } : styles?.pageButton}
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
        icon={<AiOutlineDoubleRight className="boomi-pagination__arrow boomi-pagination__arrow--next w-6 h-6" />}
        onClick={() => goToPage(currentPage + 1)}
      />

      <span className="text-sm boomi-pagination__label ml-2">Go to page</span>
      <input
        type="number"
        value={inputPage}
        onChange={handleInputChange}
        className="w-12 px-1 py-1 border rounded text-sm boomi-pagination__input"
        style={styles?.input}
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