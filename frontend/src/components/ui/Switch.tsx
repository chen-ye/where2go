import * as SwitchPrimitive from '@radix-ui/react-switch';
import { forwardRef, type ElementRef, type ComponentPropsWithoutRef } from 'react';
import './Switch.css';

const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    className={`SwitchRoot ${className || ''}`}
    {...props}
    ref={ref}
  >
    <SwitchPrimitive.Thumb className="SwitchThumb" />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
