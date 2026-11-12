/**
 * @file useCrtFind.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The find and replace state of the cross reference table screen: whether the find row is open,
 * the query, the replacement and the three options, the matches of the selected table, which
 * match is current, and the actions of the row (step, replace, replace all, close). It lives with
 * the screen, above the grid, so it survives switching tables: the query and options stay and the
 * matches are worked out again for the new table. Closing the row clears all of it.
 *
 * Searching is live. The table is searched about 200 ms after the query, an option or the table
 * changes (a new search: the first match at or after the active cell becomes current, and the
 * grid moves its active cell there), and again about 200 ms after the store changes (an edit,
 * an undo or a replace). That second kind keeps the position in the list of matches when it is
 * still valid, otherwise clamps it, and never moves the active cell, or typing in a cell would
 * keep dragging the cursor back to a match. The rules of what matches and what a replace writes
 * are all in crtSearch; this file only decides when to run them. Two guards of crtSearch show up in
 * the counter: a regular expression refused as too slow is reported like an invalid one, and a scan
 * that ran out of its time budget keeps the matches it found and says that it stopped early.
 *
 * Making a match current asks the grid to show the cell (active cell and scroll) and never takes
 * focus, so stepping from the find box leaves the cursor in the find box. Replace changes the
 * current cell as one undo step and moves on; Replace all applies the whole plan as one undo step.
 * Both refuse a table that is not editable. The grid is given the matches as a row to column
 * bit mask map, built once per search, so its memoized rows are handed numbers and not sets.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildRowMasks,
  CRT_FIND_DEBOUNCE_MS,
  debounce,
  describeReplaceAll,
  findStatusText,
  keepCurrentIndex,
  matchAfter,
  type CrtFindCommand,
} from '../../../utils/crt/crtFindView';
import {
  findMatches,
  firstMatchAtOrAfter,
  planReplace,
  replaceInCell,
  stepMatch,
  type CrtMatch,
  type CrtSearchOptions,
} from '../../../utils/crt/crtSearch';
import type { CrtStore } from '../../../utils/crt/crtStore';
import type { CrtFindBarProps } from './CrtFindBar';
import type { CrtFindHighlight, CrtGridHandle, NoticeKind } from './crtGridTypes';

/** What the find row needs from the screen: a place for result messages and the read only hint. */
export interface CrtFindCallbacks {
  onNotice?: (message: string, kind: NoticeKind) => void;
  /** Called when Replace is asked for on a table that cannot be edited (Enter in the replace box). */
  onBlocked?: () => void;
}

export interface CrtFind {
  open: boolean;
  /** The Find button: opens the row, or closes it and clears the search. */
  toggle: () => void;
  /** Ctrl or Cmd+F opens (and focuses) the row; F3 and Shift+F3 step, opening it first when it is closed. */
  onCommand: (command: CrtFindCommand) => void;
  /** What the grid highlights. Undefined when nothing matches, so the grid draws nothing extra. */
  highlight: CrtFindHighlight | undefined;
  /** The props of the find row, ready to spread onto CrtFindBar. */
  bar: CrtFindBarProps;
}

/** How a finished search picks its current match. */
type CurrentRule =
  /** The first match at or after the grid's active cell: a new query, option or table. */
  | 'fresh'
  /** The same position in the list when it is still valid: the table changed under the search. */
  | 'keep'
  /** The first match after a cell, wrapping: Replace moving on. */
  | { after: CrtMatch };

/** The result of the latest search, tied to the store it searched. */
interface SearchState {
  store: CrtStore | null;
  matches: CrtMatch[];
  truncated: boolean;
  /** The search ran out of its time budget: the matches are those found so far. */
  stoppedEarly: boolean;
  /** Set only for a pattern that is invalid or refused as too slow. */
  error: string | null;
  /** Index into `matches`, or -1. */
  current: number;
  masks: ReadonlyMap<number, number>;
}

const NO_MATCHES: CrtMatch[] = [];
const NO_MASKS: ReadonlyMap<number, number> = new Map();
const IDLE: SearchState = {
  store: null,
  matches: NO_MATCHES,
  truncated: false,
  stoppedEarly: false,
  error: null,
  current: -1,
  masks: NO_MASKS,
};
const DEFAULT_OPTIONS: CrtSearchOptions = { matchCase: false, wholeCell: false, regex: false };
const ORIGIN = { row: 0, col: 0 };

export function useCrtFind(
  store: CrtStore | null,
  gridRef: React.RefObject<CrtGridHandle | null>,
  callbacks: CrtFindCallbacks = {}
): CrtFind {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [options, setOptions] = useState<CrtSearchOptions>(DEFAULT_OPTIONS);
  const [focusToken, setFocusToken] = useState(0);
  const [search, setSearch] = useState<SearchState>(IDLE);

  // The latest search, and everything the timer and the handlers read, kept in refs so a run that
  // fires between renders never sees a stale query or store (the grid does the same for its own).
  const searchRef = useRef<SearchState>(IDLE);
  const live = useRef({ store, open, query, replacement, options, callbacks });
  // What kind of search is waiting on the debounce. A new search outranks a refresh.
  const waiting = useRef<'fresh' | 'keep' | null>(null);

  useEffect(() => {
    live.current = { store, open, query, replacement, options, callbacks };
  });

  const apply = useCallback((next: SearchState) => {
    searchRef.current = next;
    setSearch(next);
  }, []);

  /** Searches the table now and records the result. Reads the query, options and store from `live`. */
  const runSearch = useCallback(
    (rule: CurrentRule): SearchState => {
      const { store: st, query: q, options: opts } = live.current;
      let next: SearchState = IDLE;
      if (st && q !== '') {
        const result = findMatches((r, c) => st.getCell(r, c), st.rowCount(), st.colCount(), q, opts);
        if (!result.ok) {
          next = { ...IDLE, store: st, error: result.error };
        } else {
          const { matches } = result;
          const before = searchRef.current;
          let current: number;
          if (rule === 'fresh') {
            const at = gridRef.current?.activeCell() ?? ORIGIN;
            current = firstMatchAtOrAfter(matches, at.row, at.col);
          } else if (rule === 'keep') {
            current = keepCurrentIndex(before.store === st ? before.current : -1, matches.length);
          } else {
            current = matchAfter(matches, rule.after.row, rule.after.col);
          }
          next = {
            store: st,
            matches,
            truncated: result.truncated,
            stoppedEarly: result.stoppedEarly === true,
            error: null,
            current,
            masks: buildRowMasks(matches),
          };
        }
      }
      apply(next);
      return next;
    },
    [apply, gridRef]
  );

  /** Moves the grid to the current match. Never takes focus. */
  const reveal = useCallback(
    (state: SearchState) => {
      const match = state.matches[state.current];
      if (match) gridRef.current?.showCell(match.row, match.col);
    },
    [gridRef]
  );

  const debounced = useMemo(
    () =>
      debounce(() => {
        const rule = waiting.current ?? 'keep';
        waiting.current = null;
        const next = runSearch(rule);
        if (rule === 'fresh') reveal(next);
      }, CRT_FIND_DEBOUNCE_MS),
    [runSearch, reveal]
  );

  const schedule = useCallback(
    (kind: 'fresh' | 'keep') => {
      waiting.current = waiting.current === 'fresh' ? 'fresh' : kind;
      debounced();
    },
    [debounced]
  );

  const cancelPending = useCallback(() => {
    debounced.cancel();
    waiting.current = null;
  }, [debounced]);

  // A new query, option or table is a new search. An emptied query clears at once, with no wait.
  useEffect(() => {
    if (!open) return;
    if (query === '') {
      cancelPending();
      apply(IDLE);
      return;
    }
    schedule('fresh');
  }, [open, query, options, store, schedule, cancelPending, apply]);

  // Any change to the table (an edit, an undo, a replace) searches again once things settle.
  useEffect(() => {
    if (!open || !store) return;
    return store.subscribe(() => {
      if (live.current.query !== '') schedule('keep');
    });
  }, [open, store, schedule]);

  // No timer outlives the screen.
  useEffect(() => () => debounced.cancel(), [debounced]);

  const openFind = useCallback(() => {
    setOpen(true);
    setFocusToken((n) => n + 1);
  }, []);

  const closeFind = useCallback(() => {
    cancelPending();
    apply(IDLE);
    setOpen(false);
    setQuery('');
    setReplacement('');
    setOptions(DEFAULT_OPTIONS);
    // Focus goes first, while the find box still has it, so it is never left with nowhere to land.
    gridRef.current?.focus();
  }, [cancelPending, apply, gridRef]);

  const toggle = useCallback(() => {
    if (live.current.open) closeFind();
    else openFind();
  }, [closeFind, openFind]);

  /** Next or previous match, wrapping. A search still waiting on the debounce runs first. */
  const step = useCallback(
    (direction: 1 | -1) => {
      debounced.flush();
      const state = searchRef.current;
      const next = stepMatch(state.current, state.matches.length, direction);
      if (next < 0) return;
      const moved = { ...state, current: next };
      apply(moved);
      reveal(moved);
    },
    [debounced, apply, reveal]
  );

  const onCommand = useCallback(
    (command: CrtFindCommand) => {
      if (command === 'open' || !live.current.open) {
        openFind();
        return;
      }
      step(command === 'next' ? 1 : -1);
    },
    [openFind, step]
  );

  /** Replaces the current match as one undo step, then moves to the next one. */
  const replaceCurrent = useCallback(() => {
    const { store: st, query: q, replacement: rep, options: opts, callbacks: cb } = live.current;
    if (!st || q === '') return;
    if (!st.isEditable()) {
      cb.onBlocked?.();
      return;
    }
    // Text typed into a cell editor lands first, then the table is searched again, so the match
    // being replaced is one that is really there.
    gridRef.current?.commitEdit();
    cancelPending();
    const state = runSearch('keep');
    const match = state.matches[state.current];
    if (!match) return;
    const value = st.getCell(match.row, match.col);
    const next = replaceInCell(value, q, rep, opts);
    if (next !== value) {
      st.batch(() => {
        st.setCell(match.row, match.col, next);
      }, 'Replace');
    }
    // The change told the store's listeners, which queued a refresh; searching now makes it needless.
    cancelPending();
    reveal(runSearch({ after: match }));
  }, [gridRef, cancelPending, runSearch, reveal]);

  /** Replaces every match as one undo step and says how many cells changed. */
  const replaceAll = useCallback(() => {
    const { store: st, query: q, replacement: rep, options: opts, callbacks: cb } = live.current;
    if (!st || q === '') return;
    if (!st.isEditable()) {
      cb.onBlocked?.();
      return;
    }
    gridRef.current?.commitEdit();
    cancelPending();
    const result = planReplace((r, c) => st.getCell(r, c), st.rowCount(), st.colCount(), q, rep, opts);
    if (!result.ok) {
      runSearch('keep');
      return;
    }
    const { changes, truncated } = result.plan;
    if (changes.length > 0) {
      st.batch(() => {
        for (const change of changes) st.setCell(change.row, change.col, change.value);
      }, 'Replace all');
    }
    const notice = describeReplaceAll(changes.length, truncated);
    cb.onNotice?.(notice.message, notice.kind);
    cancelPending();
    runSearch('keep');
  }, [gridRef, cancelPending, runSearch]);

  const toggleOption = useCallback((option: keyof CrtSearchOptions) => {
    setOptions((o) => ({ ...o, [option]: !o[option] }));
  }, []);

  // What is shown. A result belongs to the store it searched and to an open row with a query, so
  // nothing from the previous table or an earlier query flashes up in between.
  const view = open && query !== '' && search.store === store ? search : IDLE;
  const currentMatch = view.matches[view.current] ?? null;

  const highlight = useMemo<CrtFindHighlight | undefined>(
    () => (view.matches.length === 0 ? undefined : { masks: view.masks, current: currentMatch }),
    [view.matches.length, view.masks, currentMatch]
  );

  const bar: CrtFindBarProps = {
    query,
    replacement,
    options,
    // No result yet (the first characters of a query, or a table just switched to) shows nothing,
    // not 'No matches', which would flash before the search has even run.
    status:
      view === IDLE
        ? ''
        : findStatusText({
            query,
            error: view.error,
            count: view.matches.length,
            current: view.current,
            truncated: view.truncated,
            stoppedEarly: view.stoppedEarly,
          }),
    invalid: view.error !== null,
    hasMatches: view.matches.length > 0,
    canReplace: store?.isEditable() ?? false,
    focusToken,
    onQueryChange: setQuery,
    onReplacementChange: setReplacement,
    onToggleOption: toggleOption,
    onStep: step,
    onReplace: replaceCurrent,
    onReplaceAll: replaceAll,
    onClose: closeFind,
  };

  return { open, toggle, onCommand, highlight, bar };
}
