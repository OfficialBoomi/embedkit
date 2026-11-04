/**
 * @file crtShortcuts.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Guards the data behind the Keyboard shortcuts window so it cannot drift from the editor:
 * the shape of the table, the Ctrl or Cmd text, rows pinned to the real key resolvers, and the
 * rule that every action the keymap can return (plus the find keys and the hand kept names)
 * has a row. If a test here fails because a key changed or a new action was added, the fix is
 * in crtShortcuts.ts, not in this file.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFindKey } from '../../utils/crt/crtFindView';
import {
  EDIT_ACTION_TYPES,
  NAV_ACTION_TYPES,
  resolveEditKey,
  resolveNavKey,
  type KeyInput,
  type NavContext,
} from '../../utils/crt/crtKeymap';
import {
  FIND_KEY_ACTIONS,
  getShortcutGroups,
  HAND_KEY_ACTIONS,
  isMacPlatform,
  type CrtShortcutGroup,
  type CrtShortcutRow,
} from '../../utils/crt/crtShortcuts';

afterEach(() => {
  vi.restoreAllMocks();
});

const EXPECTED_TITLES = ['Move', 'Select', 'Edit', 'Rows and clipboard', 'History', 'Find', 'View'];

const allRows = (groups: CrtShortcutGroup[]): CrtShortcutRow[] => groups.flatMap((g) => g.rows);

describe('getShortcutGroups: shape', () => {
  it('lists the groups in the agreed order', () => {
    expect(getShortcutGroups(false).map((g) => g.title)).toEqual(EXPECTED_TITLES);
  });

  it.each([false, true])('every group has a title and rows, every row has keys and an action (mac: %s)', (mac) => {
    for (const group of getShortcutGroups(mac)) {
      expect(group.title.trim().length, 'a group needs a title').toBeGreaterThan(0);
      expect(group.rows.length, `group '${group.title}' needs rows`).toBeGreaterThan(0);
      for (const row of group.rows) {
        const where = `'${group.title}' row '${row.action}'`;
        expect(row.action.trim().length, `${where} needs an action`).toBeGreaterThan(0);
        expect(row.keys.length, `${where} needs keys`).toBeGreaterThan(0);
        for (const combo of row.keys) {
          expect(combo.length, `${where} has an empty key combination`).toBeGreaterThan(0);
          for (const label of combo) {
            expect(label.trim().length, `${where} has an empty key label`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('has no empty group, no duplicate group and no duplicate row in a group', () => {
    const groups = getShortcutGroups(false);
    expect(new Set(groups.map((g) => g.title)).size).toBe(groups.length);
    for (const group of groups) {
      const lines = group.rows.map((r) => `${JSON.stringify(r.keys)} ${r.action}`);
      expect(new Set(lines).size, `'${group.title}' repeats a row`).toBe(lines.length);
    }
  });

  it('writes no em dash and no ticket-like text', () => {
    const text = JSON.stringify(getShortcutGroups(false));
    expect(text).not.toContain(String.fromCharCode(0x2014));
    // Anything shaped like a tracker key (letters, a hyphen, digits).
    expect(text).not.toMatch(/\b[A-Z]{2,}-\d+\b/);
  });

  it('names only actions that exist in `covers`', () => {
    const known = new Set<string>([
      ...Object.keys(NAV_ACTION_TYPES),
      ...Object.keys(EDIT_ACTION_TYPES),
      ...Object.keys(FIND_KEY_ACTIONS),
      ...Object.keys(HAND_KEY_ACTIONS),
    ]);
    for (const row of allRows(getShortcutGroups(false))) {
      for (const name of row.covers ?? []) {
        expect(known.has(name), `row '${row.action}' covers '${name}', which is not an action name`).toBe(true);
      }
    }
  });
});

describe('getShortcutGroups: the modifier follows the platform', () => {
  const labels = (mac: boolean): Set<string> =>
    new Set(allRows(getShortcutGroups(mac)).flatMap((r) => r.keys.flat()));
  const actions = (mac: boolean): string => allRows(getShortcutGroups(mac)).map((r) => r.action).join('\n');

  it('shows Ctrl on other platforms and never Cmd', () => {
    expect(labels(false).has('Ctrl')).toBe(true);
    expect(labels(false).has('Cmd')).toBe(false);
    expect(actions(false)).not.toContain('Cmd');
  });

  it('shows Cmd on a Mac and never Ctrl', () => {
    expect(labels(true).has('Cmd')).toBe(true);
    expect(labels(true).has('Ctrl')).toBe(false);
    expect(actions(true)).not.toContain('Ctrl');
  });

  it('has the same rows on both, only the modifier differs', () => {
    const strip = (mac: boolean) =>
      allRows(getShortcutGroups(mac)).map((r) => ({ covers: r.covers, n: r.keys.map((c) => c.length) }));
    expect(strip(true)).toEqual(strip(false));
  });

  it('picks the platform with the same test the toolbar and the context menu use', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(isMacPlatform()).toBe(true);
    expect(getShortcutGroups().flatMap((g) => g.rows.flatMap((r) => r.keys.flat()))).toContain('Cmd');
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    expect(isMacPlatform()).toBe(false);
    expect(getShortcutGroups().flatMap((g) => g.rows.flatMap((r) => r.keys.flat()))).toContain('Ctrl');
  });
});

// ---------- Pinning rows to the real resolvers ----------

/** Key labels the table may use, and the key names the resolvers know them by. */
const NAMED_KEYS: Record<string, string[]> = {
  Enter: ['Enter'],
  Tab: ['Tab'],
  Esc: ['Escape'],
  Space: [' '],
  Home: ['Home'],
  End: ['End'],
  'Page Up': ['PageUp'],
  'Page Down': ['PageDown'],
  Delete: ['Delete'],
  Backspace: ['Backspace'],
  F2: ['F2'],
  F3: ['F3'],
  F10: ['F10'],
  Menu: ['ContextMenu'],
  'Arrow keys': ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
};

