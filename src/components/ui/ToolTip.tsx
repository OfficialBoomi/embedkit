/**
 * @file ToolTip.tsx
 * @component Tooltip
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a tooltip that displays a text label when the user hovers over or focuses on
 * the wrapped child element. Useful for providing contextual help or additional information.
 *
 * @return {JSX.Element} The rendered tooltip component.
 */

import { useState } from 'react';

/**
 * @interface TooltipProps
 *
 * @description
 * Props for the `Tooltip` component.
 *
 * @property {string} label - The text displayed inside the tooltip.
 * @property {React.ReactNode} children - The element that will trigger the tooltip when hovered or focused.
 */
interface TooltipProps {
  label: string;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ label, children }) => {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 z-50 shadow whitespace-pre-line max-w-xs">
          {label}
        </span>
      )}
    </span>
  );
};

export default Tooltip;
