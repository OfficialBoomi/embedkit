import { useState, useEffect } from 'react';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';

type AddCorsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (origin: string) => Promise<void> | void;
  isSaving?: boolean;
  serverError?: string | null;
};

const AddCorsModal: React.FC<AddCorsModalProps> = ({ isOpen, onClose, onSubmit, isSaving, serverError }) => {
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setOrigin('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    const trimmed = origin.trim();
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
      title="Add Allowed Origin"
      description="Add a new origin to the allowed list for this tenant."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isSaving ? 'Saving...' : 'Add Origin'}
      showSaveButton={!isSaving}
    >
      <Input
        formName="corsAdd"
        label="Origin"
        required
        inputName="origin"
        readOnly={false}
        value={origin}
        onChange={(e) => setOrigin(e.target.value)}
        placeholder="https://app.example.com"
        helperText={'Use "null" to allow file:// and sandboxed iframe origins.'}
        error={error || serverError || undefined}
      />
    </Modal>
  );
};

export default AddCorsModal;
