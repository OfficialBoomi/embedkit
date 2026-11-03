/**
 * @file CrtGridRow.tsx
 * @component GridRow, GridHeader
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The rows of the lookup table grid: the header row, one virtualized data row, and the text
 * input that opens inside the active cell. A data row is memoized on primitive props only, so
 * moving the active cell redraws two rows, not the whole window. Class strings come from
 * precomputed tables (see gridLayout) so a cell never builds one while rendering.
 *
 * @return {JSX.Element} The rendered row.
 */

import { memo, useCallback, useRef } from 'react';
import { resolveEditKey } from '../../../utils/crt/crtKeymap';
import type { CrtStore } from '../../../utils/crt/crtStore';
import type { EditState, FinishEdit } from './crtGridTypes';
import {
  CELL_CLASS,
  CHECK,
  CHECK_MIXED,
  CHECK_ON,
  GUTTER_CLASS,
  ROW_CLASS,
  type GridLayout,
} from './gridLayout';

/** Longer text gets a native tooltip, since it is probably clipped. */
const TITLE_MIN_LENGTH = 24;

export interface CellEditorProps {
  edit: EditState;
  onFinish: FinishEdit;
}

/** Uncontrolled text input for the active cell. Finishes exactly once. */
const CellEditor: React.FC<CellEditorProps> = ({ edit, onFinish }) => {
  const done = useRef(false);
  const { mode, initial } = edit;

  const setup = useCallback(
    (el: HTMLInputElement | null) => {
      if (!el) return;
      // The grid positions the scroll itself; do not let focus jump it.
      el.focus({ preventScroll: true });
      if (mode === 'select-all') {
        el.select();
      } else {
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
    },
    [mode]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter while an input method is composing text confirms the composition, not the cell.
    if (e.nativeEvent.isComposing) return;
    const action = resolveEditKey(e);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (done.current) return;
    done.current = true;
    if (action.type === 'commit') {
      onFinish(e.currentTarget.value, action.move, true);
    } else {
      onFinish(null, null, true);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (done.current) return;
    done.current = true;
    onFinish(e.currentTarget.value, null, false);
  };

  return (
    <input
      ref={setup}
      type="text"
      name="crt-cell"
      className="boomi-crt-cell-input boomi-input"
      defaultValue={initial}
      aria-label={`Edit ${edit.store.columns[edit.col] ?? 'cell'}, row ${edit.row + 1}`}
      autoComplete="off"
      spellCheck={false}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
};

export interface GridRowProps {
  store: CrtStore;
  layout: GridLayout;
  row: number;
  top: number;
  /** Active column when this is the active row, otherwise -1. */
  activeCol: number;
  activeId: string;
  /** The open editor when it is in this row, otherwise null. */
  edit: EditState | null;
  hasEdits: boolean;
  /** Not read: a changed version defeats the memo so rows redraw after a store change. */
  version: number;
  onFinishEdit: FinishEdit;
  /** The row is ticked in the gutter. */
  rowChecked: boolean;
  /** First and last column of the cell range in this row, or -1 when the row is outside it. */
  selC0: number;
  selC1: number;
  /** The row was inserted or appended since the table was loaded. */
  rowNew: boolean;
}

/** Memoized (primitive props only) so moving the active cell redraws two rows, not the whole window. */
const GridRow = memo(function GridRow({
  store,
  layout,
  row,
  top,
  activeCol,
  activeId,
  edit,
  hasEdits,
  onFinishEdit,
  rowChecked,
  selC0,
  selC1,
  rowNew,
}: GridRowProps) {
  const cells: React.ReactNode[] = [];
  const cols = layout.widths.length;
  for (let c = 0; c < cols; c++) {
    const text = store.getCell(row, c);
    const isActive = c === activeCol;
    const editing = edit !== null && edit.col === c;
    const inSelection = c >= selC0 && c <= selC1;
    const flags =
      (c === 0 ? 1 : 0) |
      (isActive ? 2 : 0) |
      (hasEdits && store.isCellEdited(row, c) ? 4 : 0) |
      (editing ? 8 : 0) |
      (inSelection && !isActive ? 16 : 0);
    cells.push(
      <div
        key={c}
        role="gridcell"
        id={isActive ? activeId : undefined}
        aria-colindex={c + 2}
        aria-selected={isActive || inSelection || rowChecked}
        className={CELL_CLASS[flags]}
        style={layout.styles[c]}
        data-c={c}
        title={!editing && text.length > TITLE_MIN_LENGTH ? text : undefined}
      >
        {editing ? <CellEditor edit={edit} onFinish={onFinishEdit} /> : text}
      </div>
    );
  }
  return (
    <div
      role="row"
      aria-rowindex={row + 2}
      aria-selected={rowChecked || undefined}
      data-r={row}
      className={ROW_CLASS[(row % 2) | (rowChecked ? 2 : 0) | (rowNew ? 4 : 0)]}
      style={{ top, width: layout.total }}
    >
      <div
        role="rowheader"
        aria-colindex={1}
        data-gutter=""
        className={GUTTER_CLASS[(activeCol >= 0 ? 1 : 0) | (rowNew ? 2 : 0)]}
        title={rowNew ? 'New row' : undefined}
      >
        <span
          role="checkbox"
          aria-checked={rowChecked}
          aria-label={`Select row ${row + 1}`}
          data-check=""
          className={rowChecked ? CHECK_ON : CHECK}
        />
        <span className="boomi-crt-rownum">{row + 1}</span>
      </div>
      {cells}
    </div>
  );
});

export interface GridHeaderProps {
  layout: GridLayout;
  columns: readonly string[];
  /** Active column, which gets the header highlight. */
  activeCol: number;
  allChecked: boolean;
  someChecked: boolean;
}

/** The sticky header row: the select all checkbox in the corner, then one cell per column name. */
export const GridHeader: React.FC<GridHeaderProps> = ({
  layout,
  columns,
  activeCol,
  allChecked,
  someChecked,
}) => (
  <div role="row" aria-rowindex={1} className="boomi-crt-header" style={layout.rowStyle}>
    <div role="columnheader" aria-colindex={1} aria-label="Row selection" className="boomi-crt-corner">
      <span
        role="checkbox"
        aria-checked={allChecked ? true : someChecked ? 'mixed' : false}
        aria-label="Select all rows"
        data-checkall=""
        className={allChecked ? CHECK_ON : someChecked ? CHECK_MIXED : CHECK}
      />
    </div>
    {columns.map((name, c) => (
      <div
        key={c}
        role="columnheader"
        aria-colindex={c + 2}
        title={name}
        className={
          'boomi-crt-hcell' +
          (c === 0 ? ' boomi-crt-hcell--frozen' : '') +
          (c === activeCol ? ' boomi-crt-hcell--active' : '')
        }
        style={layout.styles[c]}
      >
        {name}
      </div>
    ))}
  </div>
);

export default GridRow;
