/**
 * @file CrtFindBar.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The find and replace row and the way the toolbar hosts it: typing, the three toggles, stepping
 * with Enter, Shift+Enter, F3 and the buttons, Replace and Replace all (and why they are off),
 * the invalid pattern state, the keys the row keeps from the host page, and Escape. The row holds
 * no search state, so every test drives it with props and checks the callbacks.
 *
 * Not covered here, and only checkable in a browser: that focus really stays in the find box when
 * a button is pressed with the mouse (jsdom has no default action for a mouse press), and how
 * the row wraps and looks.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import CrtFindBar, { type CrtFindBarProps } from '../../components/integration/crt/CrtFindBar';
import CrtToolbar from '../../components/integration/crt/CrtToolbar';

const props = (over: Partial<CrtFindBarProps> = {}): CrtFindBarProps => ({
  query: '',
  replacement: '',
  options: { matchCase: false, wholeCell: false, regex: false },
  status: '',
  invalid: false,
  hasMatches: false,
  canReplace: true,
  focusToken: 0,
  onQueryChange: vi.fn(),
  onReplacementChange: vi.fn(),
  onToggleOption: vi.fn(),
  onStep: vi.fn(),
  onReplace: vi.fn(),
  onReplaceAll: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

/** The row inside a parent that records every key that gets past it, like the host page would. */
function renderBar(over: Partial<CrtFindBarProps> = {}) {
  const p = props(over);
  const hostKey = vi.fn();
  const utils = render(
    <div onKeyDown={hostKey}>
      <CrtFindBar {...p} />
    </div>
  );
  return {
    ...utils,
    p,
    hostKey,
    find: screen.getByRole('textbox', { name: 'Find' }) as HTMLInputElement,
    replace: screen.getByRole('textbox', { name: 'Replace with' }) as HTMLInputElement,
  };
}

describe('CrtFindBar layout and labels', () => {
  it('is a search region with a Find box and a Replace with box', () => {
    const { find, replace } = renderBar();
    expect(screen.getByRole('search', { name: 'Find and replace' })).toBeInTheDocument();
    expect(find).toHaveAttribute('aria-label', 'Find');
    expect(replace).toHaveAttribute('aria-label', 'Replace with');
  });

  it('lists the controls in one line, in order', () => {
    renderBar({ hasMatches: true });
    const bar = screen.getByRole('search');
    const names = Array.from(bar.querySelectorAll('input, button')).map(
      (el) => el.getAttribute('aria-label') ?? el.textContent
    );
    expect(names).toEqual([
      'Find',
      'Match case',
      'Whole cell',
      'Regex',
      'Previous match',
      'Next match',
      'Replace with',
      'Replace',
      'Replace all',
      'Close find',
    ]);
  });

  it('shows the box text and the counter it is given', () => {
    const { find, replace } = renderBar({ query: 'abc', replacement: 'xyz', status: '3 of 12' });
    expect(find).toHaveValue('abc');
    expect(replace).toHaveValue('xyz');
    expect(screen.getByRole('status')).toHaveTextContent('3 of 12');
  });

  it('describes the find box by the counter', () => {
    const { find } = renderBar({ status: 'No matches' });
    const id = find.getAttribute('aria-describedby') as string;
    expect(document.getElementById(id)).toHaveTextContent('No matches');
  });

  it('puts the cursor in the find box when it opens', () => {
    const { find } = renderBar();
    expect(find).toHaveFocus();
  });
});

