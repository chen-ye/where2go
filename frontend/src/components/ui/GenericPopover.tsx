import * as Popover from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import "./GenericPopover.css";

interface GenericPopoverProps {
  trigger: ReactNode;
  content: ReactNode;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function GenericPopover({
  trigger,
  content,
  align = "center",
  sideOffset = 5,
  className = "",
  open,
  onOpenChange,
}: GenericPopoverProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={`generic-popover-content ${className}`}
          align={align}
          sideOffset={sideOffset}
        >
          {content}
          <Popover.Arrow className="generic-popover-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