/** Labels that describe the mouse or free typing. They cannot be pressed in a test. */
const GESTURES = new Set(['Click', 'Drag', 'Double-click', 'Right-click', 'Row checkbox', 'Row number', 'Any character']);

/** The key presses of one combination, or null when it is a gesture. Throws on a label nobody knows. */
function toKeyInputs(combo: string[]): KeyInput[] | null {
  const mods: Pick<KeyInput, 'ctrlKey' | 'metaKey' | 'shiftKey'> = {};
  let keys: string[] | null = null;
  for (const label of combo) {
    if (label === 'Ctrl') mods.ctrlKey = true;
    else if (label === 'Cmd') mods.metaKey = true;
    else if (label === 'Shift') mods.shiftKey = true;
    else if (NAMED_KEYS[label]) keys = NAMED_KEYS[label];
    else if (/^[A-Z]$/.test(label)) keys = [label.toLowerCase()];
    else if (GESTURES.has(label)) return null;
    else throw new Error(`crtShortcuts uses the key label '${label}', which this test does not know: add it to NAMED_KEYS or GESTURES`);
  }
  return keys ? keys.map((key) => ({ key, ...mods })) : null;
}

/** An editable table with a selection, so the keys that only act then (Escape) resolve. */
const NAV_CTX: NavContext = {
  row: 5,
  col: 3,
  rowCount: 20,
  colCount: 10,
  pageRows: 10,
  editable: true,
  hasSelection: true,
};

const isNavAction = (name: string): boolean => name in NAV_ACTION_TYPES;
const isEditAction = (name: string): boolean => name in EDIT_ACTION_TYPES;
const isFindAction = (name: string): boolean => name in FIND_KEY_ACTIONS;

/** What the real resolver for this row's actions returns for a key, or undefined when no resolver applies. */
function resolveForRow(row: CrtShortcutRow, key: KeyInput): string | null | undefined {
  const covers = row.covers ?? [];
  if (covers.some(isNavAction)) return resolveNavKey(key, NAV_CTX)?.type ?? null;
  if (covers.some(isEditAction)) return resolveEditKey(key)?.type ?? null;
  if (covers.some(isFindAction)) {
    const command = resolveFindKey(key);
    return command ? `find-${command}` : null;
  }
  return undefined;
}

