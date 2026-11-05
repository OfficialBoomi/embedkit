/**
 * @file CrtConflictModal.tsx
 * @component CrtConflictModal
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Shown when a save finds that the table was changed by someone else after it was loaded. Boomi keeps
 * no version of an override, so the server compares what it finds with what this screen loaded. The
 * user decides:
 *
 * - Overwrite: save these rows anyway, replacing the other version;
 * - Reload table: show the other version and discard the unsaved edits to this table;
 * - Keep editing: close this and change nothing, for example to copy the rows out first.
 */

import Button from '../../ui/Button';
import Modal from '../../ui/Modal';

export interface CrtConflictModalProps {
  isOpen: boolean;
  tableName: string;
  processName: string;
  onOverwrite: () => void;
  onReload: () => void;
  onKeepEditing: () => void;
}

const CrtConflictModal: React.FC<CrtConflictModalProps> = ({
  isOpen,
  tableName,
  processName,
  onOverwrite,
  onReload,
  onKeepEditing,
}) => {
  if (!isOpen) return null;
  return (
    <Modal
      isOpen
      title="This table was changed"
      description={`Someone else changed ${tableName} (${processName}) after you opened it. Overwrite replaces their version with yours. Reload table shows their version and discards your unsaved edits to this table. Keep editing lets you copy your rows out first.`}
      onClose={onKeepEditing}
      showSaveButton={false}
      showCancelButton={false}
    >
      <div className="boomi-crt-scope-actions">
        <Button toggle={false} primary={false} showIcon={false} label="Keep editing" onClick={onKeepEditing} />
        <Button toggle={false} primary={false} showIcon={false} label="Reload table" onClick={onReload} />
        <Button toggle={false} primary={true} showIcon={false} label="Overwrite" onClick={onOverwrite} />
      </div>
    </Modal>
  );
};

CrtConflictModal.displayName = 'CrtConflictModal';
export default CrtConflictModal;
