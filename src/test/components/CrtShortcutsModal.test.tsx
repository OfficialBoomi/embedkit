/**
 * @file CrtShortcutsModal.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The Keyboard shortcuts window and the toolbar button that opens it: what the window lists,
 * Ctrl or Cmd by platform, Close, Escape and the backdrop, focus in and back, Tab staying inside,
 * and keys kept from the table and the host page (Escape in particular, so full screen is not
 * left too). The button is checked as the quiet last control of the second toolbar row.
 *
 * Not covered here, and only checkable in a browser: how the window and the muted button look in
 * the light, dark and boomi themes, where the window sits on a tall page (the shared Modal is
 * positioned against the plugin root), whether it scrolls on a short screen, and that Escape
 * leaves the real full screen untouched (a stand-in handler is used here).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CrtShortcutsModal from '../../components/integration/crt/CrtShortcutsModal';
import CrtToolbar from '../../components/integration/crt/CrtToolbar';

afterEach(() => {
  vi.restoreAllMocks();
});

const getDialog = () => screen.getByRole('dialog', { name: 'Keyboard shortcuts' });

describe('CrtShortcutsModal content', () => {
  it('renders nothing while closed', () => {
    render(<CrtShortcutsModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a named modal dialog with the title and a description', () => {
    render(<CrtShortcutsModal isOpen onClose={vi.fn()} />);
    const dialog = getDialog();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  it('lists the groups in order, each with its rows', () => {
    render(<CrtShortcutsModal isOpen onClose={vi.fn()} />);
    const headings = within(getDialog())
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(['Move', 'Select', 'Edit', 'Rows and clipboard', 'History', 'Find', 'View']);
    for (const name of headings) {
      const group = screen.getByRole('region', { name: name ?? '' });
      expect(group.querySelectorAll('.boomi-crt-sc-row').length).toBeGreaterThan(0);
    }
  });

  it('pairs each key combination with what it does', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    render(<CrtShortcutsModal isOpen onClose={vi.fn()} />);
    const history = screen.getByRole('region', { name: 'History' });
    const rows = Array.from(history.querySelectorAll('.boomi-crt-sc-row'));
    const text = (el: Element | null) => el?.textContent ?? '';
    expect(text(rows[0].querySelector('dt'))).toBe('Ctrl+Z');
    expect(text(rows[0].querySelector('dd'))).toMatch(/^Undo the last change/);
    // Two ways to redo, joined by "or".
    expect(text(rows[1].querySelector('dt'))).toBe('Ctrl+YorCtrl+Shift+Z');
    expect(rows[1].querySelectorAll('kbd')).toHaveLength(5);
    expect(text(rows[1].querySelector('dd'))).toBe('Redo');
  });

  it('shows the Space tick, and the keys that need a modifier, as separate keys', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    render(<CrtShortcutsModal isOpen onClose={vi.fn()} />);
    const select = screen.getByRole('region', { name: 'Select' });
    const tick = Array.from(select.querySelectorAll('.boomi-crt-sc-row')).find((r) =>
      /^Tick or untick the active row/.test(r.querySelector('dd')?.textContent ?? '')
    );
    expect(Array.from(tick?.querySelectorAll('kbd') ?? []).map((k) => k.textContent)).toEqual(['Space']);
  });

  it('shows Ctrl on other platforms and Cmd on a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const first = render(<CrtShortcutsModal isOpen onClose={vi.fn()} />);
    expect(within(getDialog()).getAllByText('Ctrl').length).toBeGreaterThan(0);
    expect(within(getDialog()).queryByText('Cmd')).toBeNull();
    first.unmount();

    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    render(<CrtShortcutsModal isOpen onClose={vi.fn()} />);
    expect(within(getDialog()).getAllByText('Cmd').length).toBeGreaterThan(0);
    expect(within(getDialog()).queryByText('Ctrl')).toBeNull();
  });
});

describe('CrtShortcutsModal closing', () => {
  it('has a Close button and the Modal close icon, and both close it', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CrtShortcutsModal isOpen onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Close modal' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Escape closes it, and is stopped so the host and a full screen handler never see it', () => {
    const onClose = vi.fn();
    const outerKey = vi.fn();
    render(
      <div onKeyDown={outerKey}>
        <CrtShortcutsModal isOpen onClose={onClose} />
      </div>
    );
    const notPrevented = fireEvent.keyDown(getDialog(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
    expect(outerKey).not.toHaveBeenCalled();
  });

  it('keeps every other key from the table behind it and the host page', () => {
    const outerKey = vi.fn();
    render(
      <div onKeyDown={outerKey}>
        <CrtShortcutsModal isOpen onClose={vi.fn()} />
      </div>
    );
    const dialog = getDialog();
    for (const init of [
      { key: 'f', ctrlKey: true },
      { key: 'F3' },
      { key: 'z', ctrlKey: true },
      { key: 'Delete' },
      { key: 'a' },
      { key: ' ' },
    ]) {
      fireEvent.keyDown(dialog, init);
    }
    expect(outerKey).not.toHaveBeenCalled();
  });

  it('does not eat the key presses it needs: Enter on a button still closes', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CrtShortcutsModal isOpen onClose={onClose} />);
    screen.getByRole('button', { name: 'Close' }).focus();
    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a click on the backdrop closes it', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CrtShortcutsModal isOpen onClose={onClose} />);
    await user.click(getDialog());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a click inside the window does not close it', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CrtShortcutsModal isOpen onClose={onClose} />);
    await user.click(within(getDialog()).getByRole('heading', { level: 3, name: 'Move' }));
    await user.click(within(getDialog()).getByRole('heading', { level: 2 }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a press that starts inside the window and ends on the backdrop does not close it', () => {
    const onClose = vi.fn();
    render(<CrtShortcutsModal isOpen onClose={onClose} />);
    const dialog = getDialog();
    // Selecting text and letting go outside the window: the click lands on the common ancestor.
    fireEvent.mouseDown(within(dialog).getByRole('heading', { level: 2 }));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    // A press that starts and ends on the backdrop does.
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('CrtShortcutsModal focus', () => {
  const closed = (extra: Partial<React.ComponentProps<typeof CrtShortcutsModal>> = {}) => (
    <CrtShortcutsModal isOpen={false} onClose={vi.fn()} {...extra} />
  );
  const open = (extra: Partial<React.ComponentProps<typeof CrtShortcutsModal>> = {}) => (
    <CrtShortcutsModal isOpen onClose={vi.fn()} {...extra} />
  );

  it('moves focus into the window when it opens and back to what had it when it closes', () => {
    render(<button type="button">opener</button>);
    const opener = screen.getByRole('button', { name: 'opener' });
    opener.focus();
    const { rerender } = render(closed());
    rerender(open());
    expect(getDialog()).toHaveFocus();
    rerender(closed());
    expect(opener).toHaveFocus();
  });

  it('goes to the fallback when the element that had focus is gone', () => {
    const grid = document.createElement('div');
    grid.tabIndex = 0;
    document.body.appendChild(grid);
    const temporary = document.createElement('input');
    document.body.appendChild(temporary);
    temporary.focus();
    const { rerender } = render(closed({ fallbackFocus: () => grid }));
    rerender(open({ fallbackFocus: () => grid }));
    expect(getDialog()).toHaveFocus();
    temporary.remove();
    rerender(closed({ fallbackFocus: () => grid }));
    expect(grid).toHaveFocus();
    grid.remove();
  });

  it('goes to the fallback when nothing had focus', () => {
    const grid = document.createElement('div');
    grid.tabIndex = 0;
    document.body.appendChild(grid);
    (document.activeElement as HTMLElement | null)?.blur();
    const { rerender } = render(closed({ fallbackFocus: () => grid }));
    rerender(open({ fallbackFocus: () => grid }));
    rerender(closed({ fallbackFocus: () => grid }));
    expect(grid).toHaveFocus();
    grid.remove();
  });

  it('hands focus back when the window is removed while open', () => {
    render(<button type="button">opener</button>);
    const opener = screen.getByRole('button', { name: 'opener' });
    opener.focus();
    const { unmount } = render(open());
    expect(getDialog()).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
  });

  it('works inside a shadow root, where document.activeElement is only the host', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);
    const ui = (isOpen: boolean) => (
      <>
        <button type="button">opener</button>
        <CrtShortcutsModal isOpen={isOpen} onClose={vi.fn()} />
      </>
    );
    const { rerender } = render(ui(false), { container: mountPoint });
    const opener = mountPoint.querySelector('button') as HTMLButtonElement;
    opener.focus();
    expect(shadow.activeElement).toBe(opener);
    rerender(ui(true));
    const dialog = mountPoint.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-label')).toBe('Keyboard shortcuts');
    expect(shadow.activeElement).toBe(dialog);
    rerender(ui(false));
    expect(shadow.activeElement).toBe(opener);
    host.remove();
  });

  it('keeps Tab inside the window, wrapping at both ends', async () => {
    const user = userEvent.setup();
    render(open());
    const dialog = getDialog();
    const cross = within(dialog).getByRole('button', { name: 'Close modal' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(dialog).toHaveFocus();
    await user.tab();
    expect(cross).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(cross).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it('Shift+Tab from the window itself wraps to the last control', async () => {
    const user = userEvent.setup();
    render(open());
    expect(getDialog()).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(getDialog()).getByRole('button', { name: 'Close' })).toHaveFocus();
  });
});

describe('the toolbar button', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A workspace like the screen's: the toolbar, a grid beside it, and an Escape handler like full screen's. */
  const mount = (props: Partial<React.ComponentProps<typeof CrtToolbar>> = {}) => {
    const workspaceKey = vi.fn();
    const hostKey = vi.fn();
    const utils = render(
      <div onKeyDown={hostKey}>
        <div className="boomi-crt-workspace" onKeyDown={workspaceKey}>
          <CrtToolbar info={null} onRun={vi.fn()} onToggleFullScreen={vi.fn()} {...props} />
          <div>
            <div role="grid" tabIndex={0} aria-label="Table" />
          </div>
        </div>
      </div>
    );
    return {
      ...utils,
      workspaceKey,
      hostKey,
      grid: screen.getByRole('grid'),
      button: screen.getByRole('button', { name: 'Keyboard shortcuts' }),
    };
  };

  it('is a small icon-only control with a tooltip and a label', () => {
    const { button } = mount();
    expect(button).toHaveAttribute('title', 'Keyboard shortcuts');
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveClass('boomi-crt-shortcuts-btn');
    expect(button).not.toHaveClass('boomi-crt-tool');
  });

  it('sits at the far end of the second row, after Full screen', () => {
    const { button } = mount();
    const lines = document.querySelectorAll('.boomi-crt-tools-line');
    expect(lines).toHaveLength(2);
    expect(lines[1].lastElementChild?.contains(button)).toBe(true);
    const fullScreen = screen.getByRole('button', { name: 'Full screen' });
    expect(fullScreen.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is still there in full screen, which shares the toolbar', () => {
    mount({ fullScreen: true });
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument();
  });

  it('keeps focus where it is on a mouse press, like every toolbar button', () => {
    const { button } = mount();
    expect(fireEvent.mouseDown(button)).toBe(false);
  });

  it('opens the window, which is not inside the toolbar', async () => {
    const user = userEvent.setup();
    const { button } = mount();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(button);
    const dialog = getDialog();
    expect(screen.getByRole('toolbar', { name: 'Table actions' }).contains(dialog)).toBe(false);
  });

  it('a mouse press leaves the table focused, and closing hands focus back to the table', async () => {
    const user = userEvent.setup();
    const { button, grid } = mount();
    grid.focus();
    await user.click(button);
    expect(getDialog()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(grid).toHaveFocus();
  });

  it('opened from the keyboard, closing returns focus to the button', async () => {
    const user = userEvent.setup();
    const { button } = mount();
    button.focus();
    await user.keyboard('{Enter}');
    expect(getDialog()).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('closing hands focus to the table when the element that had it has gone', async () => {
    const user = userEvent.setup();
    const { button, grid } = mount();
    const temporary = document.createElement('input');
    grid.parentElement?.appendChild(temporary);
    temporary.focus();
    await user.click(button);
    temporary.remove();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(grid).toHaveFocus();
  });

  it('Escape closes the window and never reaches the workspace handler that leaves full screen', async () => {
    const user = userEvent.setup();
    const { button, workspaceKey, hostKey } = mount({ fullScreen: true });
    await user.click(button);
    workspaceKey.mockClear();
    hostKey.mockClear();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(workspaceKey).not.toHaveBeenCalled();
    expect(hostKey).not.toHaveBeenCalled();
  });

  it('with the window closed Escape still reaches the workspace, so full screen can be left', async () => {
    const user = userEvent.setup();
    const { button, workspaceKey } = mount({ fullScreen: true });
    button.focus();
    await user.keyboard('{Escape}');
    expect(workspaceKey).toHaveBeenCalledTimes(1);
  });

  it('keys typed in the window do not start a find, though the toolbar handles find keys', async () => {
    const onCommand = vi.fn();
    const user = userEvent.setup();
    const { button } = mount({
      find: { open: false, onToggle: vi.fn(), onCommand, bar: <div /> },
    });
    await user.click(button);
    fireEvent.keyDown(getDialog(), { key: 'f', ctrlKey: true });
    fireEvent.keyDown(getDialog(), { key: 'F3' });
    expect(onCommand).not.toHaveBeenCalled();
    // The same keys on the button itself do start one.
    await user.click(screen.getByRole('button', { name: 'Close' }));
    button.focus();
    fireEvent.keyDown(button, { key: 'F3' });
    expect(onCommand).toHaveBeenCalledWith('next');
  });

  it('does not change the second row of buttons the find tests rely on', () => {
    mount({ find: { open: false, onToggle: vi.fn(), onCommand: vi.fn(), bar: <div /> } });
    const lines = document.querySelectorAll('.boomi-crt-tools-line');
    const direct = Array.from(lines[1].querySelectorAll(':scope > button')).map((b) => b.textContent);
    expect(direct).toEqual(['Find', 'Full screen']);
  });
});
