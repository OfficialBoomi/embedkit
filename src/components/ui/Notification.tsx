/**
 * @file Notification.tsx
 * @component Notification
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Displays a notification message with a specified type and optional custom styling.
 * Can be used to surface success, warning, or error messages to the user.
 *
 * @return {JSX.Element} The rendered notification component.
 */

import classNames from 'classnames';
import {
  AiOutlineWarning,
  AiOutlineCheck,
  AiOutlineFrown,
} from 'react-icons/ai';

/**
 * @interface NotificationProps
 *
 * @description
 * Props for the `Notification` component.
 *
 * @property {'Error' | 'Warning' | 'Success'} type - The type of notification to display.
 * @property {string} message - The message text displayed in the notification.
 * @property {string} [className] - Optional CSS class name(s) to apply for custom styling.
 */
interface NotificationProps {
  type: 'Error' | 'Warning' | 'Success';
  message: string;
  className?: string;
}

const Notification: React.FC<NotificationProps> = ({ type, message, className }) => {
  const variant = type.toLowerCase() as 'error' | 'warning' | 'success';
  const ariaLive = type === 'Error' ? 'assertive' : 'polite';

  const Icon =
    type === 'Warning' ? AiOutlineWarning
    : type === 'Success' ? AiOutlineCheck
    : AiOutlineFrown;

  return (
    <div
      className={classNames('boomi-notice', className)}
      data-variant={variant}
      role="status"
      aria-live={ariaLive}
    >
      <Icon className="boomi-notice__icon" aria-hidden="true" />
      <p className="boomi-notice__text">
        <span className="boomi-notice__label">{type}:</span> {message}
      </p>
    </div>
  );
};

export default Notification;
