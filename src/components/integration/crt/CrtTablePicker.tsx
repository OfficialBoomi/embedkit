/**
 * @file CrtTablePicker.tsx
 * @component CrtTablePicker
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The table picker of the cross reference table screen. It looks like the shared searchable
 * Dropdown (same select and option classes) and adds what that one cannot do: a small dot
 * before the name of a table that has unsaved edits, an option that is listed but cannot be
 * chosen (with its reason shown under the name), and a compact form that fits the full
 * screen caption row.
 *
 * The list is rendered inside the component and placed with position: absolute. A portal to
 * document.body is not an option: inside the plugin's shadow root it would lose every style.
 * The list closes on an outside press, on Escape and when focus leaves the picker.
 *
 * Focus moves into the open list (the search box when there is one, otherwise the list) and
 * the highlighted option is exposed with aria-activedescendant. Keys: Arrow Up and Arrow Down
 * move the highlight (skipping disabled options, wrapping), Home and End jump, Enter selects,
 * Escape closes and gives focus back to the button, Tab closes and moves on. In the search box
 * Home and End still move the caret once something has been typed, and every key the box does
 * not use is kept from the host page. Escape is stopped here, so it never also leaves full
 * screen. On the closed button Enter, Space and the arrow keys open the list.
 *
 * The picker holds no table state. Choosing an option calls `onSelect(key)` and closes the
 * list; the screen decides what happens next.
 *
 * @return {JSX.Element} The rendered picker.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { AiOutlineCaretDown, AiOutlineCheck } from 'react-icons/ai';

export interface CrtPickerOption {
  /** Unique, for example `${processId}:${tableId}`. */
  key: string;
  name: string;
  /** The muted line under the name, for example "Store Sync | Overridden | 42 rows". */
  description: string;
  /** Unsaved edits: a small dot is shown before the name. */
  dirty: boolean;
  /**
   * When set (and not empty) the option is listed but cannot be chosen. The reason replaces
   * the description under the name and repeats as the option's tooltip.
   */
  disabledReason?: string;
}

export interface CrtTablePickerProps {
  options: CrtPickerOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Full screen: one short button, no visible label, narrower. */
  compact?: boolean;
  /** Visible above the button, and the accessible name when compact. Defaults to "Table". */
  label?: string;
}

/** The search box appears when there are more options than this. */
const SEARCH_THRESHOLD = 6;
const PLACEHOLDER = 'Please select';

const isEnabled = (o: CrtPickerOption): boolean => !o.disabledReason;

/** Case insensitive match on the name, the description and the disabled reason. */
function filterOptions(list: CrtPickerOption[], query: string): CrtPickerOption[] {
  const q = query.toLowerCase();
  if (!q) return list;
  return list.filter(
    (o) =>
      o.name.toLowerCase().includes(q) ||
      o.description.toLowerCase().includes(q) ||
      (o.disabledReason ?? '').toLowerCase().includes(q)
  );
}

/**
 * The next enabled option from `from` in the given direction, wrapping, or -1 when none is
 * enabled. From "nothing highlighted" (-1) Down lands on the first option and Up on the last.
 */
function stepEnabled(list: readonly CrtPickerOption[], from: number, dir: 1 | -1): number {
  const n = list.length;
  if (n === 0) return -1;
  let i = from < 0 ? (dir === 1 ? -1 : n) : from;
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n;
    if (isEnabled(list[i])) return i;
  }
  return -1;
}

const UnsavedDot: React.FC = () => (
  <span role="img" aria-label="Unsaved changes" className="boomi-crt-tp-dot" />
);

