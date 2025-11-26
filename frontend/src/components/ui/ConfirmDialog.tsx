import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import './Dialog.css'; // We'll create this for shared styles

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onConfirm: () => void;
  trigger?: ReactNode;
  children?: ReactNode; // For custom trigger if needed
}

export function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, trigger, children }: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      {children}
      <Dialog.Portal>
        <Dialog.Overlay className="DialogOverlay" />
        <Dialog.Content className="DialogContent">
          <Dialog.Title className="DialogTitle">{title}</Dialog.Title>
          {description && <Dialog.Description className="DialogDescription">{description}</Dialog.Description>}
          <div style={{ display: 'flex', marginTop: 25, justifyContent: 'flex-end', gap: 10 }}>
            <Dialog.Close asChild>
              <button className="Button green">Cancel</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button className="Button red" onClick={onConfirm}>Confirm</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
