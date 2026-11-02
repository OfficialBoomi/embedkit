/**
 * @file CrtToolbar.tsx
 * @component CrtToolbar
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The row and clipboard actions of the lookup table grid, as labelled buttons above the
 * grid. The toolbar holds no state: the grid reports what is possible through `info` and
 * the toolbar only asks the grid to run an operation. The same enabled rules drive the
 * grid's context menu (see isOpEnabled), so the two never disagree.
 *
 * A mouse press on a button must not take focus away from the grid, or the selection the
 * action is about to use would visually collapse before the click lands.
 *
 * @return {JSX.Element} The rendered toolbar.
 */

import type { ReactNode } from 'react';
import {
  AiOutlineArrowDown,
  AiOutlineArrowUp,
  AiOutlineCopy,
  AiOutlineDelete,
  AiOutlineDiff,
  AiOutlineInsertRowAbove,
  AiOutlineInsertRowBelow,
  AiOutlinePlus,
  AiOutlineScissor,
  AiOutlineSnippets,
  AiOutlineVerticalAlignBottom,
  AiOutlineVerticalAlignTop,
} from 'react-icons/ai';
import { CRT_MAX_ROWS } from '../../../utils/crt/crtStore';
import type { CrtGridInfo, CrtOp } from './CrtGrid';

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

/** Keeps focus where it is (the grid) when a button is pressed with the mouse. */
const keepFocus = (e: React.MouseEvent<HTMLElement>) => e.preventDefault();

export interface CrtToolbarProps {
  info: CrtGridInfo | null;
  onRun: (op: CrtOp) => void;
}

const CrtToolbar: React.FC<CrtToolbarProps> = ({ info, onRun }) => {
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

  return (
    <div className="boomi-crt-tools" role="toolbar" aria-label="Table actions" onMouseDown={keepFocus}>
      {renderGroup('Rows', ROW_TOOLS)}
      {renderGroup('Clipboard', CLIPBOARD_TOOLS)}
      <span className="boomi-crt-tools-selection">{info?.selectionLabel ?? ''}</span>
    </div>
  );
};

CrtToolbar.displayName = 'CrtToolbar';
export default CrtToolbar;
