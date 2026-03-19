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
}> = ({ children, size, style }) => {
  return (
    <div className="boomi-agent-overlay boomi-agent-overlay--modal">
      <div className="boomi-agent-overlay__scrim" />
      <div className="boomi-agent-overlay__modal" style={{ width: size.w, height: size.h, ...style }}>
        {children}
      </div>
    </div>
  );
};

export default ModalShell;
