/**
 * @file CrtBusyModal.tsx
 * @component CrtBusyModal
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A small centred window shown while a save, a reset or a reload runs. It sits on the same dimmed,
 * full-size backdrop as the other windows, so nothing behind it can be clicked, and it has no close
 * button: it goes away when the work ends. The screen behind it is also inert, so the keyboard cannot
 * reach it either.
 */

export interface CrtBusyModalProps {
  /** What is happening, for example "Saving...". */
  message: string;
}

const CrtBusyModal: React.FC<CrtBusyModalProps> = ({ message }) => (
  <div className="boomi-modal-overlay boomi-crt-busy-overlay" role="alertdialog" aria-modal="true" aria-busy="true" aria-label={message}>
    <div className="boomi-crt-busy-card" role="status">
      <span className="boomi-crt-spin boomi-crt-spin--large" aria-hidden="true" />
      <span className="boomi-crt-busy-text">
        <strong>{message}</strong>
        <span>Please wait. This can take a few seconds.</span>
      </span>
    </div>
  </div>
);

CrtBusyModal.displayName = 'CrtBusyModal';
export default CrtBusyModal;
