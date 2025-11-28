import { type ReactNode, forwardRef } from "react";
import "./BottomPanel.css";

interface BottomPanelProps {
  children: ReactNode;
}

export const BottomPanel = forwardRef<HTMLDivElement, BottomPanelProps>(
  ({ children }, ref) => {
    return (
      <div className="bottom-panel" ref={ref}>
        {children}
      </div>
    );
  }
);
