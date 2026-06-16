/**
 * @file SearchBar.tsx
 * @component SearchBar
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A search input component used to provide search capabilities within the plugin.
 * Calls the provided callback with the search query when the user submits or types.
 * When `suggestions` are provided, it renders an accessible autocomplete dropdown
 * of matching values (e.g. installed integration names).
 *
 * @return {JSX.Element} The rendered search bar component.
 */

import { useId, useMemo, useRef, useState } from 'react';
import { AiOutlineCloseCircle } from 'react-icons/ai';

/**
 * @interface SearchBarProps
 *
 * @description
 * Props for the `SearchBar` component.
 *
 * @property {(value: string) => void} searchCallback - Callback function invoked with the search query string.
 * @property {string[]} [suggestions] - Optional list of values used to power an autocomplete dropdown.
 * @property {string} [placeholder] - Optional placeholder text for the input.
 * @property {number} [maxSuggestions] - Optional cap on the number of suggestions shown (default 8).
 */
interface SearchBarProps {
  searchCallback: (value: string) => void;
  suggestions?: string[];
  placeholder?: string;
  maxSuggestions?: number;
}

const SearchBar: React.FC<SearchBarProps> = ({
  searchCallback,
  suggestions,
  placeholder = 'Type to search...',
  maxSuggestions = 8,
}) => {
  const [input, setInput] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const blurTimer = useRef<number | null>(null);
  const listboxId = useId();

  // Case-insensitive substring matches, de-duplicated, excluding an exact match
  // (no point suggesting what's already fully typed).
  const matches = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q || !suggestions?.length) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of suggestions) {
      const name = (s ?? '').trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (lower === q || seen.has(lower)) continue;
      if (lower.includes(q)) {
        seen.add(lower);
        out.push(name);
        if (out.length >= maxSuggestions) break;
      }
    }
    return out;
  }, [input, suggestions, maxSuggestions]);

  const open = () => {
    if (matches.length > 0) setIsOpen(true);
  };
  const close = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const commit = (value: string) => {
    setInput(value);
    searchCallback(value);
    close();
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.currentTarget.value);
    setActiveIndex(-1);
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const showing = isOpen && matches.length > 0;
    switch (e.key) {
      case 'ArrowDown':
        if (showing) {
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % matches.length);
        } else {
          open();
        }
        break;
      case 'ArrowUp':
        if (showing) {
          e.preventDefault();
          setActiveIndex((i) => (i <= 0 ? matches.length - 1 : i - 1));
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (showing && activeIndex >= 0) {
          commit(matches[activeIndex]);
        } else {
          searchCallback(e.currentTarget.value);
          close();
        }
        break;
      case 'Escape':
        if (showing) {
          e.preventDefault();
          close();
        }
        break;
      default:
        break;
    }
  };

  const handleClear = () => {
    setInput('');
    searchCallback('');
    close();
    const el = document.getElementById('search') as HTMLInputElement | null;
    el?.focus();
  };

  return (
    <div className="relative w-[400px] pr-2">
      <div className="relative flex items-center">
        <input
          type="text"
          name="search"
          id="search"
          placeholder={placeholder}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={open}
          onBlur={() => {
            // Delay so a click on an option registers before the list closes.
            blurTimer.current = window.setTimeout(close, 120);
          }}
          className="block w-full rounded-md py-2 pl-3 pr-10 text-sm boomi-input"
          aria-label="Search"
          role="combobox"
          aria-expanded={isOpen && matches.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
          autoComplete="off"
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

      {isOpen && matches.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="boomi-options absolute left-0 right-2 top-full"
          // Keep focus on the input so onBlur doesn't fire before the click.
          onMouseDown={(e) => {
            e.preventDefault();
            if (blurTimer.current) window.clearTimeout(blurTimer.current);
          }}
        >
          {matches.map((name, idx) => (
            <li
              key={name}
              id={`${listboxId}-opt-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
              className={`boomi-option cursor-pointer ${idx === activeIndex ? 'boomi-option--active' : ''}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => commit(name)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchBar;
