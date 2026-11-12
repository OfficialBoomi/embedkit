/**
 * @file CrtToolbar.tsx
 * @component CrtToolbar
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The row and clipboard actions of the lookup table grid, as labelled buttons above the
 * grid. The toolbar holds no table state: the grid reports what is possible through `info` and
 * the toolbar only asks the grid to run an operation. The same enabled rules drive the
 * grid's context menu (see isOpEnabled), so the two never disagree. The one thing it keeps is
 * whether the Keyboard shortcuts window is open.
 *
 * A mouse press on a button must not take focus away from the grid, or the selection the
 * action is about to use would visually collapse before the click lands.
 *
 * The second row starts with the History group (Undo, Redo). Its tooltips name the step they
 * would undo or redo, taken from the grid's report.
 *
 * Find: when the screen gives it a `find` object, the second row ends with a Find button next to
 * Full screen, and while find is open the find and replace row (CrtFindBar) is the third line.
 * Ctrl or Cmd+F, F3 and Shift+F3 pressed on a toolbar button go to the screen's find, the same
 * keys the grid handles itself. Presses on the find boxes are not kept from taking focus; every
 * other press in the toolbar is.
 *
 * Help: the far end of the second row has a small, muted, icon-only Keyboard shortcuts button
 * that opens CrtShortcutsModal. It is for first time use, so it stays quiet until hovered or
 * focused. The window is rendered next to the toolbar, not inside it, so the toolbar's focus
 * keeping and find keys never see what happens in the window. The tooltips here that name a key
 * (Undo, Redo, Find, Full screen) repeat what crtShortcuts lists: change both together.
 *
 * @return {JSX.Element} The rendered toolbar.
 */

import { useRef, useState, type ReactNode } from 'react';
import {
  AiOutlineArrowDown,
  AiOutlineArrowUp,
  AiOutlineCopy,
  AiOutlineDelete,
  AiOutlineDiff,
  AiOutlineFullscreen,
  AiOutlineFullscreenExit,
  AiOutlineInsertRowAbove,
  AiOutlineInsertRowBelow,
  AiOutlinePlus,
  AiOutlineQuestionCircle,
  AiOutlineRedo,
  AiOutlineScissor,
  AiOutlineSearch,
  AiOutlineSnippets,
  AiOutlineUndo,
  AiOutlineVerticalAlignBottom,
  AiOutlineVerticalAlignTop,
} from 'react-icons/ai';
import { resolveFindKey, type CrtFindCommand } from '../../../utils/crt/crtFindView';
import { isMacPlatform } from '../../../utils/crt/crtShortcuts';
import { CRT_MAX_ROWS } from '../../../utils/crt/crtStore';
import type { CrtGridInfo, CrtOp } from './CrtGrid';
import CrtShortcutsModal from './CrtShortcutsModal';

/** One wording for the row limit, in the toolbar tooltips and in the grid's notices. */
export const MAX_ROWS_MESSAGE = `A table can hold at most ${CRT_MAX_ROWS.toLocaleString('en-US')} rows.`;

/** Operations that add rows, which the row limit turns off. */
const GROWS_TABLE: ReadonlySet<CrtOp> = new Set<CrtOp>([
  'add-row',
  'insert-above',
  'insert-below',
  'duplicate',
  'paste-above',
  'paste-below',
]);

/**
 * Whether an operation can run right now. `info` null (no grid yet) disables everything.
 * Insert above and below and Duplicate need a row to work from, so an empty table offers
 * Add row and the paste actions instead.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function isOpEnabled(op: CrtOp, info: CrtGridInfo | null): boolean {
  if (!info) return false;
  const { canEdit, hasRows, atMaxRows } = info;
  switch (op) {
    case 'add-row':
    case 'paste-above':
    case 'paste-below':
      return canEdit && !atMaxRows;
    case 'insert-above':
    case 'insert-below':
    case 'duplicate':
      return canEdit && hasRows && !atMaxRows;
    case 'delete':
    case 'cut':
    case 'clear':
      return canEdit && hasRows;
    case 'move-up':
      return info.canMoveUp;
    case 'move-down':
      return info.canMoveDown;
    case 'copy':
    case 'select-all':
      return hasRows;
    case 'paste':
      return canEdit;
    case 'undo':
      return info.canUndo;
    case 'redo':
      return info.canRedo;
  }
}

interface ToolDef {
  op: CrtOp;
  label: string;
  title: string;
  icon: ReactNode;
}

const ROW_TOOLS: ToolDef[] = [
  { op: 'add-row', label: 'Add row', title: 'Add a blank row at the end', icon: <AiOutlinePlus /> },
  {
    op: 'insert-above',
    label: 'Insert above',
    title: 'Insert blank rows above the selection',
    icon: <AiOutlineInsertRowAbove />,
  },
  {
    op: 'insert-below',
    label: 'Insert below',
    title: 'Insert blank rows below the selection',
    icon: <AiOutlineInsertRowBelow />,
  },
  {
    op: 'duplicate',
    label: 'Duplicate',
    title: 'Duplicate the selected rows below themselves',
    icon: <AiOutlineDiff />,
  },
  {
    op: 'move-up',
    label: 'Move up',
    title: 'Move the selected rows up one place (the order of rows matters)',
    icon: <AiOutlineArrowUp />,
  },
  {
    op: 'move-down',
    label: 'Move down',
    title: 'Move the selected rows down one place (the order of rows matters)',
    icon: <AiOutlineArrowDown />,
  },
  { op: 'delete', label: 'Delete', title: 'Delete the selected rows', icon: <AiOutlineDelete /> },
];

const CLIPBOARD_TOOLS: ToolDef[] = [
  { op: 'cut', label: 'Cut', title: 'Cut the selection', icon: <AiOutlineScissor /> },
  { op: 'copy', label: 'Copy', title: 'Copy the selection', icon: <AiOutlineCopy /> },
  { op: 'paste', label: 'Paste', title: 'Paste at the selection', icon: <AiOutlineSnippets /> },
  {
    op: 'paste-above',
    label: 'Paste above',
    title: 'Paste the copied rows as new rows above the selection',
    icon: <AiOutlineVerticalAlignTop />,
  },
  {
    op: 'paste-below',
    label: 'Paste below',
    title: 'Paste the copied rows as new rows below the selection',
    icon: <AiOutlineVerticalAlignBottom />,
  },
];

/** The modifier text of the shortcuts in tooltips, picked the way the context menu picks it. */
const modifierText = (): string => (isMacPlatform() ? '\u2318' : 'Ctrl+');

/** Undo and Redo, whose tooltips name the step and the shortcut, or say there is nothing to do. */
function historyTools(info: CrtGridInfo | null): ToolDef[] {
  const mod = modifierText();
  return [
    {
      op: 'undo',
      label: 'Undo',
      title: info?.canUndo ? `Undo: ${info.undoLabel ?? 'last change'} (${mod}Z)` : 'Nothing to undo',
      icon: <AiOutlineUndo />,
    },
    {
      op: 'redo',
      label: 'Redo',
      title: info?.canRedo ? `Redo: ${info.redoLabel ?? 'last undone change'} (${mod}Y)` : 'Nothing to redo',
      icon: <AiOutlineRedo />,
    },
  ];
}

/**
 * Keeps focus where it is (the grid, or a find box) when a button is pressed with the mouse. The
 * find boxes themselves need the press, to take focus and place the caret.
 */
const keepFocus = (e: React.MouseEvent<HTMLElement>) => {
  if ((e.target as HTMLElement).closest('input')) return;
  e.preventDefault();
};

/** What the toolbar needs from the screen's find and replace. */
export interface CrtToolbarFind {
  open: boolean;
  /** The Find button: opens the row, or closes it. */
  onToggle: () => void;
  /** A find key pressed on a toolbar button. */
  onCommand: (command: CrtFindCommand) => void;
  /** The find and replace row, shown as the third line while `open`. */
  bar: ReactNode;
}

export interface CrtToolbarProps {
  info: CrtGridInfo | null;
  onRun: (op: CrtOp) => void;
  /** Shown at the right end of the first row, for example the Override button. */
  trailing?: ReactNode;
  /** When both are given, the second row ends with a Full screen / Exit full screen button. */
  fullScreen?: boolean;
  onToggleFullScreen?: () => void;
  /** When given, the second row has a Find button and the find row can show as a third line. */
  find?: CrtToolbarFind;
}

const CrtToolbar: React.FC<CrtToolbarProps> = ({
  info,
  onRun,
  trailing,
  fullScreen = false,
  onToggleFullScreen,
  find,
}) => {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /** The table next to the toolbar, where focus goes back when the shortcuts window closes and its opener is gone. */
  const findGrid = (): HTMLElement | null =>
    rootRef.current?.parentElement?.querySelector<HTMLElement>('[role="grid"]') ?? null;

  const renderGroup = (name: string, tools: ToolDef[]) => (
    <div className="boomi-crt-tools-group" role="group" aria-label={name}>
      {tools.map((tool) => (
        <button
          key={tool.op}
          type="button"
          className="boomi-crt-tool"
          title={info?.atMaxRows && info.canEdit && GROWS_TABLE.has(tool.op) ? MAX_ROWS_MESSAGE : tool.title}
          aria-label={tool.label}
          disabled={!isOpEnabled(tool.op, info)}
          onClick={() => onRun(tool.op)}
        >
          <span className="boomi-crt-tool-icon" aria-hidden="true">
            {tool.icon}
          </span>
          <span>{tool.label}</span>
        </button>
      ))}
    </div>
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!find) return;
    const command = resolveFindKey(e);
    if (!command) return;
    e.preventDefault();
    e.stopPropagation();
    find.onCommand(command);
  };

  return (
    <>
      <div
        ref={rootRef}
        className="boomi-crt-tools"
        role="toolbar"
        aria-label="Table actions"
        onMouseDown={keepFocus}
        onKeyDown={handleKeyDown}
      >
        <div className="boomi-crt-tools-line">
          {renderGroup('Rows', ROW_TOOLS)}
          {trailing && <div className="boomi-crt-tools-trailing">{trailing}</div>}
        </div>
        <div className="boomi-crt-tools-line">
          {renderGroup('History', historyTools(info))}
          {renderGroup('Clipboard', CLIPBOARD_TOOLS)}
          <span className="boomi-crt-tools-selection">{info?.selectionLabel ?? ''}</span>
          {find && (
            <button
              type="button"
              className="boomi-crt-tool"
              title={`Find and replace (${modifierText()}F)`}
              aria-pressed={find.open}
              onClick={find.onToggle}
            >
              <span className="boomi-crt-tool-icon" aria-hidden="true">
                <AiOutlineSearch />
              </span>
              <span>Find</span>
            </button>
          )}
          {onToggleFullScreen && (
            <button
              type="button"
              className="boomi-crt-tool boomi-crt-tool--edge"
              title={fullScreen ? 'Leave full screen (Esc)' : 'Fill the screen with the toolbar and the table'}
              aria-pressed={fullScreen}
              onClick={onToggleFullScreen}
            >
              <span className="boomi-crt-tool-icon" aria-hidden="true">
                {fullScreen ? <AiOutlineFullscreenExit /> : <AiOutlineFullscreen />}
              </span>
              <span>{fullScreen ? 'Exit full screen' : 'Full screen'}</span>
            </button>
          )}
          {/* Last and quiet: icon only, muted until hovered or focused. The wrapper only gives it its own spacing at the end of the row. */}
          <span className="boomi-crt-tools-help">
            <button
              type="button"
              className="boomi-crt-shortcuts-btn"
              title="Keyboard shortcuts"
              aria-label="Keyboard shortcuts"
              aria-haspopup="dialog"
              onClick={() => setShortcutsOpen(true)}
            >
              <AiOutlineQuestionCircle aria-hidden="true" />
            </button>
          </span>
        </div>
        {find?.open && find.bar}
      </div>
      <CrtShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        fallbackFocus={findGrid}
      />
    </>
  );
};

CrtToolbar.displayName = 'CrtToolbar';
export default CrtToolbar;
