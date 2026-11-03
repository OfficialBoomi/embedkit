/**
 * @file gridInfo.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * What the toolbar needs to know about the lookup table grid, worked out from the current
 * selection and the store: the selection label, whether editing is possible, how many rows
 * are ticked or targeted and whether the targeted rows can move. A pure function; CrtGrid
 * memoizes it and reports the result through `onInfo`.
 */

import { describeSelection, targetRows } from '../../../utils/crt/crtSelection';
import { selectionRange, type GridSelection } from '../../../utils/crt/crtGridSelection';
import { CRT_MAX_ROWS, type CrtStore } from '../../../utils/crt/crtStore';
import type { CrtGridInfo } from './crtGridTypes';

export function computeGridInfo(
  cur: GridSelection,
  store: CrtStore,
  editable: boolean,
  rowCount: number
): CrtGridInfo {
  const range = rowCount > 0 ? selectionRange(cur) : null;
  const t = range ? targetRows(cur.checked, range, cur.active.row) : [];
  return {
    selectionLabel: describeSelection(cur.checked, range, store.columns),
    canEdit: editable,
    hasRows: rowCount > 0,
    checkedCount: cur.checked.length,
    targetCount: t.length,
    canMoveUp: editable && t.length > 0 && t[0] > 0,
    canMoveDown: editable && t.length > 0 && t[t.length - 1] < rowCount - 1,
    atMaxRows: rowCount >= CRT_MAX_ROWS,
    rowCount,
  };
}
