/**
 * @file CrtSaveScopeModal.tsx
 * @component CrtSaveScopeModal
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The confirmation for saving a shared table to other processes, in three stages:
 *
 * - choose: lists every other process that uses the table with what will happen there, a checkbox
 *   each (all ticked, except a process that already holds exactly these values, which has nothing to
 *   change), and a confirm button that shows how many processes will be written, this one included;
 * - running: the saves run one after the other and each process shows its own state; nothing can be
 *   closed or changed;
 * - done: every process shows saved or failed with the reason. Nothing is rolled back, so a failure
 *   leaves the processes that did save as they are; failed ones can be retried, except a process that
 *   was changed by someone else (its line says to reload the table), which a retry could not fix.
 *
 * The component only shows state. The screen runs the saves and passes progress in.
 *
 * It is a modal window for the keyboard too (see CrtModalFrame): it has a name, Tab stays inside, and
 * Escape closes it in the choose and done stages, never while the saves run. Focus goes to the first
 * checkbox that can be changed when the window opens (the confirm button when none can), to the window
 * itself while the saves run, and to the Close button once they are done. The screen behind it is inert.
 */

import { useEffect, useState } from 'react';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import CrtModalFrame from './CrtModalFrame';

/** What will happen in one other process, worked out by the screen before asking. */
export interface CrtScopeTarget {
  processId: string;
  processName: string;
  /** A sentence such as "Has its own different rows, which will be replaced." */
  text: string;
  /** False when the process already holds exactly these values: listed, but not ticked or selectable. */
  willChange: boolean;
}

export type CrtScopeRunState = 'waiting' | 'saving' | 'saved' | 'failed';

/** One line of the running and done stages. The process being saved from comes first. */
export interface CrtScopeProgress {
  processId: string;
  processName: string;
  state: CrtScopeRunState;
  /** The reason, for a failed process. */
  message?: string;
  /**
   * For a failed process: false when saving again cannot work (it was changed by someone else, so the
   * same attempt would fail the same way). Left out, a failed process can be retried.
   */
  retryable?: boolean;
}

export type CrtScopeStage = 'choose' | 'running' | 'done';