/** Every combination of every row that names a keymap or find action, with what the resolver says. */
function pinned(groups: CrtShortcutGroup[]) {
  const out: Array<{ row: CrtShortcutRow; combo: string[]; key: KeyInput; got: string | null }> = [];
  for (const row of allRows(groups)) {
    for (const combo of row.keys) {
      const inputs = toKeyInputs(combo);
      if (!inputs) continue;
      for (const key of inputs) {
        const got = resolveForRow(row, key);
        if (got !== undefined) out.push({ row, combo, key, got });
      }
    }
  }
  return out;
}

const rowCovering = (groups: CrtShortcutGroup[], name: string): CrtShortcutRow => {
  const row = allRows(groups).find((r) => r.covers?.includes(name as never));
  if (!row) throw new Error(`no row covers '${name}'`);
  return row;
};

/** One message per key of a pinned row that no longer resolves to one of the row's actions. */
function mismatches(groups: CrtShortcutGroup[]): string[] {
  const out: string[] = [];
  for (const { row, combo, got } of pinned(groups)) {
    const covers: string[] = row.covers ?? [];
    if (got === null || !covers.includes(got)) {
      out.push(
        `'${combo.join('+')}' in the row '${row.action}' resolves to ${JSON.stringify(got)}, not one of ${JSON.stringify(covers)}: fix the keys or the row in crtShortcuts.ts`
      );
    }
  }
  return out;
}

describe('rows are pinned to the key resolvers', () => {
  it.each([false, true])('every key of a row that names a keymap or find action resolves to it (mac: %s)', (mac) => {
    const groups = getShortcutGroups(mac);
    // A parser that quietly skipped everything would pass; this keeps it honest.
    expect(pinned(groups).length).toBeGreaterThan(30);
    expect(mismatches(groups)).toEqual([]);
  });

  it('catches a row whose key was changed while the row stayed', () => {
    const groups = getShortcutGroups(false);
    const rebound = groups.map((g) => ({
      ...g,
      rows: g.rows.map((r) => (r.covers?.includes('tick-row') ? { ...r, keys: [['Enter']] } : r)),
    }));
    const found = mismatches(rebound);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("'Enter'");
    expect(found[0]).toContain('tick-row');
  });

  it('the keys listed for tick row are Space alone, and they tick', () => {
    const row = rowCovering(getShortcutGroups(false), 'tick-row');
    expect(row.keys).toEqual([['Space']]);
    expect(resolveNavKey({ key: ' ' }, NAV_CTX)).toEqual({ type: 'tick-row' });
  });

  it('the keys listed for undo and redo really are undo and redo', () => {
    for (const mac of [false, true]) {
      const mod = mac ? 'Cmd' : 'Ctrl';
      const groups = getShortcutGroups(mac);
      expect(rowCovering(groups, 'undo').keys).toEqual([[mod, 'Z']]);
      expect(rowCovering(groups, 'redo').keys).toEqual([[mod, 'Y'], [mod, 'Shift', 'Z']]);
    }
    for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
      expect(resolveNavKey({ key: 'z', ...mod }, NAV_CTX)).toEqual({ type: 'undo' });
      expect(resolveNavKey({ key: 'y', ...mod }, NAV_CTX)).toEqual({ type: 'redo' });
      expect(resolveNavKey({ key: 'z', shiftKey: true, ...mod }, NAV_CTX)).toEqual({ type: 'redo' });
    }
  });

  it('select row, select all and the menu keys are the ones listed', () => {
    const groups = getShortcutGroups(false);
    expect(rowCovering(groups, 'select-row').keys).toEqual([['Shift', 'Space']]);
    expect(rowCovering(groups, 'select-all').keys).toEqual([['Ctrl', 'A']]);
    expect(rowCovering(groups, 'context-menu').keys.slice(0, 2)).toEqual([['Menu'], ['Shift', 'F10']]);
  });

  it('typing a character starts an edit that replaces the cell, as the Edit group says', () => {
    expect(resolveNavKey({ key: 'a' }, NAV_CTX)).toEqual({ type: 'edit', mode: 'replace', char: 'a' });
    // A plain space is a tick now, so it must not be offered as a way to start typing.
    expect(resolveNavKey({ key: ' ' }, NAV_CTX)).toEqual({ type: 'tick-row' });
  });

  it('Shift with the move keys extends, which is what the Select group says', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']) {
      expect(resolveNavKey({ key, shiftKey: true }, NAV_CTX)).toMatchObject({ type: 'move', extend: true });
    }
  });

  it('copy, cut and paste are the browser clipboard events: the keymap leaves them alone', () => {
    for (const key of ['c', 'x', 'v']) {
      expect(resolveNavKey({ key, ctrlKey: true }, NAV_CTX)).toBeNull();
      expect(resolveNavKey({ key, metaKey: true }, NAV_CTX)).toBeNull();
    }
  });

  it('only labels the test knows are used, so a typo in a label is caught', () => {
    for (const mac of [false, true]) {
      for (const row of allRows(getShortcutGroups(mac))) {
        for (const combo of row.keys) expect(() => toKeyInputs(combo)).not.toThrow();
      }
    }
  });
});

