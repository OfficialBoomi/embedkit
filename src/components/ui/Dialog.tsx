/**
 * @file Dialog.tsx
 * @component Dialog
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a dismissible dialog for displaying error or status messages,
 * typically used within an `ErrorBoundary` to surface application-level
 * issues to the user. Accepts a `UIError` object that defines the header,
 * message, type, and optional HTTP status code. Can optionally display an
 * action button for navigation or retry logic.
 *
 * @example
 * <ErrorBoundary>
 *   <Dialog
 *     error={{
 *       header: 'Error',
 *       message: 'Something went wrong',
 *       errorType: 'error'
 *     }}
 *     showActionButton
 *     buttonLabel="Retry"
 *     onButtonClick={retryHandler}
 *   />
 * </ErrorBoundary>
 *
 * @return {JSX.Element} The rendered dialog component.
 */

import { useState } from 'react';
import {
  AiOutlineInfoCircle,
  AiOutlineCheckCircle,
  AiOutlineWarning,
  AiOutlineCloseCircle,
} from 'react-icons/ai';
import { MdErrorOutline } from 'react-icons/md';
import { UIError } from '../../types/ui';

// Map each type to its icon + notice state. Colors are driven by the
// --boomi-notice-* token family (themeable via boomi.config.js) rather than
// hardcoded Tailwind classes. The icon color comes from --boomi-notice-icon,
// which the per-state modifier classes set.
const iconStyle = { color: 'var(--boomi-notice-icon)' };
const iconMap = {
  info: {
    icon: <AiOutlineInfoCircle style={iconStyle} size={32} />,
    state: 'info',
  },
  success: {
    icon: <AiOutlineCheckCircle style={iconStyle} size={32} />,
    state: 'success',
  },
  warning: {
    icon: <AiOutlineWarning style={iconStyle} size={32} />,
    state: 'warning',
  },
  error: {
    icon: <MdErrorOutline style={iconStyle} size={32} />,
    state: 'error',
  },
};

/**
 * @interface DialogProps
 *
 * @description
 * Props for the `Dialog` component.
 *
 * @property {UIError} error - Object containing error details (message, header, type, and optional code).
 * @property {boolean} [showCloseButton=false] - If true, renders the circle close button in the top right corner.
 * @property {boolean} [showActionButton=false] - If true, renders an action button below the message.
 * @property {string} [buttonLabel='Go Back'] - Label text for the action button.
 * @property {() => void} [onButtonClick] - Callback when the action button is clicked. Defaults to `window.history.back`.
 */
interface DialogProps {
  error: UIError;
  showCloseButton?: boolean;
  showActionButton?: boolean;
  buttonLabel?: string;
  onButtonClick?: () => void;
}

const Dialog: React.FC<DialogProps> = ({
  error,
  showCloseButton = true,
  showActionButton = false,
  buttonLabel = 'Go Back',
  onButtonClick = () => window.history.back(),
}) => {
  const [visible, setVisible] = useState(true);
  const handleClose = () => {
    if (error.onClose) {
      error.onClose();
    } else {
      setVisible(false);
    }
  };

  if (!visible) return null;
  const { icon, state } = iconMap[error.errorType || 'info'];

  return (
    <div
      className={`boomi-notice--${state} max-w-lg mx-auto mt-8 p-6 rounded-xl border shadow-md relative flex flex-col`}
      style={{
        background: 'var(--boomi-notice-bg)',
        borderColor: 'var(--boomi-notice-border)',
        color: 'var(--boomi-notice-fg)',
      }}
    >
      {showCloseButton && (
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition"
          aria-label="Close"
        >
          <AiOutlineCloseCircle size={20} />
        </button>
      )}

      <div className="flex items-start gap-4">
        {icon}
        <div className="flex-1">
          {/* Title/message inherit the themeable --boomi-notice-fg from the card. */}
          <h3 className="text-lg font-semibold">{error.header}</h3>
          <p className="text-sm mt-1 whitespace-pre-line opacity-90">{error.message}</p>
          {error.code && (
            <p className="text-xs mt-1 opacity-60">Error Code: {error.code}</p>
          )}
        </div>
      </div>

      {showActionButton && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
            onClick={onButtonClick}
          >
            {buttonLabel}
          </button>
        </div>
      )}
    </div>
  );
};

export default Dialog;
