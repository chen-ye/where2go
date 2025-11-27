import type { ReactNode } from "react";
import "./BottomPanel.css";

interface BottomPanelProps {
  children: ReactNode;
}

export function BottomPanel({ children }: BottomPanelProps) {
  return <div className="bottom-panel">{children}</div>;
}