// ---------- The table must stay current ----------

/** Key presses that between them reach every action type of resolveNavKey. */
const NAV_SAMPLES: Array<{ key: KeyInput; ctx?: Partial<NavContext> }> = [
  { key: { key: 'ArrowDown' } },
  { key: { key: 'ArrowRight', shiftKey: true } },
  { key: { key: 'Home', ctrlKey: true } },
  { key: { key: 'PageDown' } },
  { key: { key: 'Tab' } },
  { key: { key: 'Enter' } },
  { key: { key: 'F2' } },
  { key: { key: 'a' } },
  { key: { key: 'Delete' } },
  { key: { key: 'Backspace' } },
  { key: { key: 'Enter' }, ctx: { editable: false } },
  { key: { key: 'a', ctrlKey: true } },
  { key: { key: ' ', shiftKey: true } },
  { key: { key: ' ' } },
  { key: { key: 'z', ctrlKey: true } },
  { key: { key: 'y', metaKey: true } },
  { key: { key: 'Escape' }, ctx: { hasSelection: true } },
  { key: { key: 'ContextMenu' } },
  { key: { key: 'F10', shiftKey: true } },
];

/** The same for resolveEditKey. */
const EDIT_SAMPLES: KeyInput[] = [
  { key: 'Enter' },
  { key: 'Enter', shiftKey: true },
  { key: 'Tab' },
  { key: 'Tab', shiftKey: true },
  { key: 'Escape' },
];

/** The same for resolveFindKey. */
const FIND_SAMPLES: KeyInput[] = [
  { key: 'f', ctrlKey: true },
  { key: 'f', metaKey: true },
  { key: 'F3' },
  { key: 'F3', shiftKey: true },
];

/**
 * Actions that are intentionally not in the table. Keep this short. Anything else the keymap
 * can return needs a row that names it in `covers`.
 *  - 'blocked' is the grid saying "Press Override to edit" when an editing key meets a table
 *    that cannot be edited. It is a message, not a key.
 * 'collapse' is NOT here: the Esc row of the Select group documents it.
 */
const UNDOCUMENTED_ON_PURPOSE: readonly string[] = ['blocked'];

const ALL_ACTIONS: string[] = [
  ...Object.keys(NAV_ACTION_TYPES),
  ...Object.keys(EDIT_ACTION_TYPES),
  ...Object.keys(FIND_KEY_ACTIONS),
  ...Object.keys(HAND_KEY_ACTIONS),
];

/** One message per action that has no row and is not on the allow list. */
function problems(groups: CrtShortcutGroup[]): string[] {
  const documented = new Set<string>(allRows(groups).flatMap((r) => r.covers ?? []));
  return ALL_ACTIONS.filter((a) => !UNDOCUMENTED_ON_PURPOSE.includes(a) && !documented.has(a)).map(
    (a) => `add or update a row in crtShortcuts.ts for '${a}'`
  );
}

