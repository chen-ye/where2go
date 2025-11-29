import { X } from "lucide-react";
import "./Tag.css";

interface TagProps {
  tag: string;
  onRemove: () => void;
  disabled?: boolean;
}

export function Tag({ tag, onRemove, disabled }: TagProps) {
  return (
    <div className="tag-pill">
      {tag}
      <button
        type="button"
        className="tag-remove"
        disabled={disabled}
        onClick={onRemove}
      >
        <X size={12} />
      </button>
    </div>
  );
}
