/**
 * @file ToastNotification.tsx
 * @component ToastNotification
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a SweetAlert2 toast notification with a specified type and content.
 * Typically used for transient messages that do not require user interaction.
 *
 * @return {JSX.Element} The rendered SweetAlert2 toast notification component.
 */

import { useEffect } from 'react';
import Swal from 'sweetalert2';
import { usePlugin } from '../../context/pluginContext';

/**
 * @interface ToastNotificationProps
 *
 * @description
 * Props for the `ToastNotification` component.
 *
 * @property {'error' | 'warning' | 'success' | 'info' | 'question'} type - The type of toast notification.
 * @property {string} content - The content/message displayed in the toast notification.
 */
interface ToastNotificationProps {
  type: 'error' | 'warning' | 'success' | 'info' | 'question';
  content: string;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ type, content }) => {
  const { boomiConfig } = usePlugin();

  const defaultStyles: Record<string, { background: string; color: string }> = {
    success: { background: '#22c55e', color: '#fff' },
    error: { background: '#ef4444', color: '#fff' },
    warning: { background: '#fde047', color: '#000' },
    info: { background: '#3b82f6', color: '#fff' },
    question: { background: '#4b5563', color: '#fff' },
  };

  useEffect(() => {
    const background = defaultStyles[type].background;
    const color = defaultStyles[type].color;

    const Toast = Swal.mixin({
      toast: true,
      position: 'top',
      iconColor: color,
      background,
      color,
      width: '600px',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
    });

    Toast.fire({
      icon: type,
      title: content,
    });
  }, [type, content, boomiConfig]);

  return null;
};

export default ToastNotification;
