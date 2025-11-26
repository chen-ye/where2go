import * as Dialog from '@radix-ui/react-dialog';
import { type ReactNode, useState } from 'react';
import './Dialog.css';

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  trigger?: ReactNode;
  children?: ReactNode;
}

export function PromptDialog({ open, onOpenChange, title, description, defaultValue = '', onSubmit, trigger, children }: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <Dialog.Root open={open} onOpenChange={(open) => {
        if (!open) setValue(defaultValue); // Reset on close
        onOpenChange(open);
    }}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      {children}
      <Dialog.Portal>
        <Dialog.Overlay className="DialogOverlay" />
        <Dialog.Content className="DialogContent">
          <Dialog.Title className="DialogTitle">{title}</Dialog.Title>
          {description && <Dialog.Description className="DialogDescription">{description}</Dialog.Description>}
          <fieldset className="Fieldset">
            <input
              className="Input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                      onSubmit(value);
                      onOpenChange(false);
                  }
              }}
              autoFocus
            />
          </fieldset>
          <div style={{ display: 'flex', marginTop: 25, justifyContent: 'flex-end', gap: 10 }}>
            <Dialog.Close asChild>
              <button className="Button green">Cancel</button>
            </Dialog.Close>
            <button className="Button violet" onClick={() => {
                onSubmit(value);
                onOpenChange(false);
            }}>Submit</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
