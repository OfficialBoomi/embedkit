/**
 * @file crtGridTypes.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Types shared by the lookup table grid and the hooks that were split out of it. The public
 * ones (CrtOp, CrtGridHandle, CrtGridInfo, CrtGridProps) are re-exported from CrtGrid.tsx,
 * which is where the toolbar and the screen import them from. Types only: no runtime code.
 */

import type { CrtStore } from '../../../utils/crt/crtStore';
import type { GridSelection } from '../../../utils/crt/crtGridSelection';
import type { CrtFindCommand } from '../../../utils/crt/crtFindView';
import type { CrtMatch } from '../../../utils/crt/crtSearch';
import type { CrtCell } from '../../../utils/crt/crtTypes';
import type { CrtKeyWarnings } from '../../../utils/crt/crtWarnings';
import type { GridLayout } from './gridLayout';

/** Everything the grid can do to a table, for the toolbar, the menu and the keyboard alike. */
export type CrtOp =
  | 'add-row'
  | 'insert-above'
  | 'insert-below'
  | 'duplicate'
  | 'delete'
  | 'move-up'
  | 'move-down'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'paste-above'
  | 'paste-below'
  | 'clear'
  | 'select-all'
  | 'undo'
  | 'redo';

/** The imperative surface the screen uses: the toolbar runs operations through it. */
export interface CrtGridHandle {
  run(op: CrtOp): void;
  focus(): void;
  /**
   * Makes a cell the active cell and scrolls it into view, without moving focus (find and
   * replace steps through matches while the cursor stays in its own input). Commits an open
   * cell editor first. Ticked rows stay ticked, like any keyboard move.
   */
  showCell(row: number, col: number): void;
  /** The active cell, pulled back inside the table. */
  activeCell(): CrtCell;
  /** How far the grid is scrolled, in pixels. With scrollTo, it lets the screen keep a user's place across a save. */
  scrollPosition(): { top: number; left: number };
  /** Scrolls the grid to a position in pixels (the browser keeps it inside what there is to scroll). */
  scrollTo(top: number, left: number): void;
  /** Commits an open cell editor, so a table wide operation never runs under a stale one. */
  commitEdit(): void;
}

/**
 * What the grid draws for find: which cells match and which match is current. `masks` maps a
 * row index to a bit mask of its matching columns (bit c is column c), so a memoized row is
 * given one number and a row whose number did not change does not draw again.
 */
export interface CrtFindHighlight {
  masks: ReadonlyMap<number, number>;
  current: CrtMatch | null;
}

/** What the toolbar needs to know about the grid. Reported whenever any of it may have changed. */
export interface CrtGridInfo {
  selectionLabel: string;
  canEdit: boolean;
  hasRows: boolean;
  checkedCount: number;
  targetCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  atMaxRows: boolean;
  rowCount: number;
  /** The table has a step to undo or redo. Always false on a read only table. */
  canUndo: boolean;
  canRedo: boolean;
  /** What Undo or Redo would do (for example 'Delete 3 rows'), for a tooltip. Null when unavailable. */
  undoLabel: string | null;
  redoLabel: string | null;
}

export type NoticeKind = 'info' | 'warn';
export type PasteMode = 'paste' | 'above' | 'below';
export type EditMode = 'select-all' | 'append' | 'replace';
export type CommitMove = 'down' | 'up' | 'right' | 'left';

/** The open cell editor. It remembers its store so a stale editor can never write to another table. */
export interface EditState {
  store: CrtStore;
  row: number;
  col: number;
  mode: EditMode;
  initial: string;
}

/** `value` null means cancel. `refocus` is false when focus is already going elsewhere (blur). */
export type FinishEdit = (value: string | null, move: CommitMove | null, refocus: boolean) => void;

/**
 * @interface CrtGridProps
 *
 * @description
 * Props for the `CrtGrid` component.
 *
 * @property {CrtStore} store - The table data and its edit state.
 * @property {string} ariaLabel - Accessible name of the grid.
 * @property {() => void} [onBlocked] - Called when the user tries to edit a read only table.
 * @property {(info: CrtGridInfo) => void} [onInfo] - Called after render whenever the selection or the table changed.
 * @property {(message: string, kind: 'info' | 'warn') => void} [onNotice] - Short result messages ("Pasted 3 rows").
 * @property {(rowCount: number) => Promise<boolean>} [confirmDelete] - Asked before deleting two or more rows.
 * @property {CrtFindHighlight} [find] - The matching cells to highlight and the current match. Absent when find is closed.
 * @property {(command: CrtFindCommand) => void} [onFind] - Ctrl or Cmd+F, F3 and Shift+F3 while the grid has focus. Without it the grid leaves those keys alone.
 * @property {CrtKeyWarnings} [keyWarnings] - The blank and duplicate keys of the table. The key cell of each flagged row gets a warning style, and only while the table is editable. Absent draws none.
 */
export interface CrtGridProps {
  store: CrtStore;
  ariaLabel: string;
  onBlocked?: () => void;
  onInfo?: (info: CrtGridInfo) => void;
  onNotice?: (message: string, kind: NoticeKind) => void;
  confirmDelete?: (rowCount: number) => Promise<boolean>;
  find?: CrtFindHighlight;
  onFind?: (command: CrtFindCommand) => void;
  keyWarnings?: CrtKeyWarnings;
}

/** The callbacks the grid reads through a ref, so a handler that outlives a render never sees stale ones. */
export type GridCallbacks = Pick<CrtGridProps, 'onBlocked' | 'onNotice' | 'confirmDelete' | 'onFind'>;

/** An armed "paste with the keyboard next" request and the timer that expires it. */
export interface PendingPaste {
  mode: PasteMode;
  timer: ReturnType<typeof setTimeout>;
}

/** The pending paste ref and the function that clears it, which CrtGrid owns and hooks share. */
export interface GridPendingPaste {
  pendingPasteRef: React.RefObject<PendingPaste | null>;
  clearPending: () => void;
}

/** Where the context menu is open, in coordinates relative to the grid wrapper. */
export interface MenuPosition {
  x: number;
  y: number;
}

/** The menu state CrtGrid owns (its close function is needed by the reset effects) and hooks share. */
export interface GridMenuState {
  menu: MenuPosition | null;
  setMenu: React.Dispatch<React.SetStateAction<MenuPosition | null>>;
  menuOpenRef: React.RefObject<boolean>;
  /** The scroll position when the menu opened: a scroll event that merely reports it is not a scroll. */
  menuScrollRef: React.RefObject<{ top: number; left: number } | null>;
  closeMenu: (refocus: boolean) => void;
}

/** A scroll that has to wait for the next render, because the table just got taller. */
export interface ScrollTarget {
  row: number;
  col: number;
}

/**
 * What every hook split out of the grid needs. The grid builds it each render, so `store` and
 * `layout` are always the current ones, exactly like the closures it replaces. The refs are
 * created in CrtGrid (it owns them); hooks only read and write them.
 */
export interface GridContext {
  store: CrtStore;
  layout: GridLayout;
  rootRef: React.RefObject<HTMLDivElement | null>;
  boxRef: React.RefObject<HTMLDivElement | null>;
  scrollTargetRef: React.RefObject<ScrollTarget | null>;
  storeRef: React.RefObject<CrtStore>;
  callbacksRef: React.RefObject<GridCallbacks>;
  /** The selection from its ref, pulled back inside the table. */
  getSel: () => GridSelection;
  applySel: (next: GridSelection) => void;
  focusRoot: () => void;
  notice: (message: string, kind?: NoticeKind) => void;
}
