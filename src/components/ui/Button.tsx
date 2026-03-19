/**
 * @file Button.tsx
 * @component Button
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A customizable button component supporting toggle states, icons,
 * loading state, and optional label text. Can be styled via class
 * overrides and supports both primary and secondary modes.
 *
 * @return {JSX.Element} The rendered button element.
 */

import { useState, useEffect } from 'react';
import classNames from 'classnames';

/**
 * @interface ButtonProps
 *
 * @description
 * Props for the `Button` component.
 *
 * @property {boolean} toggle - Whether the button is in a toggled state.
 * @property {boolean} [primary=true] - Whether the button is styled as the primary action.
 * @property {string} [viewLoc] - Optional view location identifier for tracking or analytics.
 * @property {boolean} [iconOnly=false] - Whether the button should display only an icon with no label.
 * @property {React.ReactNode} [icon] - The icon to display when the button is not toggled.
 * @property {React.ReactNode} [onIcon] - The icon to display when the button is toggled.
 * @property {string} [onClass] - Optional CSS class to apply when the button is toggled on.
 * @property {boolean} [showIcon] - Whether to always display the icon, regardless of label presence.
 * @property {string} [label] - The label text displayed on the button.
 * @property {boolean} [isLoading] - Whether the button is in a loading state.
 * @property {string} [buttonClass] - Additional CSS classes for the button element.
 * @property {boolean} [disabled=false] - Whether the button is disabled.
 * @property {(e: React.MouseEvent<HTMLButtonElement>) => void} [onClick] - Callback invoked when the button is clicked.
 * @property {string} [hoverText] - Optional text displayed on hover (tooltip).
 */
interface ButtonProps {
  toggle: boolean;
  primary?: boolean;
  viewLoc?: string;
  iconOnly?: boolean;
  icon?: React.ReactNode;
  onIcon?: React.ReactNode;
  onClass?: string;
  showIcon?: boolean;
  label?: string;
  isLoading?: boolean;
  buttonClass?: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  hoverText?: string;
}

const Button: React.FC<ButtonProps> = ({
  toggle,
  primary = true,
  viewLoc,
  icon,
  onIcon,
  onClass,
  showIcon,
  label,
  isLoading,
  buttonClass,
  disabled = false,
  onClick,
  hoverText,
  iconOnly = false,
}) => {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (toggle && viewLoc) {
      const stored = localStorage.getItem(viewLoc || 'plugin-table');
      setPressed(stored === 'on');
    }
  }, [viewLoc, toggle]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isLoading) return;
    if (toggle && viewLoc) {
      const next = !pressed;
      setPressed(next);
      localStorage.setItem(viewLoc, next ? 'on' : 'off');
    }
    onClick?.(e);
  };

  const isPressed = pressed && toggle;

  // Base pieces
  const baseClass =
    'flex items-center justify-center rounded-md text-sm font-semibold relative transition-all duration-150 cursor-pointer select-none border';
  const sizeClass = iconOnly ? 'p-2 shadow-none rounded-full' : 'px-3 py-2 shadow-sm';
  const toneClass = primary ? 'boomi-btn-primary' : 'boomi-btn-secondary';

  // Focus ring (pick the right outline color per tone)
  const focusPrimary =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--boomi-btn-primary-border)]';
  const focusSecondary =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--boomi-btn-secondary-border)]';

  const disabledClass =
    'opacity-50 cursor-not-allowed pointer-events-none [filter:saturate(0.9)]';

  const effectiveClass = classNames(
    baseClass,
    sizeClass,
    toneClass,
    primary ? focusPrimary : focusSecondary,
    {
      [onClass || '']: isPressed,
      [disabledClass]: disabled || isLoading,
    },
    buttonClass
  );

  const effectiveIcon = isPressed && onIcon ? onIcon : icon;

  return (
    <div
      className="relative inline-block z-[0]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hoverText && hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded text-xs text-white bg-black whitespace-nowrap z-10 shadow">
          {hoverText}
        </div>
      )}

      <button
        type="button"
        onClick={handleClick}
        className={effectiveClass}
        disabled={disabled || isLoading}
        aria-pressed={toggle ? isPressed : undefined}
        aria-busy={isLoading || undefined}
      >
        {showIcon && effectiveIcon && (
          <span className={label && !iconOnly ? 'mr-1' : undefined}>{effectiveIcon}</span>
        )}
        {!iconOnly && label && <span>{label}</span>}
      </button>
    </div>
  );
};

export default Button;
