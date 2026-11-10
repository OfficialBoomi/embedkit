/**
 * @file crtShortcuts.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The content of the Keyboard shortcuts window of the cross reference table editor, as plain
 * data: groups of rows, each row the keys of one shortcut and what it does. No React, so a test
 * can read it. The window itself is CrtShortcutsModal.
 *
 * KEEP THIS TABLE CURRENT. When you add, remove or change a key in crtKeymap.ts, the grid key
 * and pointer hooks (useGridKeyboard, useGridPointer, useGridMenu), the find bar (CrtFindBar,
 * crtFindView) or the toolbar, update this table too (the Keyboard shortcuts window); a test
 * fails when a keymap action has no row.
 *
 * Each row may list the action names it documents in `covers`. The test compares those with
 * every action the keymap can return (NAV_ACTION_TYPES and EDIT_ACTION_TYPES in crtKeymap.ts),
 * with the find keys that resolveFindKey returns (FIND_KEY_ACTIONS below) and with the hand
 * kept names (HAND_KEY_ACTIONS below). It also runs the keys of every row that names a keymap
 * action through the real resolvers, so a key that is rebound while its row stays is caught.
 *
 * Documented by hand, check on every change (no test can see a change to these):
 *  - Mouse gestures: Click, Shift+Click, Drag, Double-click, Right-click, the row checkboxes
 *    and the row numbers (useGridPointer, useGridMenu), and the click away from an open cell
 *    that saves it (CrtGridRow).
 *  - Copy, cut and paste: the browser's clipboard events on the grid (useGridClipboard), which
 *    the keymap leaves alone on purpose.
 *  - The keys of the find row itself: Enter and Shift+Enter in the Find box, Enter in the
 *    Replace box and Esc (CrtFindBar). Only the names are guarded, not the keys.
 *  - Esc leaving full screen, and every place where Esc is used first (the screen).
 *  - Toolbar buttons whose tooltip names a key (Undo, Redo, Find, Leave full screen).
 */

import type { CrtFindCommand } from './crtFindView';
import type { EditAction, NavAction } from './crtKeymap';

/** The find keys resolveFindKey can return, named `find-<command>`. */
export type CrtFindKeyAction = `find-${CrtFindCommand}`;

/**
 * One entry per command of resolveFindKey. The compiler checks the record against the command
 * type, so a new find command cannot be added without a name here.
 */
export const FIND_KEY_ACTIONS = {
  'find-open': true,
  'find-next': true,
  'find-prev': true,
} satisfies Record<CrtFindKeyAction, true>;

/**
 * Key actions that no resolver returns, so the test cannot derive them. Each one still needs a
 * row that names it, which keeps a row from being dropped by accident.
 */
export const HAND_KEY_ACTIONS = {
  'clipboard-copy': true,
  'clipboard-cut': true,
  'clipboard-paste': true,
  'find-row-step': true,
  'find-row-replace': true,
  'find-row-close': true,
  'leave-full-screen': true,
} as const;

export type CrtHandKeyAction = keyof typeof HAND_KEY_ACTIONS;

/** Anything a row can name in `covers`. */
export type CrtShortcutAction =
  | NavAction['type']
  | EditAction['type']
  | CrtFindKeyAction
  | CrtHandKeyAction;

export interface CrtShortcutRow {
  /**
   * The ways to do it. Each inner array is one combination pressed together, written as the
   * labels of its keys, for example ['Ctrl', 'Z']. A mouse gesture is a label too ('Click').
   */
  keys: string[][];
  /** What it does, in a short plain sentence. */
  action: string;
  /** The action names this row documents. Rows that only describe the mouse leave it out. */
  covers?: CrtShortcutAction[];
}

export interface CrtShortcutGroup {
  title: string;
  rows: CrtShortcutRow[];
}

/** The same Mac check the toolbar tooltips and the context menu use. */
export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '');

/**
 * The groups, in the order the window shows them. The modifier reads Ctrl, or Cmd on a Mac,
 * where the keymap accepts either (ctrlKey or metaKey).
 */
