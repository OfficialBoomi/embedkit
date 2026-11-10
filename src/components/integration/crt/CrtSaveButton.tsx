/**
 * @file CrtSaveButton.tsx
 * @component CrtSaveButton
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The Save button of the cross reference table screen. A table that only one process uses gets a plain
 * Save button. A table that several processes share gets a split button: the main part saves to this
 * process only, and the arrow opens a one item menu, "Save to other processes that share this table...",
 * which the screen answers with a confirmation. The label names what the save will do (a reset says
 * so), so the same control serves both.
 *
 * The menu is a plain popup anchored to the button: it opens upwards because the button sits at the
 * bottom of the screen, closes on Escape, on a click outside, and when focus leaves it.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AiOutlineDown } from 'react-icons/ai';
import Button from '../../ui/Button';

export interface CrtSaveButtonProps {
  /** True when other processes of the pack use the same table: shows the split button. */
  shared: boolean;
  /** Nothing to save, or a save is running. The bar next to the button says which. */
  disabled?: boolean;
  /** What the main button says when the table is shared, for example "Save to this process". */
  sharedLabel?: string;
  /** What the main button says otherwise. */
  label?: string;
  /** The menu item's text. */
  menuLabel?: string;
  onSave: () => void;
  onSaveOthers: () => void;
}

const CrtSaveButton: React.FC<CrtSaveButtonProps> = ({
  shared,
  disabled = false,
  sharedLabel = 'Save to this process',
  label = 'Save',
  menuLabel = 'Save to other processes that share this table...',
  onSave,
  onSaveOthers,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) arrowRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    // The plugin lives in a shadow root, so listen on the root node, not on `document`.
    const root = wrapRef.current?.getRootNode() as Document | ShadowRoot | undefined;
    const onPointerDown = (e: Event) => {
      if (wrapRef.current && !e.composedPath().includes(wrapRef.current)) close(false);
    };
    root?.addEventListener('mousedown', onPointerDown);
    return () => root?.removeEventListener('mousedown', onPointerDown);
  }, [open, close]);

  // A save that starts or a disabled button closes an open menu.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  if (!shared) {
    return (
      <Button
        toggle={false}
        primary={true}
        showIcon={false}
        label={label}
        disabled={disabled}
        onClick={onSave}
      />
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <div className="boomi-crt-split" ref={wrapRef} onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <Button
        toggle={false}
        primary={true}
        showIcon={false}
        label={sharedLabel}
        disabled={disabled}
        buttonClass="boomi-crt-split-main"
        onClick={onSave}
      />
      <button
        ref={arrowRef}
        type="button"
        className="boomi-crt-split-arrow boomi-btn-primary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="More ways to save"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <AiOutlineDown aria-hidden="true" />
      </button>
      {open && (
        <div className="boomi-crt-split-menu" role="menu" id={menuId}>
          <button
            type="button"
            role="menuitem"
            className="boomi-crt-split-item"
            autoFocus
            onClick={() => {
              close(false);
              onSaveOthers();
            }}
          >
            {menuLabel}
          </button>
        </div>
      )}
    </div>
  );
};

CrtSaveButton.displayName = 'CrtSaveButton';
export default CrtSaveButton;
