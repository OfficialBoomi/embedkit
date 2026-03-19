import { useEffect, useState } from 'react';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';

type RedisKeyEditModalProps = {
  isOpen: boolean;
  isSaving?: boolean;
  canEdit?: boolean;
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
    editable?: boolean;
  } | null;
  onClose: () => void;
  onSubmit: (payload: { key: string; value: string; ttlSeconds?: number }) => Promise<void> | void;
};

const RedisKeyEditModal: React.FC<RedisKeyEditModalProps> = ({
  isOpen,
  isSaving,
  canEdit = true,
  revealEnabled = false,
  isRevealed = false,
  onReveal,
  onActivity,
  details,
  onClose,
  onSubmit,
}) => {
  const [value, setValue] = useState('');
  const [ttl, setTtl] = useState('');
  const [valueError, setValueError] = useState<string | null>(null);
  const [ttlError, setTtlError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(details?.value ?? '');
      setTtl(details?.ttl === null || details?.ttl === undefined ? '' : String(details.ttl));
      setValueError(null);
      setTtlError(null);
    }
  }, [isOpen, details]);

  const handleSubmit = async () => {
    if (!details?.key || !canEdit) return;
    const trimmed = value;
    if (!trimmed) {
      setValueError('Value is required');
      return;
    }
    const ttlSeconds = ttl.trim() ? Number(ttl) : undefined;
    if (ttlSeconds !== undefined && (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0)) {
      setTtlError('TTL must be a positive number');
      return;
    }
    setValueError(null);
    setTtlError(null);
    await onSubmit({ key: details.key, value: trimmed, ttlSeconds });
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Edit Redis Key"
      description="Update the selected Redis key value and TTL."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isSaving ? 'Saving...' : 'Save Changes'}
      showSaveButton={canEdit && !isSaving}
    >
      <div onMouseMove={onActivity} onKeyDown={onActivity}>
        <Input
          formName="redisKeyEdit"
          label="Key"
          required
          inputName="key"
          readOnly
          value={details?.key ?? ''}
          onChange={() => {}}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            formName="redisKeyEdit"
            label="Type"
            required
            inputName="type"
            readOnly
            value={details?.type ?? ''}
            onChange={() => {}}
          />
          <Input
            formName="redisKeyEdit"
            label="TTL (seconds)"
            required={false}
            inputName="ttl"
            readOnly={!canEdit}
            type="number"
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
            helperText="Leave empty to keep the current TTL."
            error={ttlError || undefined}
          />
        </div>
        <Input
          formName="redisKeyEdit"
          label="Redis type"
          required
          inputName="redisType"
          readOnly
          value={details?.redisType ?? ''}
          onChange={() => {}}
        />
        <div>
          <div className="flex items-center justify-between">
            <label className="boomi-form-label">
              Value
              <span className="boomi-form-required">*</span>
            </label>
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
            className={[
              'boomi-input w-full rounded-md p-2 min-h-[160px]',
              !canEdit ? 'boomi-input--readonly' : '',
            ].join(' ')}
            readOnly={!canEdit}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {valueError && <p className="boomi-form-error">{valueError}</p>}
          {!canEdit && (
            <p className="boomi-form-helper">
              This key is read-only or not supported for edits.
            </p>
          )}
          {revealEnabled && !isRevealed && (
            <p className="boomi-form-helper">
              Reveal tenant credentials to edit.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default RedisKeyEditModal;
