import { useEffect, useState } from 'react';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';

type EditCorsModalProps = {
  isOpen: boolean;
  origin: string | null;
  onClose: () => void;
  onSubmit: (nextOrigin: string) => Promise<void> | void;
  isSaving?: boolean;
  serverError?: string | null;
};

const EditCorsModal: React.FC<EditCorsModalProps> = ({
  isOpen,
  origin,
  onClose,
  onSubmit,
  isSaving,
  serverError,
}) => {
  const [value, setValue] = useState(origin ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(origin ?? '');
      setError(null);
    }
  }, [isOpen, origin]);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Origin is required');
      return;
    }
    setError(null);
    await onSubmit(trimmed);
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Edit Allowed Origin"
      description="Update the selected origin for this tenant."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isSaving ? 'Saving...' : 'Save Changes'}
      showSaveButton={!isSaving}
    >
      <Input
        formName="corsEdit"
        label="Origin"
        required
        inputName="origin"
        readOnly={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://app.example.com"
        helperText={'Use "null" to allow file:// and sandboxed iframe origins.'}
        error={error || serverError || undefined}
      />
    </Modal>
  );
};

export default EditCorsModal;
