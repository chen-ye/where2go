import * as TogglePrimitive from '@radix-ui/react-toggle';
import { forwardRef, type ElementRef, type ComponentPropsWithoutRef } from 'react';
import './Toggle.css';

const Toggle = forwardRef<
  ElementRef<typeof TogglePrimitive.Root>,
  ComponentPropsWithoutRef<typeof TogglePrimitive.Root>
>(({ className, ...props }, ref) => (
  <TogglePrimitive.Root
    className={`ToggleRoot ${className || ''}`}
    {...props}
    ref={ref}
  />
));

Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle };
