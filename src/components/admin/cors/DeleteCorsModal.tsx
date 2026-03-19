import Modal from '../../ui/Modal';

type DeleteCorsModalProps = {
  isOpen: boolean;
  origin: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean;
};

const DeleteCorsModal: React.FC<DeleteCorsModalProps> = ({
  isOpen,
  origin,
  onClose,
  onConfirm,
  isDeleting,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      title="Delete Allowed Origin"
      description="Remove this origin from the allowed list for this tenant."
      onClose={onClose}
      onSubmit={onConfirm}
      submitLabel={isDeleting ? 'Deleting...' : 'Delete'}
      showSaveButton={!isDeleting}
    >
      <p className="text-sm">
        Are you sure you want to remove{' '}
        <span className="font-semibold">{origin}</span> from the allowed origins?
      </p>
    </Modal>
  );
};

export default DeleteCorsModal;