describe('typing and toggles', () => {
  it('reports what is typed in each box', () => {
    const { find, replace, p } = renderBar();
    fireEvent.change(find, { target: { value: 'foo' } });
    fireEvent.change(replace, { target: { value: 'bar' } });
    expect(p.onQueryChange).toHaveBeenCalledWith('foo');
    expect(p.onReplacementChange).toHaveBeenCalledWith('bar');
  });

  it('has three toggles with aria-pressed that follow the options, and titles', () => {
    renderBar({ options: { matchCase: true, wholeCell: false, regex: true } });
    const matchCase = screen.getByRole('button', { name: 'Match case' });
    const whole = screen.getByRole('button', { name: 'Whole cell' });
    const regex = screen.getByRole('button', { name: 'Regex' });
    expect(matchCase).toHaveAttribute('aria-pressed', 'true');
    expect(whole).toHaveAttribute('aria-pressed', 'false');
    expect(regex).toHaveAttribute('aria-pressed', 'true');
    for (const toggle of [matchCase, whole, regex]) expect(toggle).toHaveAttribute('title');
    expect(matchCase).toHaveTextContent('Aa');
    expect(regex).toHaveTextContent('.*');
  });

  it('each toggle asks for its own option', () => {
    const { p } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Match case' }));
    fireEvent.click(screen.getByRole('button', { name: 'Whole cell' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regex' }));
    expect((p.onToggleOption as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      ['matchCase'],
      ['wholeCell'],
      ['regex'],
    ]);
  });
});

describe('invalid pattern', () => {
  it('marks the find box invalid and styles the counter', () => {
    const { find } = renderBar({ query: '(', status: 'Invalid regular expression', invalid: true });
    expect(find).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Invalid regular expression');
    expect(screen.getByRole('status')).toHaveClass('boomi-crt-find-count--invalid');
  });

  it('is not invalid otherwise', () => {
    const { find } = renderBar({ query: 'a', status: 'No matches' });
    expect(find).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('status')).not.toHaveClass('boomi-crt-find-count--invalid');
  });

  it('shows a refused pattern as an invalid one, with its sentence in the live counter', () => {
    const sentence = 'This pattern could take too long to run. Try a simpler one.';
    const { find } = renderBar({ query: '(a+)+', status: sentence, invalid: true });
    expect(find).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(sentence);
    expect(screen.getByRole('status')).toHaveClass('boomi-crt-find-count--invalid');
  });
});

describe('a long counter sentence', () => {
  it('may wrap, so it never runs out of the row, while the short counters keep to one line', () => {
    renderBar({ query: 'a', status: 'Search stopped early, the table is large or the pattern is slow' });
    expect(screen.getByRole('status')).toHaveClass('boomi-crt-find-count--long');
    cleanup();
    for (const short of ['', 'No matches', '3 of 12', '1,234 of 50,000+ matches']) {
      renderBar({ query: 'a', status: short });
      expect(screen.getByRole('status')).not.toHaveClass('boomi-crt-find-count--long');
      cleanup();
    }
  });
});

describe('stepping', () => {
  it('Enter in the find box goes to the next match, Shift+Enter to the previous one', () => {
    const { find, p } = renderBar({ hasMatches: true });
    expect(fireEvent.keyDown(find, { key: 'Enter' })).toBe(false);
    expect(p.onStep).toHaveBeenLastCalledWith(1);
    expect(fireEvent.keyDown(find, { key: 'Enter', shiftKey: true })).toBe(false);
    expect(p.onStep).toHaveBeenLastCalledWith(-1);
    expect(p.onStep).toHaveBeenCalledTimes(2);
  });

  it('F3 and Shift+F3 step from the find box, the replace box and a button', () => {
    const { find, replace, p } = renderBar({ hasMatches: true });
    const step = p.onStep as ReturnType<typeof vi.fn>;
    const regex = screen.getByRole('button', { name: 'Regex' });
    for (const el of [find, replace, regex]) {
      step.mockClear();
      expect(fireEvent.keyDown(el, { key: 'F3' })).toBe(false);
      expect(fireEvent.keyDown(el, { key: 'F3', shiftKey: true })).toBe(false);
      expect(step.mock.calls).toEqual([[1], [-1]]);
    }
  });

  it('the previous and next buttons step, and are off without matches', () => {
    const on = renderBar({ hasMatches: true });
    fireEvent.click(screen.getByRole('button', { name: 'Previous match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect((on.p.onStep as ReturnType<typeof vi.fn>).mock.calls).toEqual([[-1], [1]]);
    on.unmount();

    const off = renderBar({ hasMatches: false });
    expect(screen.getByRole('button', { name: 'Previous match' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(off.p.onStep).not.toHaveBeenCalled();
  });

  it('Enter on a button is left to the button, not a step', () => {
    const { p } = renderBar({ hasMatches: true });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Match case' }), { key: 'Enter' });
    expect(p.onStep).not.toHaveBeenCalled();
    expect(p.onReplace).not.toHaveBeenCalled();
  });

  it('Enter while an input method is composing is not a step', () => {
    const { find, p } = renderBar({ hasMatches: true });
    fireEvent.keyDown(find, { key: 'Enter', isComposing: true });
    expect(p.onStep).not.toHaveBeenCalled();
  });

  it('Ctrl or Alt with Enter is not a step', () => {
    const { find, p } = renderBar({ hasMatches: true });
    fireEvent.keyDown(find, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(find, { key: 'Enter', altKey: true });
    expect(p.onStep).not.toHaveBeenCalled();
  });
});

describe('Replace and Replace all', () => {
  it('Replace and Replace all call their handlers', () => {
    const { p } = renderBar({ hasMatches: true });
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
    expect(p.onReplace).toHaveBeenCalledTimes(1);
    expect(p.onReplaceAll).toHaveBeenCalledTimes(1);
  });

  it('Enter in the replace box replaces', () => {
    const { replace, p } = renderBar({ hasMatches: true });
    expect(fireEvent.keyDown(replace, { key: 'Enter' })).toBe(false);
    expect(p.onReplace).toHaveBeenCalledTimes(1);
    expect(p.onStep).not.toHaveBeenCalled();
  });

  it('both are off on a table that cannot be edited, and say how to turn editing on', () => {
    const { p } = renderBar({ hasMatches: true, canReplace: false });
    const replace = screen.getByRole('button', { name: 'Replace' });
    const all = screen.getByRole('button', { name: 'Replace all' });
    expect(replace).toBeDisabled();
    expect(all).toBeDisabled();
    expect(replace).toHaveAttribute('title', 'Press Override to edit');
    expect(all).toHaveAttribute('title', 'Press Override to edit');
    fireEvent.click(replace);
    fireEvent.click(all);
    expect(p.onReplace).not.toHaveBeenCalled();
    expect(p.onReplaceAll).not.toHaveBeenCalled();
  });

  it('both are off without matches', () => {
    renderBar({ hasMatches: false, canReplace: true });
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace' })).toHaveAttribute('title', 'No matches to replace');
  });

  it('both are on with matches on an editable table', () => {
    renderBar({ hasMatches: true, canReplace: true });
    expect(screen.getByRole('button', { name: 'Replace' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeEnabled();
  });

  it('the replace box still takes text on a read only table', () => {
    const { replace, p } = renderBar({ canReplace: false });
    fireEvent.change(replace, { target: { value: 'x' } });
    expect(p.onReplacementChange).toHaveBeenCalledWith('x');
  });
});

describe('closing', () => {
  it('Escape closes the row and the event goes no further', () => {
    const { find, replace, p, hostKey } = renderBar();
    expect(fireEvent.keyDown(find, { key: 'Escape' })).toBe(false);
    expect(fireEvent.keyDown(replace, { key: 'Escape' })).toBe(false);
    expect(fireEvent.keyDown(screen.getByRole('button', { name: 'Regex' }), { key: 'Escape' })).toBe(false);
    expect(p.onClose).toHaveBeenCalledTimes(3);
    expect(hostKey).not.toHaveBeenCalled();
  });

  it('Escape during composition cancels the composition, not the row', () => {
    const { find, p } = renderBar();
    fireEvent.keyDown(find, { key: 'Escape', isComposing: true });
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('the close button closes', () => {
    const { p } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Close find' }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('keys are kept from the host page', () => {
  it.each([
    ['a letter', { key: 'a' }],
    ['a space', { key: ' ' }],
    ['an arrow', { key: 'ArrowDown' }],
    ['Tab', { key: 'Tab' }],
    ['Ctrl+Z', { key: 'z', ctrlKey: true }],
    ['Ctrl+A', { key: 'a', ctrlKey: true }],
    ['Delete', { key: 'Delete' }],
    ['Enter', { key: 'Enter' }],
  ])('%s never reaches the host, from either box', (_name, init) => {
    const { find, replace, hostKey } = renderBar({ hasMatches: true });
    fireEvent.keyDown(find, init);
    fireEvent.keyDown(replace, init);
    expect(hostKey).not.toHaveBeenCalled();
  });

  it('keys the boxes need are not prevented, so typing, Tab and the browser text undo still work', () => {
    const { find } = renderBar();
    expect(fireEvent.keyDown(find, { key: 'a' })).toBe(true);
    expect(fireEvent.keyDown(find, { key: 'Tab' })).toBe(true);
    expect(fireEvent.keyDown(find, { key: 'z', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(find, { key: 'ArrowLeft' })).toBe(true);
  });

  it('Ctrl or Cmd+F in the row selects the find box text instead of opening the browser find', () => {
    const { find, replace, hostKey } = renderBar({ query: 'hello' });
    replace.focus();
    expect(fireEvent.keyDown(replace, { key: 'f', ctrlKey: true })).toBe(false);
    expect(find).toHaveFocus();
    expect(find.selectionStart).toBe(0);
    expect(find.selectionEnd).toBe(5);
    replace.focus();
    expect(fireEvent.keyDown(replace, { key: 'f', metaKey: true })).toBe(false);
    expect(find).toHaveFocus();
    expect(hostKey).not.toHaveBeenCalled();
  });

  it('a new focus token focuses the find box again and selects its text', () => {
    const p = props({ query: 'hello', focusToken: 1 });
    const { rerender } = render(<CrtFindBar {...p} />);
    const find = screen.getByRole('textbox', { name: 'Find' }) as HTMLInputElement;
    const replace = screen.getByRole('textbox', { name: 'Replace with' }) as HTMLInputElement;
    replace.focus();
    expect(replace).toHaveFocus();
    rerender(<CrtFindBar {...p} focusToken={2} />);
    expect(find).toHaveFocus();
    expect(find.selectionEnd).toBe(5);
  });

  it('the same focus token on a later render leaves the cursor where it is', () => {
    const p = props({ focusToken: 1 });
    const { rerender } = render(<CrtFindBar {...p} />);
    const replace = screen.getByRole('textbox', { name: 'Replace with' });
    replace.focus();
    rerender(<CrtFindBar {...p} status="2 of 4" />);
    expect(replace).toHaveFocus();
  });
});

describe('CrtToolbar find button and third row', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderToolbar = (open: boolean, over: Partial<React.ComponentProps<typeof CrtToolbar>> = {}) => {
    const onToggle = vi.fn();
    const onCommand = vi.fn();
    const hostKey = vi.fn();
    const utils = render(
      <div onKeyDown={hostKey}>
        <CrtToolbar
          info={null}
          onRun={vi.fn()}
          onToggleFullScreen={vi.fn()}
          find={{ open, onToggle, onCommand, bar: <div data-testid="bar">the find row</div> }}
          {...over}
        />
      </div>
    );
    return { ...utils, onToggle, onCommand, hostKey };
  };

  it('has no Find button and no third row when the screen gives no find', () => {
    render(<CrtToolbar info={null} onRun={vi.fn()} onToggleFullScreen={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Find/ })).toBeNull();
    expect(document.querySelectorAll('.boomi-crt-tools-line')).toHaveLength(2);
  });

  it('puts the Find button in the second row, just before Full screen', () => {
    renderToolbar(false);
    const lines = document.querySelectorAll('.boomi-crt-tools-line');
    expect(lines).toHaveLength(2);
    const buttons = Array.from(lines[1].querySelectorAll(':scope > button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Find', 'Full screen']);
  });

  it('shows the button pressed while find is open, with the shortcut in its title', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const closed = renderToolbar(false);
    expect(screen.getByRole('button', { name: 'Find' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Find' })).toHaveAttribute('title', 'Find and replace (Ctrl+F)');
    closed.unmount();
    renderToolbar(true);
    expect(screen.getByRole('button', { name: 'Find' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses the Command key text on a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    renderToolbar(false);
    expect(screen.getByRole('button', { name: 'Find' })).toHaveAttribute('title', 'Find and replace (⌘F)');
  });

  it('the button toggles', () => {
    const { onToggle } = renderToolbar(false);
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the row as a third line only while open', () => {
    const closed = renderToolbar(false);
    expect(screen.queryByTestId('bar')).toBeNull();
    closed.unmount();
    renderToolbar(true);
    const bar = screen.getByTestId('bar');
    const toolbar = screen.getByRole('toolbar', { name: 'Table actions' });
    expect(bar.parentElement).toBe(toolbar);
    expect(toolbar.lastElementChild).toBe(bar);
  });

  it('passes the find keys pressed on a toolbar button to the screen, and stops them', () => {
    const { onCommand, hostKey } = renderToolbar(false);
    const find = screen.getByRole('button', { name: 'Find' });
    expect(fireEvent.keyDown(find, { key: 'f', ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(find, { key: 'f', metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(find, { key: 'F3' })).toBe(false);
    expect(fireEvent.keyDown(find, { key: 'F3', shiftKey: true })).toBe(false);
    expect(onCommand.mock.calls).toEqual([['open'], ['open'], ['next'], ['prev']]);
    expect(hostKey).not.toHaveBeenCalled();
  });

  it('leaves other keys alone', () => {
    const { onCommand, hostKey } = renderToolbar(false);
    const find = screen.getByRole('button', { name: 'Find' });
    expect(fireEvent.keyDown(find, { key: 'f' })).toBe(true);
    expect(fireEvent.keyDown(find, { key: 'Escape' })).toBe(true);
    expect(onCommand).not.toHaveBeenCalled();
    expect(hostKey).toHaveBeenCalledTimes(2);
  });

  it('does not take the find keys when the screen gives no find', () => {
    const hostKey = vi.fn();
    render(
      <div onKeyDown={hostKey}>
        <CrtToolbar info={null} onRun={vi.fn()} onToggleFullScreen={vi.fn()} />
      </div>
    );
    const full = screen.getByRole('button', { name: 'Full screen' });
    expect(fireEvent.keyDown(full, { key: 'f', ctrlKey: true })).toBe(true);
    expect(hostKey).toHaveBeenCalledTimes(1);
  });

  it('presses on buttons keep focus where it is, presses on the find boxes do not', () => {
    const onCommand = vi.fn();
    render(
      <CrtToolbar
        info={null}
        onRun={vi.fn()}
        find={{ open: true, onToggle: vi.fn(), onCommand, bar: <CrtFindBar {...props()} /> }}
      />
    );
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Find' }))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Next match' }))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByRole('textbox', { name: 'Find' }))).toBe(true);
    expect(fireEvent.mouseDown(screen.getByRole('textbox', { name: 'Replace with' }))).toBe(true);
  });

  it('keys typed in the real row inside the toolbar never reach the toolbar handler or the host', () => {
    const p = props({ hasMatches: true });
    const onCommand = vi.fn();
    const hostKey = vi.fn();
    render(
      <div onKeyDown={hostKey}>
        <CrtToolbar
          info={null}
          onRun={vi.fn()}
          find={{ open: true, onToggle: vi.fn(), onCommand, bar: <CrtFindBar {...p} /> }}
        />
      </div>
    );
    const find = within(screen.getByRole('search')).getByRole('textbox', { name: 'Find' });
    fireEvent.keyDown(find, { key: 'F3' });
    fireEvent.keyDown(find, { key: 'f', ctrlKey: true });
    fireEvent.keyDown(find, { key: 'Escape' });
    // The row handled its own: F3 stepped, Escape closed, and the toolbar's find handler saw neither.
    expect(p.onStep).toHaveBeenCalledWith(1);
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(onCommand).not.toHaveBeenCalled();
    expect(hostKey).not.toHaveBeenCalled();
  });
});
