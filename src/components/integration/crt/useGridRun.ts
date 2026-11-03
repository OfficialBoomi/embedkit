/**
 * @file useGridRun.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The single `run(op)` the toolbar, the context menu and the keyboard share. It commits an
 * open cell editor first, refuses edits on a read only table, dispatches to the matching
 * operation and then puts focus back on the grid. Delete is the one exception: it may open a
 * confirm dialog that hands focus back itself.
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
  const { store, callbacksRef, focusRoot } = ctx;
  const { selectAll } = selection;
  const { addRow, insertBlank, duplicate, deleteSelected, moveSelected, clearSelected } = rowOps;
  const { copyWithApi, pasteWithApi } = clipboard;

  const runOp = (op: CrtOp) => {
    commitEditor();
    if (op !== 'copy' && op !== 'select-all' && !store.isEditable()) {
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
    }
    focusRoot();
  };

  return runOp;
}
