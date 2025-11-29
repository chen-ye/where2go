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

  // Sync with prop changes
  useEffect(() => {
    setLocalMin(Math.round(value[0] * METERS_TO_MILES));
    setLocalMax(Math.round(value[1] * METERS_TO_MILES));
  }, [value]);

  const minMiles = Math.round(min * METERS_TO_MILES);
  const maxMiles = Math.round(max * METERS_TO_MILES);

  const handleSliderChange = (values: number[]) => {
    setLocalMin(values[0]);
    setLocalMax(values[1]);
    onChange([values[0] / METERS_TO_MILES, values[1] / METERS_TO_MILES]);
  };

  const handleMinInputChange = (miles: number) => {
    const cappedMiles = Math.min(miles, localMax);
    setLocalMin(cappedMiles);
    onChange([cappedMiles / METERS_TO_MILES, value[1]]);
  };

  const handleMaxInputChange = (miles: number) => {
    const cappedMiles = Math.max(miles, localMin);
    setLocalMax(cappedMiles);
    onChange([value[0], cappedMiles / METERS_TO_MILES]);
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
            max={localMax}
            value={localMin}
            onChange={(e) => handleMinInputChange(parseInt(e.target.value) || minMiles)}
          />
          <span className="distance-unit">mi</span>
        </div>
        <div className="distance-input-group">
          <label htmlFor="distance-max">Max</label>
          <input
            id="distance-max"
            type="number"
            min={localMin}
            max={maxMiles}
            value={localMax}
            onChange={(e) => handleMaxInputChange(parseInt(e.target.value) || maxMiles)}
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
