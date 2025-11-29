import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import "./Tag.css";

interface TagProps<T extends ElementType = "div"> {
  as?: T;
  children: ReactNode;
  className?: string;
}

export function Tag<T extends ElementType = "div">({
  as,
  children,
  className = "",
  ...props
}: TagProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof TagProps<T>>) {
  const Component = as || "div";
  return (
    <Component className={`tag-pill ${className}`} {...props}>
      {children}
    </Component>
  );
}

interface TagRemoveButtonProps extends ComponentPropsWithoutRef<"button"> {}

export function TagRemoveButton(props: TagRemoveButtonProps) {
  return (
    <button type="button" className="tag-remove" {...props}>
      <X size={12} />
    </button>
  );
}