export function getShortcutGroups(mac: boolean = isMacPlatform()): CrtShortcutGroup[] {
  const mod = mac ? 'Cmd' : 'Ctrl';
  return [
    {
      title: 'Move',
      rows: [
        { keys: [['Arrow keys']], action: 'Move one cell', covers: ['move'] },
        {
          keys: [[mod, 'Arrow keys']],
          action: 'Jump to the first or last row or column',
          covers: ['move'],
        },
        {
          keys: [['Home'], ['End']],
          action: 'Go to the first or last cell of the row',
          covers: ['move'],
        },
        {
          keys: [[mod, 'Home'], [mod, 'End']],
          action: 'Go to the first or last cell of the table',
          covers: ['move'],
        },
        {
          keys: [['Page Up'], ['Page Down']],
          action: 'Move up or down one screen of rows',
          covers: ['move'],
        },
        {
          keys: [['Tab'], ['Shift', 'Tab']],
          action: 'Go to the next or previous cell, wrapping to the next or previous row',
          covers: ['move'],
        },
      ],
    },
    {
      title: 'Select',
      rows: [
        {
          keys: [['Shift', 'Arrow keys']],
          action: 'Extend the selection (Shift also works with Home, End, Page Up and Page Down)',
          covers: ['move'],
        },
        {
          keys: [['Shift', 'Space']],
          action: 'Select the whole row (every row the selection touches)',
          covers: ['select-row'],
        },
        { keys: [[mod, 'A']], action: 'Select every cell', covers: ['select-all'] },
        {
          keys: [['Space']],
          action:
            'Tick or untick the active row. Moving with the keyboard keeps the ticked rows, so rows that are not next to each other can be picked',
          covers: ['tick-row'],
        },
        {
          keys: [['Esc']],
          action: 'Clear the selection and untick the rows, keeping the active cell',
          covers: ['collapse'],
        },
        { keys: [['Click']], action: 'Select a cell' },
        { keys: [['Shift', 'Click']], action: 'Extend the selection to the cell you click' },
        { keys: [['Drag']], action: 'Select a range of cells' },
        {
          keys: [['Row checkbox']],
          action:
            'Tick or untick a row. Shift+click ticks every row from the last ticked one, and the box in the header ticks every row',
        },
        {
          keys: [['Row number']],
          action: `Select only that row. ${mod}+click ticks or unticks it`,
        },
      ],
    },
    {
      title: 'Edit',
      rows: [
        { keys: [['Enter']], action: 'Edit the cell with its text selected', covers: ['edit'] },
        {
          keys: [['F2']],
          action: 'Edit the cell with the cursor at the end',
          covers: ['edit'],
        },
        {
          keys: [['Any character']],
          action:
            'Start editing, with that character replacing the cell. Characters typed with AltGr, or with Option on a Mac, start editing too',
          covers: ['edit'],
        },
        { keys: [['Double-click']], action: 'Edit the cell with the cursor at the end' },
        {
          keys: [['Backspace']],
          action:
            'Empty the cell and start editing. With several cells or rows selected it only empties them',
          covers: ['clear'],
        },
        {
          keys: [['Delete']],
          action: 'Empty the selected cells, or every cell of the ticked rows',
          covers: ['clear'],
        },
        {
          keys: [['Enter'], ['Tab']],
          action: 'In an open cell: save it and move down or right',
          covers: ['commit'],
        },
        {
          keys: [['Shift', 'Enter'], ['Shift', 'Tab']],
          action: 'In an open cell: save it and move up or left',
          covers: ['commit'],
        },
        {
          keys: [['Esc']],
          action: 'In an open cell: cancel and keep the old text. Clicking elsewhere saves it instead',
          covers: ['cancel'],
        },
      ],
    },
    {
      title: 'Rows and clipboard',
      rows: [
        {
          keys: [[mod, 'C']],
          action: 'Copy the selected cells or ticked rows',
          covers: ['clipboard-copy'],
        },
        {
          keys: [[mod, 'X']],
          action: 'Cut the selected cells or ticked rows',
          covers: ['clipboard-cut'],
        },
        { keys: [[mod, 'V']], action: 'Paste at the selection', covers: ['clipboard-paste'] },
        {
          keys: [['Menu'], ['Shift', 'F10'], ['Right-click']],
          action: 'Open the row actions menu (insert, duplicate, move, delete and more)',
          covers: ['context-menu'],
        },
      ],
    },
    {
      title: 'History',
      rows: [
        {
          keys: [[mod, 'Z']],
          action: 'Undo the last change. In an open cell it undoes your typing instead',
          covers: ['undo'],
        },
        { keys: [[mod, 'Y'], [mod, 'Shift', 'Z']], action: 'Redo', covers: ['redo'] },
      ],
    },
    {
      title: 'Find',
      rows: [
        {
          keys: [[mod, 'F']],
          action: 'Open find and replace, or jump to its Find box',
          covers: ['find-open'],
        },
        {
          keys: [['Enter'], ['Shift', 'Enter']],
          action: 'In the Find box: go to the next or previous match',
          covers: ['find-row-step'],
        },
        {
          keys: [['F3'], ['Shift', 'F3']],
          action: 'Go to the next or previous match. When find is closed they open it',
          covers: ['find-next', 'find-prev'],
        },
        {
          keys: [['Enter']],
          action: 'In the Replace box: replace this match and go to the next',
          covers: ['find-row-replace'],
        },
        {
          keys: [['Esc']],
          action: 'In the find row: close it and return to the table',
          covers: ['find-row-close'],
        },
      ],
    },
    {
      title: 'View',
      rows: [
        {
          keys: [['Esc']],
          action:
            'Leave full screen. Esc first closes or cancels whatever is open, or clears a selection',
          covers: ['leave-full-screen'],
        },
      ],
    },
  ];
}
