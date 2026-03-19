/**
 * @file SearchBar.tsx
 * @component SearchBar
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A search input component used to provide search capabilities within the plugin.
 * Calls the provided callback with the search query when the user submits or types.
 *
 * @return {JSX.Element} The rendered search bar component.
 */

import { useState } from 'react';
import { AiOutlineCloseCircle } from 'react-icons/ai';

/**
 * @interface SearchBarProps
 *
 * @description
 * Props for the `SearchBar` component.
 *
 * @property {(value: string) => void} searchCallback - Callback function invoked with the search query string.
 */
interface SearchBarProps {
  searchCallback: (value: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ searchCallback }) => {
  const [input, setInput] = useState<string>("");

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value; 
    setInput(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const value = e.currentTarget.value; 
      e.preventDefault();
      setInput(value);
      searchCallback(value);
    }
  };

  const handleClear = () => {
    setInput("");
    searchCallback("");
    const el = document.getElementById('search') as HTMLInputElement | null;
    el?.focus();
  };
  
  return (
    <div className="relative flex items-center pr-2 w-[400px]">
      <input
        type="text"
        name="search"
        id="search"
        placeholder="Type to search..."
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="block w-full rounded-md py-2 pl-3 pr-10 text-sm boomi-input"
        aria-label="Search"
      />

      {input.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-1"
          aria-label="Clear search"
          title="Clear"
        >
          <AiOutlineCloseCircle className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
