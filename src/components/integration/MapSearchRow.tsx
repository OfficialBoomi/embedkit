/**
 * @file MapSearchRow.tsx
 * @component MapSearchRow
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The search bar with Prev / Next and a "current / total" count shown above the
 * Sources, Transformations and Targets columns of the mapping canvas. Searching
 * runs on Enter (see `SearchBar`); the column decides what matches and where each
 * hit is. Styled through `.boomi-map-search*` classes and `--boomi-map-search-*` tokens.
 *
 * @return {JSX.Element} The search row.
 */

import SearchBar from '../ui/SearchBar';

export interface MapSearchRowProps {
  /** Called with the query when the user presses Enter, and with '' when they clear it. */
  onSearch: (query: string) => void;
  /** Number of matches for the current query. */
  hitCount: number;
  /** Zero-based index of the current match. */
  hitIndex: number;
  /** Moves to the previous (-1) or next (+1) match. */
  onStep: (delta: number) => void;
}

const MapSearchRow: React.FC<MapSearchRowProps> = ({ onSearch, hitCount, hitIndex, onStep }) => (
  <div className="boomi-map-search">
    <SearchBar searchCallback={onSearch} />
    <div className="boomi-map-search-nav">
      <button
        type="button"
        className="boomi-map-search-btn"
        onClick={() => onStep(-1)}
        disabled={hitCount === 0}
        title="Previous result"
      >
        Prev
      </button>
      <span className="boomi-map-search-count">
        {hitCount ? `${hitIndex + 1} / ${hitCount}` : '0 / 0'}
      </span>
      <button
        type="button"
        className="boomi-map-search-btn"
        onClick={() => onStep(+1)}
        disabled={hitCount === 0}
        title="Next result"
      >
        Next
      </button>
    </div>
  </div>
);

export default MapSearchRow;
