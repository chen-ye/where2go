import * as Checkbox from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import "./CheckboxCard.css";

interface CheckboxCardProps {
  id: string;
  name: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  thumbnail?: string;
}

export function CheckboxCard({ id, name, checked, onCheckedChange, thumbnail }: CheckboxCardProps) {
  return (
    <div
      className={`layer-card checkbox-card ${checked ? "checked" : ""}`}
      onClick={() => onCheckedChange(!checked)}
    >
      <div
        className="layer-card-header"
        style={thumbnail ? { backgroundImage: `url(${thumbnail})` } : undefined}
      >
        <Checkbox.Root
          className="layer-checkbox"
          checked={checked}
          onCheckedChange={(c) => onCheckedChange(c === true)}
          id={id}
        >
          <Checkbox.Indicator className="checkbox-indicator">
            <Check size={12} />
          </Checkbox.Indicator>
        </Checkbox.Root>
      </div>
      <span className="layer-card-label">{name}</span>
    </div>
  );
}
