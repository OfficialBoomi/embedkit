/**
 * @file Spinner.tsx
 * @component Spinner
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Displays a loading spinner with an optional message.
 * Commonly used to indicate background processing or data fetching.
 *
 * @return {JSX.Element} The rendered loading spinner component.
 */

/**
 * @interface SpinnerProps
 *
 * @description
 * Props for the `Spinner` component.
 *
 * @property {string} [message='Loading...'] - Optional message displayed next to or below the spinner.
 */
interface SpinnerProps {
  message?: string;
  variant?: 'full' | 'contained';
}

const Spinner: React.FC<SpinnerProps> = ({ message = 'Loading...', variant = 'full' }) => {
  const overlayClass =
    variant === 'contained'
      ? 'boomi-spinner-overlay boomi-spinner-overlay--contained'
      : 'boomi-spinner-overlay';
  return (
    <div className={overlayClass}>
      <div className="boomi-spinner-container">
        <div className="boomi-spinner-ring-wrap">
          <div className="boomi-spinner-ring"></div>
          <div className="boomi-spinner-ring-ping"></div>
        </div>
        <span className="boomi-spinner-message">{message}</span>
      </div>
    </div>
  );
};

export default Spinner;
