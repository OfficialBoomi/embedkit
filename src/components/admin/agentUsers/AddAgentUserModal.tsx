import { useEffect, useState } from 'react';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';

export type AddAgentUserPayload = {
  userId: string;
  boomiAccountId: string;
  boomiApiUserName: string;
  boomiApiToken: string;
  label?: string;
};

type AddAgentUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: AddAgentUserPayload) => Promise<void> | void;
  isSaving?: boolean;
};

const AddAgentUserModal: React.FC<AddAgentUserModalProps> = ({ isOpen, onClose, onSubmit, isSaving }) => {
  const [userId, setUserId] = useState('');
  const [boomiAccountId, setBoomiAccountId] = useState('');
  const [userName, setUserName] = useState('');
  const [userToken, setUserToken] = useState('');
  const [label, setLabel] = useState('');
  const [errors, setErrors] = useState<{ userId?: string; boomiAccountId?: string; userName?: string; userToken?: string }>({});

  useEffect(() => {
    if (isOpen) {
      setUserId('');
      setBoomiAccountId('');
      setUserName('');
      setUserToken('');
      setLabel('');
      setErrors({});
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    const nextErrors: typeof errors = {};
    if (!userId.trim()) nextErrors.userId = 'User ID is required';
    if (!boomiAccountId.trim()) nextErrors.boomiAccountId = 'Boomi account ID is required';
    if (!userName.trim()) nextErrors.userName = 'Boomi API username is required';
    if (!userToken.trim()) nextErrors.userToken = 'Boomi API token is required';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    await onSubmit({
      userId: userId.trim(),
      boomiAccountId: boomiAccountId.trim(),
      boomiApiUserName: userName.trim(),
      boomiApiToken: userToken.trim(),
      label: label.trim() || undefined,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Add User"
      description="Map a user_id from your system to Boomi credentials."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isSaving ? 'Saving...' : 'Create User'}
      showSaveButton={!isSaving}
    >
      <Input
        formName="agentUserAdd"
        label="Name"
        required={false}
        inputName="name"
        readOnly={false}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Jane Doe"
      />

      <Input
        formName="agentUserAdd"
        label="User ID"
        required
        inputName="userId"
        readOnly={false}
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        placeholder="user_456"
        helperText="This is the user ID from your system. It cannot be changed later."
        error={errors.userId}
      />

      <Input
        formName="agentUserAdd"
        label="Boomi Account ID"
        required
        inputName="boomiAccountId"
        readOnly={false}
        value={boomiAccountId}
        onChange={(e) => setBoomiAccountId(e.target.value)}
        placeholder="boomi-account-123"
        helperText="The Boomi account ID to use for this user mapping."
        error={errors.boomiAccountId}
      />

      <Input
        formName="agentUserAdd"
        label="Boomi API Username"
        required
        inputName="boomiApiUserName"
        readOnly={false}
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
        placeholder="api-user@example.com"
        error={errors.userName}
      />

      <Input
        formName="agentUserAdd"
        label="Boomi API Token"
        required
        inputName="boomiApiToken"
        readOnly={false}
        type="password"
        value={userToken}
        onChange={(e) => setUserToken(e.target.value)}
        placeholder="token_xxx"
        error={errors.userToken}
      />
    </Modal>
  );
};

export default AddAgentUserModal;
