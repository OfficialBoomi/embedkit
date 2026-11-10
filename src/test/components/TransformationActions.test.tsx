/**
 * @file TransformationActions.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The kebab menu of a transformation card: the "Open Cross Reference Table" item shows only when a handler is
 * given, comes before the other items, and calls the handler. The items that were there before stay, in their order.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransformationActions from '../../components/integration/TransformationActions';

// The menu library measures its list with a ResizeObserver, which jsdom does not have.
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const OPEN = 'Open Cross Reference Table';
const openMenu = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Open options' }));
const items = () => screen.getAllByRole('menuitem').map((el) => el.textContent);

describe('TransformationActions', () => {
  it('has only Delete when it is given nothing else, as before', async () => {
    const user = userEvent.setup();
    render(<TransformationActions onDeleteTransformation={vi.fn()} />);
    await openMenu(user);
    expect(items()).toEqual(['Delete Transformation']);
    expect(screen.queryByText(OPEN)).toBeNull();
  });

  it('has Edit and Delete in their old order when given an edit handler', async () => {
    const user = userEvent.setup();
    render(<TransformationActions onEditTransformation={vi.fn()} onDeleteTransformation={vi.fn()} />);
    await openMenu(user);
    expect(items()).toEqual(['Edit Transformation', 'Delete Transformation']);
  });

  it('shows the item only when a handler is given, and puts it first', async () => {
    const user = userEvent.setup();
    render(<TransformationActions onOpenCrossReference={vi.fn()} onDeleteTransformation={vi.fn()} />);
    await openMenu(user);
    expect(items()).toEqual([OPEN, 'Delete Transformation']);
  });

  it('puts it before Edit as well, when a card has both', async () => {
    const user = userEvent.setup();
    render(
      <TransformationActions
        onOpenCrossReference={vi.fn()}
        onEditTransformation={vi.fn()}
        onDeleteTransformation={vi.fn()}
      />
    );
    await openMenu(user);
    expect(items()).toEqual([OPEN, 'Edit Transformation', 'Delete Transformation']);
  });

  it('calls only its own handler when the item is chosen', async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    const del = vi.fn();
    render(<TransformationActions onOpenCrossReference={open} onDeleteTransformation={del} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: OPEN }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalled();
  });
});
