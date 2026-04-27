/**
 * @file ModalShell.tsx
 * @component ModalShell
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Centered modal container with a dimmed backdrop. Used when agent UI is in
 * 'modal' mode.
 *
 * @return {JSX.Element} Modal shell container.
 */
import React from 'react';

const ModalShell: React.FC<{
  children: React.ReactNode;
  size: { w: number; h: number };
  style?: React.CSSProperties;
  expanded?: boolean;
}> = ({ children, size, style, expanded = false }) => {
  // Expanded: fill the overlay container (position: fixed; inset: 0) using
  // position: absolute so corner-offset styles don't fight the inset.
  // Un-expanded: restore the configured size and position.
  const modalStyle: React.CSSProperties = expanded
    ? { position: 'absolute', inset: 20, width: 'auto', height: 'auto', borderRadius: 8 }
    : { width: size.w, height: size.h, ...style };

  return (
    <div className="boomi-agent-overlay boomi-agent-overlay--modal">
      <div className="boomi-agent-overlay__scrim" />
      <div className="boomi-agent-overlay__modal" style={modalStyle}>
        {children}
      </div>
    </div>
  );
};

export default ModalShell;