export interface CrtSaveScopeModalProps {
  isOpen: boolean;
  /** A reset restores defaults instead of saving rows; the wording changes, the flow does not. */
  mode: 'save' | 'reset';
  tableName: string;
  thisProcessName: string;
  targets: CrtScopeTarget[];
  stage: CrtScopeStage;
  progress: CrtScopeProgress[];
  /** The other processes the user ticked. This process is always written too. */
  onConfirm: (otherProcessIds: string[]) => void;
  onRetryFailed: () => void;
  onClose: () => void;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * Where focus goes in each stage. Choose: the first checkbox that can be changed, else the confirm button
 * (the last button of the row). Running: nothing, so the window itself takes it. Done: Close, the last button.
 */
function focusForStage(stage: CrtScopeStage): (dialog: HTMLElement) => HTMLElement | null {
  return (dialog) => {
    if (stage === 'running') return null;
    const lastButton = (): HTMLElement | null => {
      const buttons = dialog.querySelectorAll<HTMLElement>('.boomi-crt-scope-actions button');
      return buttons.length > 0 ? buttons[buttons.length - 1] : null;
    };
    if (stage === 'done') return lastButton();
    return dialog.querySelector<HTMLElement>('.boomi-crt-scope-item input[type="checkbox"]:not(:disabled)') ?? lastButton();
  };
}

const STATE_LABEL: Record<CrtScopeRunState, string> = {
  waiting: 'Waiting',
  saving: 'Saving...',
  saved: 'Saved',
  failed: 'Failed',
};

const CrtSaveScopeModal: React.FC<CrtSaveScopeModalProps> = ({
  isOpen,
  mode,
  tableName,
  thisProcessName,
  targets,
  stage,
  progress,
  onConfirm,
  onRetryFailed,
  onClose,
}) => {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  // Every process that has something to change starts ticked, each time the confirmation opens.
  useEffect(() => {
    if (isOpen && stage === 'choose') {
      setTicked(new Set(targets.filter((t) => t.willChange).map((t) => t.processId)));
    }
  }, [isOpen, stage, targets]);

  if (!isOpen) return null;

  const reset = mode === 'reset';
  const title = reset ? 'Restore defaults in other processes' : 'Save to other processes';
  const description =
    stage === 'choose'
      ? reset
        ? `${tableName} is also used by the processes below. Choose where its default values should be restored as well as in ${thisProcessName}.`
        : `${tableName} is also used by the processes below. Choose where to save these values as well as in ${thisProcessName}. Each process keeps its own copy.`
      : stage === 'running'
        ? 'Working through the processes one after another. Please keep this window open.'
        : 'Each process was handled on its own. Nothing is rolled back if one failed.';

  const toggle = (processId: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(processId)) next.delete(processId);
      else next.add(processId);
      return next;
    });

  const chosen = targets.filter((t) => t.willChange && ticked.has(t.processId)).map((t) => t.processId);
  const total = chosen.length + 1;
  const confirmLabel = reset
    ? `Restore defaults in ${plural(total, 'process', 'processes')}`
    : `Save to ${plural(total, 'process', 'processes')}`;
  // A process that was changed by someone else cannot be saved again with the same attempt, so it is not counted.
  const failed = progress.filter((p) => p.state === 'failed' && p.retryable !== false).length;
  const closable = stage !== 'running';

  return (
    <CrtModalFrame
      label={title}
      onClose={closable ? onClose : undefined}
      focusKey={stage}
      initialFocus={focusForStage(stage)}
    >
      <Modal
        isOpen
        title={title}
        description={description}
        onClose={closable ? onClose : () => {}}
        showSaveButton={false}
        showCancelButton={false}
      >
        <div className="boomi-crt-scope">
          {stage === 'choose' && (
            <ul className="boomi-crt-scope-list" aria-label="Processes that share this table">
              {targets.map((t) => {
                const id = `crt-scope-${t.processId}`;
                return (
                  <li key={t.processId} className="boomi-crt-scope-item">
                    <input
                      id={id}
                      type="checkbox"
                      checked={t.willChange && ticked.has(t.processId)}
                      disabled={!t.willChange}
                      onChange={() => toggle(t.processId)}
                    />
                    <label htmlFor={id}>
                      <span className="boomi-crt-scope-name">{t.processName}</span>
                      <span className="boomi-crt-scope-text">{t.text}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {stage !== 'choose' && (
            <ul className="boomi-crt-scope-list" aria-live="polite" aria-label="Progress">
              {progress.map((p) => (
                <li key={p.processId} className={`boomi-crt-scope-item boomi-crt-scope-item--${p.state}`}>
                  <span className="boomi-crt-scope-state" aria-hidden="true">
                    {p.state === 'saving' ? (
                      <span className="boomi-crt-spin" />
                    ) : p.state === 'saved' ? (
                      '✓'
                    ) : p.state === 'failed' ? (
                      '!'
                    ) : (
                      ''
                    )}
                  </span>
                  <span className="boomi-crt-scope-body">
                    <span className="boomi-crt-scope-name">{p.processName}</span>
                    <span className="boomi-crt-scope-text">
                      {STATE_LABEL[p.state]}
                      {p.state === 'failed' && p.message ? `: ${p.message}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="boomi-crt-scope-actions">
            {stage === 'choose' && (
              <>
                <Button toggle={false} primary={false} showIcon={false} label="Cancel" onClick={onClose} />
                <Button
                  toggle={false}
                  primary={true}
                  showIcon={false}
                  label={confirmLabel}
                  onClick={() => onConfirm(chosen)}
                />
              </>
            )}
            {stage === 'done' && (
              <>
                {failed > 0 && (
                  <Button
                    toggle={false}
                    primary={false}
                    showIcon={false}
                    label={`Retry ${plural(failed, 'failed process', 'failed processes')}`}
                    onClick={onRetryFailed}
                  />
                )}
                <Button toggle={false} primary={true} showIcon={false} label="Close" onClick={onClose} />
              </>
            )}
          </div>
        </div>
      </Modal>
    </CrtModalFrame>
  );
};

CrtSaveScopeModal.displayName = 'CrtSaveScopeModal';
export default CrtSaveScopeModal;
