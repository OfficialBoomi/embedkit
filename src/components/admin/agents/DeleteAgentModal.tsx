import Modal from '../../ui/Modal';

type DeleteAgentModalProps = {
  isOpen: boolean;
  agentId: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean;
};

const DeleteAgentModal: React.FC<DeleteAgentModalProps> = ({
  isOpen,
  agentId,
  onClose,
  onConfirm,
  isDeleting,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      title="Delete Agent"
      description="Remove this agent and all associated public tokens."
      onClose={onClose}
      onSubmit={onConfirm}
      submitLabel={isDeleting ? 'Deleting...' : 'Delete'}
      showSaveButton={!isDeleting}
    >
      <p className="text-sm">
        Are you sure you want to delete{' '}
        <span className="font-semibold">{agentId}</span>?
      </p>
    </Modal>
  );
};

export default DeleteAgentModal;
