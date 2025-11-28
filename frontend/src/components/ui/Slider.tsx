import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import "./Slider.css";

interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

export function Slider({
  value,
  onValueChange,
  label,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
}: SliderProps) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  return (
    <div className="slider-container">
      <div className="slider-header">
        <label className="slider-label">{label}</label>
      </div>
      <SliderPrimitive.Root
        className="slider-root"
        value={[value]}
        onValueChange={(vals) => onValueChange(vals[0])}
        max={max}
        min={min}
        step={step}
        disabled={disabled}
        onPointerDown={() => setShowTooltip(true)}
        onPointerUp={() => setShowTooltip(false)}
      >
        <SliderPrimitive.Track className="slider-track">
          <SliderPrimitive.Range className="slider-range" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="slider-thumb" aria-label={label}>
          {showTooltip && (
            <div className="slider-tooltip">
              {value}
            </div>
          )}
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Root>
    </div>
  );
}
