/**
 * @file AjaxLoader.tsx
 * @component AjaxLoader
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Displays three animated bouncing dots with an optional message.
 * Colors, sizing, and opacity are themeable via CSS variables.
 *
 * @return {JSX.Element} The rendered loading animation and optional message.
 */
import classNames from 'classnames';

/**
 * @interface AjaxLoaderProps
 *
 * @description
 * Props for the `AjaxLoader` component.
 *
 * @property {string} [message] - Optional text displayed below the loading animation.
 */
interface AjaxLoaderProps {
  message?: string;
  inline?: boolean;
  align?: 'start' | 'center' | 'end';
}

const AjaxLoader: React.FC<AjaxLoaderProps> = ({ 
  message, 
  inline = false,
  align = 'center',
}) => {
  const container = classNames(
    'boomi-loader',
    inline ? 'inline-flex' : 'flex',
    'items-center',
    align === 'start' ? 'justify-start' : align === 'end' ? 'justify-end' : 'justify-center',
  );

  return (
    <div className={container}>
      <div className="boomi-loader-dots">
        <div className="boomi-loader-dot boomi-loader-dot--1" />
        <div className="boomi-loader-dot boomi-loader-dot--2" />
        <div className="boomi-loader-dot boomi-loader-dot--3" />
      </div>
      {message && <div className="boomi-loader-message">{message}</div>}
    </div>
  );
};

export default AjaxLoader;
