/**
 * @file Modal.tsx
 * @component Modal
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A reusable modal dialog component for displaying content in an overlay.
 * Supports a title, description, custom child content, and optional submit
 * and close actions. Can be customized with width and action button label.
 *
 * @return {JSX.Element} The rendered modal dialog.
 */

import Button from '../ui/Button';
import { AiOutlineClose } from 'react-icons/ai';

/**
 * @interface ModalProps
 *
 * @description
 * Props for the `Modal` component.
 *
 * @property {boolean} isOpen - Controls whether the modal is visible.
 * @property {string} title - The title text displayed at the top of the modal.
 * @property {string} description - The description text displayed below the title.
 * @property {React.ReactNode} children - The content to display inside the modal body.
 * @property {() => void} onClose - Callback invoked when the modal is closed.
 * @property {() => void} [onSubmit] - Optional callback invoked when the modal's submit action is triggered.
 * @property {string} [submitLabel='Submit'] - Optional label for the submit button.
 * @property {string} [width] - Optional CSS width value to control the modal’s width.
 */
interface ModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  children: React.ReactNode;
  onClose?: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  showSaveButton?: boolean;
  showCancelButton?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  description,
  children,
  onClose,
  onSubmit,
  showSaveButton = true,
  showCancelButton = true,
  submitLabel = 'Submit',
}) => {
  if (!isOpen) return null;
  const showButtons = showSaveButton || showCancelButton;
  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (onSubmit) {
      onSubmit();
    }
  };

  return (
    <div
      className="boomi-modal-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div className={`boomi-modal-container`}>
        <button
          className="boomi-modal-close"
          type="button"
          onClick={handleClose}
          aria-label="Close modal"
        >
          <AiOutlineClose className="h-5 w-5" />
        </button>

        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            {title}
          </h2>
        </div>
        <h4 className="text-sm font-normal mb-4">{description}</h4>

        <div className="space-y-4">{children}</div>
        {showButtons && (
          <div className="mt-6 flex justify-end space-x-3">
            {showCancelButton && (
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label="Cancel"
                onClick={handleClose}
              />
            )}
            {showSaveButton && (
              <Button
                toggle={false}
                primary={true}
                showIcon={false}
                label={submitLabel}
                onClick={onSubmit}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
