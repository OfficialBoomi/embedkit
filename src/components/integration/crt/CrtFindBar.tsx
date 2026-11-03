/**
 * @file CrtFindBar.tsx
 * @component CrtFindBar
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The find and replace row of the cross reference table editor, shown as the third line of the
 * toolbar while find is open: the find box, the Match case, Whole cell and Regex toggles, the
 * match counter with the previous and next buttons, then the replace box with Replace and
 * Replace all, and a close button. The row holds no search state and runs no search; it shows
 * what useCrtFind reports and passes every action back (see that hook for the rules).
 *
 * Keys: Enter in the find box steps to the next match and Shift+Enter to the previous one, F3
 * and Shift+F3 do the same from anywhere in the row, Ctrl or Cmd+F selects the find box, Enter
 * in the replace box replaces, and Escape closes the row. Every key pressed in the row is kept
 * from the host page (inside a shadow root only text inputs are shielded, and these are inputs
 * with buttons beside them), and Escape is stopped here so it never also leaves full screen. Keys
 * are stopped but not prevented, so typing, Tab and the browser's own text undo still work.
 *
 * A mouse press on a button leaves focus where it was (the toolbar sees to that), so stepping
 * through matches never takes the cursor out of the find box.
 *
 * @return {JSX.Element} The rendered find and replace row.
 */

import { useEffect, useId, useRef } from 'react';
import { AiOutlineArrowDown, AiOutlineArrowUp, AiOutlineClose } from 'react-icons/ai';
import { resolveFindKey } from '../../../utils/crt/crtFindView';
import type { CrtSearchOptions } from '../../../utils/crt/crtSearch';

/**
 * @interface CrtFindBarProps
 *
 * @property {string} query - The text in the find box.
 * @property {string} replacement - The text in the replace box.
 * @property {CrtSearchOptions} options - Which toggles are on.
 * @property {string} status - The counter text ('3 of 12', 'No matches', 'Invalid regular expression', or empty).
 * @property {boolean} invalid - The query is not a valid regular expression.
 * @property {boolean} hasMatches - There is at least one match, so the step and replace buttons can work.
 * @property {boolean} canReplace - The table can be edited. When false Replace and Replace all are off.
 * @property {number} focusToken - Changes every time the find box must take focus and select its text.
 */
export interface CrtFindBarProps {
  query: string;
  replacement: string;
  options: CrtSearchOptions;
  status: string;
  invalid: boolean;
  hasMatches: boolean;
  canReplace: boolean;
  focusToken: number;
  onQueryChange: (value: string) => void;
  onReplacementChange: (value: string) => void;
  onToggleOption: (option: keyof CrtSearchOptions) => void;
  onStep: (direction: 1 | -1) => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

const READ_ONLY_TITLE = 'Press Override to edit';

const CrtFindBar: React.FC<CrtFindBarProps> = ({
  query,
  replacement,
  options,
  status,
  invalid,
  hasMatches,
  canReplace,
  focusToken,
  onQueryChange,
  onReplacementChange,
  onToggleOption,
  onStep,
  onReplace,
  onReplaceAll,
  onClose,
}) => {
  const statusId = `${useId()}-status`;
  const findRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  // Opening the row, and Ctrl or Cmd+F while it is open, put the cursor in the find box with its text selected.
  useEffect(() => {
    const el = findRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  }, [focusToken]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Nothing typed in this row is for the host page. This only ends the event's trip up the
    // tree; the browser's own handling of the key (text, Tab, undo) is not prevented.
    e.stopPropagation();
    // Enter or Escape while an input method is composing text belongs to the composition.
    if (e.nativeEvent.isComposing) return;

    const findKey = resolveFindKey(e);
    if (findKey === 'open') {
      e.preventDefault();
      findRef.current?.focus({ preventScroll: true });
      findRef.current?.select();
      return;
    }
    if (findKey) {
      e.preventDefault();
      onStep(findKey === 'next' ? 1 : -1);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Enter on a button is that button's click; only the two boxes need it here.
      if (e.target === findRef.current) {
        e.preventDefault();
        onStep(e.shiftKey ? -1 : 1);
      } else if (e.target === replaceRef.current) {
        e.preventDefault();
        onReplace();
      }
    }
  };

  const toggle = (
    option: keyof CrtSearchOptions,
    label: string,
    title: string,
    content: React.ReactNode
  ) => (
    <button
      type="button"
      className="boomi-crt-find-toggle"
      aria-pressed={options[option]}
      aria-label={label}
      title={title}
      onClick={() => onToggleOption(option)}
    >
      {content}
    </button>
  );

  // The title says why a button is off: the table first (a fix the user can make), then no matches.
  const buttonTitle = (ready: string): string => {
    if (!canReplace) return READ_ONLY_TITLE;
    return hasMatches ? ready : 'No matches to replace';
  };
  const replaceTitle = buttonTitle('Replace this match and go to the next (Enter)');
  const replaceAllTitle = buttonTitle('Replace every match in the table');

  return (
    <div className="boomi-crt-find" role="search" aria-label="Find and replace" onKeyDown={handleKeyDown}>
      <input
        ref={findRef}
        type="text"
        name="crt-find"
        className="boomi-input boomi-crt-find-input"
        value={query}
        placeholder="Find"
        aria-label="Find"
        aria-invalid={invalid || undefined}
        aria-describedby={statusId}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onQueryChange(e.currentTarget.value)}
      />
      <div className="boomi-crt-find-group" role="group" aria-label="Find options">
        {toggle('matchCase', 'Match case', 'Match case', 'Aa')}
        {toggle('wholeCell', 'Whole cell', 'The whole cell must match', 'Whole cell')}
        {toggle('regex', 'Regex', 'Regular expression', '.*')}
      </div>
      <span
        id={statusId}
        className={`boomi-crt-find-count${invalid ? ' boomi-crt-find-count--invalid' : ''}`}
        role="status"
        aria-live="polite"
      >
        {status}
      </span>
      <div className="boomi-crt-find-group" role="group" aria-label="Step through matches">
        <button
          type="button"
          className="boomi-crt-find-step"
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          disabled={!hasMatches}
          onClick={() => onStep(-1)}
        >
          <AiOutlineArrowUp aria-hidden="true" />
        </button>
        <button
          type="button"
          className="boomi-crt-find-step"
          aria-label="Next match"
          title="Next match (Enter)"
          disabled={!hasMatches}
          onClick={() => onStep(1)}
        >
          <AiOutlineArrowDown aria-hidden="true" />
        </button>
      </div>
      <input
        ref={replaceRef}
        type="text"
        name="crt-replace"
        className="boomi-input boomi-crt-find-input"
        value={replacement}
        placeholder="Replace with"
        aria-label="Replace with"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onReplacementChange(e.currentTarget.value)}
      />
      <button
        type="button"
        className="boomi-crt-tool"
        title={replaceTitle}
        disabled={!canReplace || !hasMatches}
        onClick={onReplace}
      >
        Replace
      </button>
      <button
        type="button"
        className="boomi-crt-tool"
        title={replaceAllTitle}
        disabled={!canReplace || !hasMatches}
        onClick={onReplaceAll}
      >
        Replace all
      </button>
      <button
        type="button"
        className="boomi-crt-tool boomi-crt-find-close"
        aria-label="Close find"
        title="Close (Esc)"
        onClick={onClose}
      >
        <AiOutlineClose aria-hidden="true" />
      </button>
    </div>
  );
};

CrtFindBar.displayName = 'CrtFindBar';
export default CrtFindBar;
