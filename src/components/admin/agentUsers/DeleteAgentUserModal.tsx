import Modal from '../../ui/Modal';

type DeleteAgentUserModalProps = {
  isOpen: boolean;
  userId: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean;
};

const DeleteAgentUserModal: React.FC<DeleteAgentUserModalProps> = ({
  isOpen,
  userId,
  onClose,
  onConfirm,
  isDeleting,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      title="Delete User"
      description="Remove this user mapping and its Boomi credentials."
      onClose={onClose}
      onSubmit={onConfirm}
      submitLabel={isDeleting ? 'Deleting...' : 'Delete'}
      showSaveButton={!isDeleting}
    >
      <p className="text-sm">
        Are you sure you want to delete mapping for{' '}
        <span className="font-semibold">{userId}</span>?
      </p>
    </Modal>
  );
};

export default DeleteAgentUserModal;
