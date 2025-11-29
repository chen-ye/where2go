import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import "./NewTagButton.css";

interface NewTagButtonProps {
  onSubmit: (tag: string) => void;
  disabled?: boolean;
}

export function NewTagButton({ onSubmit, disabled }: NewTagButtonProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={inputRef}
      className={`add-tag-btn ${isEditing ? 'editing' : ''}`}
      contentEditable={isEditing}
      suppressContentEditableWarning
      onClick={() => {
        if (!isEditing && !disabled) {
          setIsEditing(true);
          setTimeout(() => {
            inputRef.current?.focus();
            // Place cursor at end
            const range = document.createRange();
            const sel = window.getSelection();
            if (inputRef.current?.childNodes.length) {
              range.selectNodeContents(inputRef.current);
              range.collapse(false);
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
          }, 0);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const value = inputRef.current?.textContent?.trim();
          if (value) {
            onSubmit(value);
            inputRef.current!.textContent = '';
            setIsEditing(false);
            inputRef.current?.blur();
          }
        } else if (e.key === 'Escape') {
          inputRef.current!.textContent = '';
          setIsEditing(false);
          inputRef.current?.blur();
        }
      }}
      onBlur={() => {
        if (!inputRef.current?.textContent?.trim()) {
          inputRef.current!.textContent = '';
          setIsEditing(false);
        }
      }}
    >
      {!isEditing && (
        <>
          <Plus size={12} /> New
        </>
      )}
    </div>
  );
}
