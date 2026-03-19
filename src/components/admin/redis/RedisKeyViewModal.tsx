import { useEffect, useState } from 'react';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';

type RedisKeyViewModalProps = {
  isOpen: boolean;
  isLoading?: boolean;
  revealEnabled?: boolean;
  isRevealed?: boolean;
  onReveal?: () => void;
  onActivity?: () => void;
  details?: {
    key: string;
    type: string;
    ttl: number | null;
    redisType: string;
    value: string | null;
  } | null;
  onClose: () => void;
};

const RedisKeyViewModal: React.FC<RedisKeyViewModalProps> = ({
  isOpen,
  isLoading,
  revealEnabled = false,
  isRevealed = false,
  onReveal,
  onActivity,
  details,
  onClose,
}) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (isOpen) {
      setValue(details?.value ?? '');
    }
  }, [isOpen, details]);

  return (
    <Modal
      isOpen={isOpen}
      title="View Cache Key"
      description="Read-only view of the selected key."
      onClose={onClose}
      showSaveButton={false}
    >
      <div onMouseMove={onActivity} onKeyDown={onActivity}>
        <Input
          formName="redisKeyView"
          label="Key"
          required
          inputName="key"
          readOnly
          value={details?.key ?? ''}
          onChange={() => {}}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            formName="redisKeyView"
            label="Type"
            required
            inputName="type"
            readOnly
            value={details?.type ?? ''}
            onChange={() => {}}
          />
          <Input
            formName="redisKeyView"
            label="TTL (seconds)"
            required
            inputName="ttl"
            readOnly
            value={details?.ttl === null || details?.ttl === undefined ? 'n/a' : String(details.ttl)}
            onChange={() => {}}
          />
        </div>
        <Input
          formName="redisKeyView"
          label="Redis type"
          required
          inputName="redisType"
          readOnly
          value={details?.redisType ?? ''}
          onChange={() => {}}
        />
        <div>
        <div className="flex items-center justify-between">
          <label className="boomi-form-label">Value</label>
          {revealEnabled && !isRevealed && (
            <div className="py-4">
              <button
                type="button"
                className="boomi-btn-secondary ml-3 px-3 py-1.5 rounded-md text-xs font-semibold border"
                onClick={onReveal}
              >
                Reveal
                </button>
            </div>
          )}
          </div>
          <textarea
            className="boomi-input w-full rounded-md p-2 min-h-[140px] boomi-input--readonly"
            readOnly
            value={isLoading ? 'Loading...' : value}
          />
          {revealEnabled && !isRevealed && (
            <p className="boomi-form-helper">
              Click reveal to show tenant credentials.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default RedisKeyViewModal;
