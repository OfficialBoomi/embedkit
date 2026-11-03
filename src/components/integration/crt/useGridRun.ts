/**
 * @file useGridRun.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The single `run(op)` the toolbar, the context menu and the keyboard share. It commits an
 * open cell editor first, refuses edits on a read only table, dispatches to the matching
 * operation and then puts focus back on the grid. Delete is the one exception: it may open a
 * confirm dialog that hands focus back itself. Undo and Redo are not edits of the grid but of
 * the table's history, so they are never refused: on a read only table there is simply nothing
 * to step through, and they say so.
 */

import type { CrtOp, GridContext } from './crtGridTypes';
import type { GridClipboard } from './useGridClipboard';
import type { GridRowOps } from './useGridRowOps';
import type { GridSelectionOps } from './useGridSelectionOps';

export function useGridRun(
  ctx: GridContext,
  commitEditor: () => void,
  selection: GridSelectionOps,
  rowOps: GridRowOps,
  clipboard: GridClipboard
): (op: CrtOp) => void {
  const { store, callbacksRef, focusRoot, notice } = ctx;
  const { selectAll, selectRegion } = selection;
  const { addRow, insertBlank, duplicate, deleteSelected, moveSelected, clearSelected } = rowOps;
  const { copyWithApi, pasteWithApi } = clipboard;

  /** Steps the table's history one step, says what happened and shows the rows it touched. */
  const stepHistory = (undoing: boolean) => {
    const result = undoing ? store.undo() : store.redo();
    if (!result) {
      notice(undoing ? 'Nothing to undo' : 'Nothing to redo');
      return;
    }
    notice(`${undoing ? 'Undid' : 'Redid'}: ${result.label}`);
    selectRegion(result.region);
  };

  const runOp = (op: CrtOp) => {
    // The editor is committed first, so Undo reverts that commit and no stale editor stays open.
    commitEditor();
    const neverBlocked = op === 'copy' || op === 'select-all' || op === 'undo' || op === 'redo';
    if (!neverBlocked && !store.isEditable()) {
      callbacksRef.current.onBlocked?.();
      focusRoot();
      return;
    }
    switch (op) {
      case 'add-row':
        addRow();
        break;
      case 'insert-above':
        insertBlank('above');
        break;
      case 'insert-below':
        insertBlank('below');
        break;
      case 'duplicate':
        duplicate();
        break;
      case 'delete':
        // It may open a confirm dialog and hands focus back itself when done. Taking focus
        // here would put it in the grid under the dialog, and Esc could not close the dialog.
        void deleteSelected();
        return;
      case 'move-up':
        moveSelected(-1);
        break;
      case 'move-down':
        moveSelected(1);
        break;
      case 'cut':
        void copyWithApi(true);
        break;
      case 'copy':
        void copyWithApi(false);
        break;
      case 'paste':
        void pasteWithApi('paste');
        break;
      case 'paste-above':
        void pasteWithApi('above');
        break;
      case 'paste-below':
        void pasteWithApi('below');
        break;
      case 'clear':
        clearSelected();
        break;
      case 'select-all':
        selectAll();
        break;
      case 'undo':
        stepHistory(true);
        break;
      case 'redo':
        stepHistory(false);
        break;
    }
    focusRoot();
  };

  return runOp;
}