const CrtTablePicker: React.FC<CrtTablePickerProps> = ({
  options,
  selectedKey,
  onSelect,
  compact = false,
  label = 'Table',
}) => {
  const uid = useId();
  const buttonId = `${uid}-button`;
  const labelId = `${uid}-label`;
  const valueId = `${uid}-value`;
  const listId = `${uid}-list`;
  const optionId = (index: number) => `${uid}-option-${index}`;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // The highlight is kept by key, so it survives the options being rebuilt on every render.
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.key === selectedKey);
  const searchable = options.length > SEARCH_THRESHOLD;
  const filtered = open ? filterOptions(options, search) : options;
  const activeIndex = filtered.findIndex((o) => o.key === activeKey && isEnabled(o));
  const activeDescendant = open && activeIndex >= 0 ? optionId(activeIndex) : undefined;

  const openList = () => {
    const start = selected && isEnabled(selected) ? selected : options.find(isEnabled);
    setActiveKey(start?.key ?? null);
    setSearch('');
    setOpen(true);
  };

  const closeList = (refocus: boolean) => {
    setOpen(false);
    setSearch('');
    if (refocus) buttonRef.current?.focus({ preventScroll: true });
  };

  const choose = (o: CrtPickerOption) => {
    if (!isEnabled(o)) return;
    onSelect(o.key);
    closeList(true);
  };

  // Opening moves focus into the list so the keys work and Escape has somewhere to land.
  useEffect(() => {
    if (!open) return;
    (searchRef.current ?? listRef.current ?? panelRef.current)?.focus({ preventScroll: true });
  }, [open]);

  // Keep the highlighted option on screen. Done by hand on the list element: scrollIntoView
  // would also scroll the page.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const list = listRef.current;
    const el = list?.children[activeIndex] as HTMLElement | undefined;
    if (!list || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [open, activeIndex]);

  // A press outside closes the list. Inside a shadow root the event target is retargeted to
  // the host, so the check uses the composed path.
  useEffect(() => {
    if (!open) return;
    const onPress = (e: MouseEvent) => {
      const root = rootRef.current;
      if (root && e.composedPath().includes(root)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', onPress, true);
    return () => document.removeEventListener('mousedown', onPress, true);
  }, [open]);

  // Focus moving to another element (Tab is handled in the key handler, this covers the rest).
  // A null target (a press on empty space, or the window losing focus) is left to the press
  // listener above, so switching windows does not close the list.
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (open && next && !e.currentTarget.contains(next)) closeList(false);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.currentTarget.value;
    setSearch(next);
    const matches = filterOptions(options, next);
    const first = stepEnabled(matches, -1, 1);
    setActiveKey(first >= 0 ? matches[first].key : null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return;

    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        openList();
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    const inSearch = e.target === searchRef.current;
    const jumpTo = (index: number) => {
      if (index >= 0) setActiveKey(filtered[index].key);
    };

    switch (e.key) {
      case 'ArrowDown':
        jumpTo(stepEnabled(filtered, activeIndex, 1));
        break;
      case 'ArrowUp':
        jumpTo(stepEnabled(filtered, activeIndex, -1));
        break;
      case 'Home':
        if (inSearch && search) return;
        jumpTo(stepEnabled(filtered, -1, 1));
        break;
      case 'End':
        if (inSearch && search) return;
        jumpTo(stepEnabled(filtered, -1, -1));
        break;
      case 'Enter':
        if (activeIndex >= 0) choose(filtered[activeIndex]);
        break;
      case ' ':
        // A space typed into the search box is text, not a choice.
        if (inSearch) {
          e.stopPropagation();
          return;
        }
        if (activeIndex >= 0) choose(filtered[activeIndex]);
        break;
      case 'Escape':
        closeList(true);
        break;
      case 'Tab':
        // Focus goes to the button first, so the browser's own Tab moves on from there.
        closeList(true);
        return;
      default:
        // Typed characters stay in the search box and are kept from the host page's shortcuts.
        if (inSearch) e.stopPropagation();
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const selectedName = selected?.name ?? PLACEHOLDER;
  const rootClass = `boomi-crt-tp${compact ? ' boomi-crt-tp--compact' : ''}`;

  return (
    <div ref={rootRef} className={rootClass} onKeyDown={handleKeyDown} onBlur={handleBlur}>
      {!compact && (
        <label id={labelId} htmlFor={buttonId} className="boomi-form-label">
          {label}
        </label>
      )}

      <div className="boomi-crt-tp-anchor">
        <button
          ref={buttonRef}
          id={buttonId}
          type="button"
          className="boomi-select boomi-crt-tp-btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open && filtered.length > 0 ? listId : undefined}
          aria-labelledby={compact ? undefined : `${labelId} ${valueId}`}
          aria-label={
            compact
              ? `${label}: ${selectedName}${selected?.dirty ? ' (unsaved changes)' : ''}`
              : undefined
          }
          onClick={() => (open ? closeList(false) : openList())}
        >
          <span id={valueId} className="boomi-crt-tp-value">
            {selected?.dirty && <UnsavedDot />}
            <span className="boomi-crt-tp-trunc">{selectedName}</span>
          </span>
          <span className="boomi-crt-tp-caret">
            <AiOutlineCaretDown className="boomi-select-icon" aria-hidden="true" />
          </span>
        </button>

        {open && (
          <div
            ref={panelRef}
            tabIndex={-1}
            className="boomi-options boomi-options--searchable boomi-crt-tp-panel"
            // Keep focus where it is when the list is pressed, or the blur would close it
            // before the click lands. The search box needs the press for its caret.
            onMouseDown={(e) => {
              if (e.target !== searchRef.current) e.preventDefault();
            }}
          >
            {searchable && (
              <div className="boomi-options-search boomi-crt-tp-search">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  placeholder="Search tables..."
                  aria-label="Search tables"
                  aria-controls={filtered.length > 0 ? listId : undefined}
                  aria-activedescendant={activeDescendant}
                  autoComplete="off"
                  className="boomi-input boomi-options-search-input"
                  onChange={handleSearch}
                />
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="boomi-crt-tp-empty">No options found</div>
            ) : (
              <div
                ref={listRef}
                id={listId}
                role="listbox"
                tabIndex={-1}
                aria-label={`${label} options`}
                aria-activedescendant={searchable ? undefined : activeDescendant}
                className="boomi-crt-tp-list"
              >
                {filtered.map((o, i) => {
                  const disabled = !isEnabled(o);
                  const isSelected = o.key === selectedKey;
                  const className =
                    'boomi-option boomi-crt-tp-option' +
                    (isSelected ? ' boomi-option--selected' : '') +
                    (i === activeIndex ? ' boomi-option--active' : '') +
                    (disabled ? ' boomi-crt-tp-option--disabled' : '');
                  return (
                    <div
                      key={o.key}
                      id={optionId(i)}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={disabled ? true : undefined}
                      title={disabled ? o.disabledReason : undefined}
                      className={className}
                      onMouseMove={() => {
                        // Hover moves the shared highlight; a disabled option never gets it.
                        if (!disabled && o.key !== activeKey) setActiveKey(o.key);
                      }}
                      onClick={() => choose(o)}
                    >
                      <div className="boomi-crt-tp-text">
                        <span className="boomi-crt-tp-name-row">
                          {o.dirty && <UnsavedDot />}
                          <span
                            className={`boomi-crt-tp-trunc ${isSelected ? 'boomi-crt-tp-name--selected' : ''}`}
                          >
                            {o.name}
                          </span>
                        </span>
                        <span className="boomi-crt-tp-desc boomi-crt-tp-trunc">
                          {disabled ? o.disabledReason : o.description}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="boomi-crt-tp-check">
                          <AiOutlineCheck aria-hidden="true" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

CrtTablePicker.displayName = 'CrtTablePicker';
export default CrtTablePicker;