describe('the keymap and the shortcuts table stay in step', () => {
  it('the sample key presses reach every action type the keymap lists, and nothing it does not list', () => {
    const reached = new Set<string>();
    for (const { key, ctx } of NAV_SAMPLES) {
      const action = resolveNavKey(key, { ...NAV_CTX, hasSelection: false, ...ctx });
      if (action) reached.add(action.type);
    }
    for (const key of EDIT_SAMPLES) {
      const action = resolveEditKey(key);
      if (action) reached.add(action.type);
    }
    for (const type of [...Object.keys(NAV_ACTION_TYPES), ...Object.keys(EDIT_ACTION_TYPES)]) {
      expect(reached.has(type), `no sample key press reaches the keymap action '${type}': add one to the samples in this test`).toBe(true);
    }
    for (const type of reached) {
      expect(type in NAV_ACTION_TYPES || type in EDIT_ACTION_TYPES, `the keymap returned '${type}', which NAV_ACTION_TYPES and EDIT_ACTION_TYPES do not list`).toBe(true);
    }
  });

  it('the sample find presses reach every find key action', () => {
    const reached = new Set(
      FIND_SAMPLES.map((k) => resolveFindKey(k)).map((c) => (c ? `find-${c}` : null))
    );
    for (const name of Object.keys(FIND_KEY_ACTIONS)) {
      expect(reached.has(name), `no sample key press reaches '${name}': add one to FIND_SAMPLES`).toBe(true);
    }
    expect([...reached].filter((n) => n !== null).every((n) => n in FIND_KEY_ACTIONS)).toBe(true);
  });

  it.each([false, true])('every action has a row that covers it, or is allowed to have none (mac: %s)', (mac) => {
    expect(problems(getShortcutGroups(mac))).toEqual([]);
  });

  it('says what to do when an action has no row', () => {
    const groups = getShortcutGroups(false);
    const without = (name: string): CrtShortcutGroup[] =>
      groups.map((g) => ({ ...g, rows: g.rows.filter((r) => !r.covers?.includes(name as never)) }));
    expect(problems(without('undo'))).toEqual(["add or update a row in crtShortcuts.ts for 'undo'"]);
    expect(problems(without('tick-row'))).toEqual(["add or update a row in crtShortcuts.ts for 'tick-row'"]);
    // F3 and Shift+F3 share one row, so dropping it leaves both find commands without one.
    expect(problems(without('find-next'))).toEqual([
      "add or update a row in crtShortcuts.ts for 'find-next'",
      "add or update a row in crtShortcuts.ts for 'find-prev'",
    ]);
    expect(problems(without('commit'))).toEqual(["add or update a row in crtShortcuts.ts for 'commit'"]);
    expect(problems(without('leave-full-screen'))).toEqual([
      "add or update a row in crtShortcuts.ts for 'leave-full-screen'",
    ]);
  });

  it('keeps the allow list short and made of real actions', () => {
    expect(UNDOCUMENTED_ON_PURPOSE.length).toBeLessThanOrEqual(3);
    for (const name of UNDOCUMENTED_ON_PURPOSE) expect(ALL_ACTIONS).toContain(name);
    // Esc collapsing a selection is documented, not allowed to go without.
    expect(UNDOCUMENTED_ON_PURPOSE).not.toContain('collapse');
  });

  it('documents Esc under Select, Edit, Find and View', () => {
    const groups = getShortcutGroups(false);
    for (const [title, action] of [
      ['Select', 'collapse'],
      ['Edit', 'cancel'],
      ['Find', 'find-row-close'],
      ['View', 'leave-full-screen'],
    ] as const) {
      const group = groups.find((g) => g.title === title);
      const row = group?.rows.find((r) => r.covers?.includes(action));
      expect(row?.keys, `'${title}' has no Esc row for '${action}'`).toEqual([['Esc']]);
    }
  });
});
