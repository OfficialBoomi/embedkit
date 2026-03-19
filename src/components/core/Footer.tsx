/**
 * @file Footer.tsx
 * @component Footer
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A simple layout wrapper intended to render footer content within plugin views.
 * Accepts optional children to display inside the footer container.
 *
 * @return {JSX.Element} A div containing the footer content.
 */

import React from 'react';

/**
 * @interface FooterProps
 * 
 * @description
 * Props for the `Footer` component.
 * 
 * @property {React.ReactNode} [children] - Optional content to be rendered inside the footer.
 */
interface FooterProps {
  children?: React.ReactNode;
}

const Footer: React.FC<FooterProps> = ({ children }) => {
  return (
    <div>{children}</div>
  );
};

export default Footer;