/**
 * @file ListSortButton.tsx
 * @component ListSortButton
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * "Sort by" menu for the integrations list, shown in both the card grid and the table.
 * It offers "Default order" plus the given options. Picking an option starts it in its
 * natural direction (A to Z, newest first); picking the active option again flips it.
 * It edits the same sort the table headers edit, so the two always agree.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AiOutlineArrowDown, AiOutlineArrowUp, AiOutlineSwap } from 'react-icons/ai';
import {
  DIRECTION_LABELS,
  FIRST_DIRECTION,
  SORT_LABELS,
  nextSortFromMenu,
  type ListSort,
  type ListSortBy,
} from '../../utils/listSort';

interface ListSortButtonProps {
  value: ListSort | undefined;
  onChange: (next: ListSort | undefined) => void;
  /** Options to offer, in menu order. */
  options: ListSortBy[];
}

const ListSortButton: React.FC<ListSortButtonProps> = ({ value, onChange, options }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = value ? SORT_LABELS[value.by] : 'Default order';

  // Close on a click outside (composedPath works across the shadow root) or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !e.composedPath().includes(rootRef.current)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (by: ListSortBy | null) => {
    onChange(nextSortFromMenu(value, by));
    // Flipping the active row keeps the menu open so both directions are one click apart.
    if (by === null || value?.by !== by) setOpen(false);
  };

  return (
    <div className="boomi-sortmenu" ref={rootRef}>
      <button
        type="button"
        className={`boomi-sortmenu__button${value ? ' boomi-sortmenu__button--active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort by: ${current}`}
        title="Sort by"
        onClick={() => setOpen((o) => !o)}
      >
        <AiOutlineSwap className="boomi-sortmenu__icon" style={{ transform: 'rotate(90deg)' }} aria-hidden="true" />
        <span className="boomi-sortmenu__label">Sort by: {current}</span>
      </button>

      {open && (
        <div className="boomi-sortmenu__panel boomi-menu" role="menu" aria-label="Sort by">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!value}
            className={`boomi-sortmenu__option${!value ? ' boomi-sortmenu__option--active' : ''}`}
            onClick={() => pick(null)}
          >
            <span className="boomi-sortmenu__name">Default order</span>
          </button>
          {options.map((by) => {
            const active = value?.by === by;
            const dir = active ? value!.dir : FIRST_DIRECTION[by];
            const Arrow = dir === 'asc' ? AiOutlineArrowUp : AiOutlineArrowDown;
            return (
              <button
                key={by}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`boomi-sortmenu__option${active ? ' boomi-sortmenu__option--active' : ''}`}
                onClick={() => pick(by)}
              >
                <span className="boomi-sortmenu__name">{SORT_LABELS[by]}</span>
                <span className="boomi-sortmenu__dir">
                  {DIRECTION_LABELS[by][dir]}
                  {active && <Arrow className="boomi-sortmenu__arrow" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ListSortButton;
