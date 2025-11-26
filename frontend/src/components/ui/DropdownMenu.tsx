import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import './DropdownMenu.css';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({ children, className, ...props }: DropdownMenuPrimitive.DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content className={`DropdownMenuContent ${className || ''}`} sideOffset={5} {...props}>
        {children}
        <DropdownMenuPrimitive.Arrow className="DropdownMenuArrow" />
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ children, className, ...props }: DropdownMenuPrimitive.DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item className={`DropdownMenuItem ${className || ''}`} {...props}>
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export const DropdownMenuSeparator = () => <DropdownMenuPrimitive.Separator className="DropdownMenuSeparator" />;
export const DropdownMenuLabel = ({ children }: { children: ReactNode }) => <DropdownMenuPrimitive.Label className="DropdownMenuLabel">{children}</DropdownMenuPrimitive.Label>;
