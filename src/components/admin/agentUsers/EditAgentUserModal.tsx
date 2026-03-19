import { useEffect, useState } from 'react';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';

export type EditAgentUserPayload = {
  userId: string;
  boomiAccountId: string;
  boomiApiUserName: string;
  boomiApiToken?: string;
  label?: string;
};

type EditAgentUserModalProps = {
  isOpen: boolean;
  userId: string | null;
  boomiAccountId?: string | null;
  boomiApiUserName?: string | null;
  label?: string | null;
  onClose: () => void;
  onSubmit: (payload: EditAgentUserPayload) => Promise<void> | void;
  isSaving?: boolean;
};

const EditAgentUserModal: React.FC<EditAgentUserModalProps> = ({
  isOpen,
  userId,
  boomiAccountId,
  boomiApiUserName,
  label,
  onClose,
  onSubmit,
  isSaving,
}) => {
  const [nameValue, setNameValue] = useState('');
  const [boomiAccountValue, setBoomiAccountValue] = useState('');
  const [userNameValue, setUserNameValue] = useState('');
  const [userTokenValue, setUserTokenValue] = useState('');
  const [errors, setErrors] = useState<{ boomiAccountId?: string; userName?: string }>({});

  useEffect(() => {
    if (isOpen) {
      setNameValue(label ?? '');
      setBoomiAccountValue(boomiAccountId ?? '');
      setUserNameValue(boomiApiUserName ?? '');
      setUserTokenValue('');
      setErrors({});
    }
  }, [isOpen, label, boomiApiUserName, boomiAccountId]);

  const handleSubmit = async () => {
    if (!userId) return;

    const nextErrors: typeof errors = {};
    if (!boomiAccountValue.trim()) nextErrors.boomiAccountId = 'Boomi account ID is required';
    if (!userNameValue.trim()) nextErrors.userName = 'Boomi API username is required';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    await onSubmit({
      userId,
      boomiAccountId: boomiAccountValue.trim(),
      boomiApiUserName: userNameValue.trim(),
      ...(userTokenValue.trim() ? { boomiApiToken: userTokenValue.trim() } : {}),
      label: nameValue.trim() || undefined,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Edit User"
      description="Update the Boomi credentials for this user mapping."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isSaving ? 'Saving...' : 'Save Changes'}
      showSaveButton={!isSaving}
    >
      <Input
        formName="agentUserEdit"
        label="Name"
        required={false}
        inputName="name"
        readOnly={false}
        value={nameValue}
        onChange={(e) => setNameValue(e.target.value)}
        placeholder="Jane Doe"
      />

      <Input
        formName="agentUserEdit"
        label="User ID"
        required
        inputName="userId"
        readOnly
        value={userId ?? ''}
        onChange={() => undefined}
        helperText="User ID cannot be changed."
      />

      <Input
        formName="agentUserEdit"
        label="Boomi Account ID"
        required
        inputName="boomiAccountId"
        readOnly={false}
        value={boomiAccountValue}
        onChange={(e) => setBoomiAccountValue(e.target.value)}
        placeholder="boomi-account-123"
        helperText="The Boomi account ID to use for this user mapping."
        error={errors.boomiAccountId}
      />

      <Input
        formName="agentUserEdit"
        label="Boomi API Username"
        required
        inputName="boomiApiUserName"
        readOnly={false}
        value={userNameValue}
        onChange={(e) => setUserNameValue(e.target.value)}
        placeholder="api-user@example.com"
        error={errors.userName}
      />

      <Input
        formName="agentUserEdit"
        label="Boomi API Token"
        required={false}
        inputName="boomiApiToken"
        readOnly={false}
        type="password"
        value={userTokenValue}
        onChange={(e) => setUserTokenValue(e.target.value)}
        placeholder="••••••••"
        helperText="Token is already set. Enter a new value to replace it."
      />
    </Modal>
  );
};

export default EditAgentUserModal;
