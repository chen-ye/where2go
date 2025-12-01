import { useState, useEffect } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import './DistanceSlider.css';
import { METERS_TO_MILES } from '../utils/geo';

interface DistanceSliderProps {
  min: number; // in meters
  max: number; // in meters
  value: [number, number]; // in meters
  onChange: (value: [number, number]) => void;
}

export function DistanceSlider({ min, max, value, onChange }: DistanceSliderProps) {
  const [localMin, setLocalMin] = useState(Math.round(value[0] * METERS_TO_MILES));
  const [localMax, setLocalMax] = useState(Math.round(value[1] * METERS_TO_MILES));
  const [inputMin, setInputMin] = useState<string>(Math.round(value[0] * METERS_TO_MILES).toString());
  const [inputMax, setInputMax] = useState<string>(Math.round(value[1] * METERS_TO_MILES).toString());

  // Sync with prop changes
  // Sync with prop changes
  useEffect(() => {
    const newMin = Math.round(value[0] * METERS_TO_MILES);
    const newMax = Math.round(value[1] * METERS_TO_MILES);
    setLocalMin(newMin);
    setLocalMax(newMax);
    setInputMin(newMin.toString());
    setInputMax(newMax.toString());
  }, [value]);

  const minMiles = Math.round(min * METERS_TO_MILES);
  const maxMiles = Math.round(max * METERS_TO_MILES);

  const handleSliderChange = (values: number[]) => {
    setLocalMin(values[0]);
    setLocalMax(values[1]);
    setInputMin(values[0].toString());
    setInputMax(values[1].toString());
    onChange([values[0] / METERS_TO_MILES, values[1] / METERS_TO_MILES]);
  };

  const commitMinChange = () => {
    let val = parseInt(inputMin);
    if (isNaN(val)) val = minMiles;
    // Clamp to global bounds
    val = Math.max(minMiles, Math.min(val, maxMiles));

    // Push max if needed
    const newMax = Math.max(val, localMax);

    setLocalMin(val);
    setLocalMax(newMax);
    setInputMin(val.toString());
    setInputMax(newMax.toString());
    onChange([val / METERS_TO_MILES, newMax / METERS_TO_MILES]);
  };

  const commitMaxChange = () => {
    let val = parseInt(inputMax);
    if (isNaN(val)) val = maxMiles;
    // Clamp to global bounds
    val = Math.max(minMiles, Math.min(val, maxMiles));

    // Push min if needed
    const newMin = Math.min(val, localMin);

    setLocalMin(newMin);
    setLocalMax(val);
    setInputMin(newMin.toString());
    setInputMax(val.toString());
    onChange([newMin / METERS_TO_MILES, val / METERS_TO_MILES]);
  };

  const handleKeyDown = (e: React.KeyboardEvent, type: 'min' | 'max') => {
    if (e.key === 'Enter') {
      if (type === 'min') commitMinChange();
      else commitMaxChange();
    }
  };



  return (
    <div className="distance-slider">
      <div className="distance-inputs">
        <div className="distance-input-group">
          <label htmlFor="distance-min">Min</label>
          <input
            id="distance-min"
            type="number"
            min={minMiles}
            max={maxMiles}
            value={inputMin}
            onChange={(e) => setInputMin(e.target.value)}
            onBlur={commitMinChange}
            onKeyDown={(e) => handleKeyDown(e, 'min')}
          />
          <span className="distance-unit">mi</span>
        </div>
        <div className="distance-input-group">
          <label htmlFor="distance-max">Max</label>
          <input
            id="distance-max"
            type="number"
            min={minMiles}
            max={maxMiles}
            value={inputMax}
            onChange={(e) => setInputMax(e.target.value)}
            onBlur={commitMaxChange}
            onKeyDown={(e) => handleKeyDown(e, 'max')}
          />
          <span className="distance-unit">mi</span>
        </div>
      </div>
      <SliderPrimitive.Root
        className="distance-slider-root"
        value={[localMin, localMax]}
        onValueChange={handleSliderChange}
        min={minMiles}
        max={maxMiles}
        step={1}
        minStepsBetweenThumbs={1}
      >
        <SliderPrimitive.Track className="distance-slider-track">
          <SliderPrimitive.Range className="distance-slider-range" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="distance-slider-thumb" aria-label="Minimum distance" />
        <SliderPrimitive.Thumb className="distance-slider-thumb" aria-label="Maximum distance" />
      </SliderPrimitive.Root>
    </div>
  );
}
