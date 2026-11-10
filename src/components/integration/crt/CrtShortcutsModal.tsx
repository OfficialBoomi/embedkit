/**
 * @file CrtShortcutsModal.tsx
 * @component CrtShortcutsModal
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The Keyboard shortcuts window of the cross reference table editor: a static list of the keys
 * for moving around and working in the table, in groups, with a Close button. The content is
 * plain data in crtShortcuts (keep that table current when a key changes).
 *
 * It reuses the shared Modal. The Modal renders in place (no portal to document.body), so its
 * styles, theme tokens and the host's modal offset all apply inside the plugin's shadow root,
 * and it looks like every other window of the plugin. What the shared Modal does not do is added
 * around it by CrtModalFrame, without changing it, the same way for every window of the screen:
 *  - it gets an accessible name and can take focus (the Modal's dialog element has neither);
 *  - focus moves into the window when it opens and goes back when it closes, to the element that
 *    had it (the table, after a mouse press, because the toolbar keeps focus on mouse down), or,
 *    when that element is gone, to `fallbackFocus`;
 *  - Tab stays inside the window, so a key can never reach the table behind it;
 *  - Escape closes it and is stopped, so it never also leaves full screen. Every other key is
 *    kept from the table and the host page too (inside a shadow root nothing shields them);
 *  - a click on the backdrop closes it, unless the press started inside the window (selecting
 *    text and letting go outside is not a click on the backdrop).
 *
 * @return {JSX.Element | null} The window while open, otherwise nothing.
 */

import { useId, useMemo } from 'react';
import {
  getShortcutGroups,
  type CrtShortcutRow,
} from '../../../utils/crt/crtShortcuts';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import CrtModalFrame from './CrtModalFrame';

export interface CrtShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where focus goes on close when the element that had it before is gone (for example the table). */
  fallbackFocus?: () => HTMLElement | null;
}

const TITLE = 'Keyboard shortcuts';
const DESCRIPTION = 'Keys for moving around and working in the table. Click a cell first, so the table has focus.';

/** One row's keys: combinations joined by 'or', the keys of a combination joined by '+'. */
function renderKeys(keys: CrtShortcutRow['keys']): React.ReactNode {
  return keys.map((combo, i) => (
    <span key={i} className="boomi-crt-sc-combo">
      {i > 0 && <span className="boomi-crt-sc-or">or</span>}
      {combo.map((label, j) => (
        <span key={j} className="boomi-crt-sc-key">
          {j > 0 && <span className="boomi-crt-sc-plus">+</span>}
          <kbd>{label}</kbd>
        </span>
      ))}
    </span>
  ));
}

/** Mounted only while open, so the frame's effects pair with opening and closing. */
const ShortcutsDialog: React.FC<Omit<CrtShortcutsModalProps, 'isOpen'>> = ({ onClose, fallbackFocus }) => {
  const uid = useId();
  const groups = useMemo(() => getShortcutGroups(), []);

  return (
    <CrtModalFrame label={TITLE} onClose={onClose} closeOnBackdrop fallbackFocus={fallbackFocus}>
      <Modal
        isOpen
        size="wide"
        title={TITLE}
        description={DESCRIPTION}
        onClose={onClose}
        showSaveButton={false}
        showCancelButton={false}
      >
        <div className="boomi-crt-sc">
          <div className="boomi-crt-sc-groups">
            {groups.map((group, g) => {
              const titleId = `${uid}-group-${g}`;
              return (
                <section key={group.title} className="boomi-crt-sc-group" aria-labelledby={titleId}>
                  <h3 id={titleId} className="boomi-crt-sc-title">
                    {group.title}
                  </h3>
                  <dl className="boomi-crt-sc-list">
                    {group.rows.map((row, r) => (
                      <div key={r} className="boomi-crt-sc-row">
                        <dt className="boomi-crt-sc-keys">{renderKeys(row.keys)}</dt>
                        <dd className="boomi-crt-sc-action">{row.action}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
          <div className="boomi-crt-sc-footer">
            <Button toggle={false} primary={false} showIcon={false} label="Close" onClick={onClose} />
          </div>
        </div>
      </Modal>
    </CrtModalFrame>
  );
};

const CrtShortcutsModal: React.FC<CrtShortcutsModalProps> = ({ isOpen, ...rest }) =>
  isOpen ? <ShortcutsDialog {...rest} /> : null;

CrtShortcutsModal.displayName = 'CrtShortcutsModal';
export default CrtShortcutsModal;
