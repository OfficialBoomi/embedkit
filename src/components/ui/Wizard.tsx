/**
 * @file Wizard.tsx
 * @component Wizard
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a multi-step wizard interface with labeled steps, navigation controls,
 * and optional alternate actions. Supports controlling the active page, the number
 * of steps displayed at once, and rendering custom content for each step.
 *
 * @return {JSX.Element} The rendered wizard component.
 */

import { useState, useEffect } from 'react';
import Button from '../ui/Button';

/**
 * @interface WizardProps
 *
 * @description
 * Props for the `Wizard` component.
 *
 * @property {number} numPagesToShow - Number of pages/steps to display at once in the navigation.
 * @property {number} activePage - The index of the currently active page.
 * @property {string[]} labels - Labels for each wizard step.
 * @property {React.JSX.Element[]} wizardPages - The JSX content for each wizard page.
 * @property {boolean} [hasAlternateAction] - Whether the wizard includes an alternate action button.
 * @property {number} [showAlternateActionIndex] - The step index at which to show the alternate action button.
 * @property {string} [alternateActionButtonText] - The label text for the alternate action button.
 * @property {() => void} onContinue - Callback invoked when continuing to the next step.
 * @property {() => void} onCancel - Callback invoked when canceling the wizard.
 * @property {() => void} [onAlternateAction] - Optional callback for when the alternate action button is clicked.
 */
interface WizardProps {
  numPagesToShow: number;
  activePage: number;
  labels: string[];
  wizardPages: React.JSX.Element[];
  hasAlternateAction?: boolean;
  showAlternateActionIndex?: number;
  alternateActionButtonText?: string;
  onContinue: () => void;
  onCancel: () => void;
  onAlternateAction?: () => void;
}

const Wizard: React.FC<WizardProps> = ({
  numPagesToShow,
  activePage: initialActivePage,
  labels,
  wizardPages,
  hasAlternateAction,
  showAlternateActionIndex,
  alternateActionButtonText,
  onContinue,
  onCancel,
  onAlternateAction
}) => {
  const [activePage, setActivePage] = useState(initialActivePage);
  const pagesToShow = wizardPages.slice(0, numPagesToShow);
  useEffect(() => setActivePage(initialActivePage), [initialActivePage]);

  return (
    <div className="boomi-wizard">
      {numPagesToShow > 1 && (
        <ul className="boomi-steps">
          {Array.from({ length: numPagesToShow }).map((_, index) => {
            const isActive = activePage === index;
            const isCompleted = index < activePage;
            return (
              <li
                key={index}
                className={[
                  'boomi-step',
                  index !== numPagesToShow - 1 ? 'boomi-step--with-connector' : '',
                  isActive ? 'boomi-step--active' : '',
                  isCompleted ? 'boomi-step--completed' : ''
                ].join(' ')}
              >
                <div className="boomi-step-row">
                  <span className="boomi-step-dot">{index + 1}</span>
                  <div className="boomi-step-connector" />
                </div>
                <div className="boomi-step-label">
                  {labels[index] || `Step ${index + 1}`}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="boomi-wizard-card">
        {pagesToShow.map((page, index) => (
          <div
            key={index}
            className={`step-content step-${index + 1} ${activePage === index ? 'block' : 'hidden'}`}
          >
            {/* Top link row (optional) */}
            <div className="boomi-wizard-links">
              <div className="boomi-wizard-link-left">
                <a onClick={onCancel} role="button" tabIndex={0} className="boomi-wizard-link">
                  {activePage === 0 ? '<< Cancel' : '<< Back'}
                </a>
              </div>
              <div className="boomi-wizard-link-right">
                <a onClick={onContinue} role="button" tabIndex={0} className="boomi-wizard-link-strong">
                  {'Next >>'}
                </a>
              </div>
            </div>
            {page}
            <div className="boomi-wizard-actions">
              <div className="flex-1">
                <Button
                  toggle={false}
                  primary={false}
                  showIcon={false}
                  label={activePage === 0 ? 'Cancel' : 'Back'}
                  onClick={onCancel}
                />
              </div>
              <div className="flex justify-end pr-2">
                {hasAlternateAction && showAlternateActionIndex === activePage && (
                  <div className="pr-4">
                    <Button
                      toggle={false}
                      primary={false}
                      showIcon={false}
                      label={alternateActionButtonText}
                      onClick={onAlternateAction}
                    />
                  </div>
                )}
                <Button
                  toggle={false}
                  primary={true}
                  showIcon={false}
                  label={activePage === (numPagesToShow - 1) ? 'Save and Close' : 'Next'}
                  onClick={onContinue}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Wizard;

