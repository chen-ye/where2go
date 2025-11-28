import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useControl } from "react-map-gl/maplibre";
import * as Popover from "@radix-ui/react-popover";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { Layers } from "lucide-react";
import { useDebounce } from "@uidotdev/usehooks";
import "./LayerSelector.css";
import { BASEMAPS, OVERLAYS } from "../utils/layerConfig";
import { RadioCard } from "./ui/RadioCard.tsx";
import { CheckboxCard } from "./ui/CheckboxCard.tsx";
import { Slider } from "./ui/Slider.tsx";

export type BaseStyle = string;

export interface LayerSelectorProps {
  currentStyle: string;
  onStyleChange: (style: string) => void;
  customStyleUrl: string;
  onCustomStyleUrlChange: (url: string) => void;
  activeOverlays: Set<string>;
  onToggleOverlay: (id: string, active: boolean) => void;
  routeOpacity: { selected: number; completed: number; incomplete: number };
  onOpacityChange: (opacity: { selected: number; completed: number; incomplete: number }) => void;
}

export function LayerSelector({
  currentStyle,
  onStyleChange,
  customStyleUrl,
  onCustomStyleUrlChange,
  activeOverlays,
  onToggleOverlay,
  routeOpacity,
  onOpacityChange,
}: LayerSelectorProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  // Local state for sliders to ensure smooth UI updates
  const [localOpacity, setLocalOpacity] = useState(routeOpacity);
  const debouncedOpacity = useDebounce(localOpacity, 200);

  // Sync prop changes to local state (if changed externally)
  useEffect(() => {
    setLocalOpacity(routeOpacity);
  }, [routeOpacity.selected, routeOpacity.completed, routeOpacity.incomplete]);

  // Sync debounced local state to parent
  useEffect(() => {
    onOpacityChange(debouncedOpacity);
  }, [debouncedOpacity, onOpacityChange]);

  const handleOpacityChange = (key: keyof typeof routeOpacity, value: number) => {
    setLocalOpacity((prev) => ({ ...prev, [key]: value }));
  };

  useControl(
    () => {
      const ctrl = document.createElement("div");
      ctrl.className = "maplibregl-ctrl maplibregl-ctrl-group layer-selector-control";
      setContainer(ctrl);
      return {
        onAdd: () => ctrl,
        onRemove: () => {
          setContainer(null);
          ctrl.remove();
        },
      };
    },
    { position: "top-right" }
  );

  if (!container) return null;

  return createPortal(
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="layer-selector-trigger" aria-label="Layer Selector">
          <Layers size={20} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="layer-selector-content" sideOffset={5} align="end">
          <div className="layer-section">
            <h3 className="layer-section-title">Base Map</h3>
            <RadioGroup.Root
              className="layer-grid"
              value={currentStyle}
              onValueChange={(val) => onStyleChange(val)}
            >
              {BASEMAPS.map((basemap) => (
                <RadioCard
                  key={basemap.id}
                  id={basemap.id}
                  name={basemap.name}
                  value={basemap.id}
                  thumbnail={basemap.thumbnail}
                />
              ))}
            </RadioGroup.Root>
            {currentStyle === "custom" && (
              <input
                type="text"
                className="custom-style-input"
                placeholder="Style JSON URL"
                value={customStyleUrl}
                onChange={(e) => onCustomStyleUrlChange(e.target.value)}
              />
            )}
          </div>

          <div className="layer-separator" />

          <div className="layer-section">
            <h3 className="layer-section-title">Overlays</h3>
            <div className="layer-grid">
              {OVERLAYS.map((overlay) => (
                <CheckboxCard
                  key={overlay.id}
                  id={overlay.id}
                  name={overlay.name}
                  checked={activeOverlays.has(overlay.id)}
                  onCheckedChange={(checked) => onToggleOverlay(overlay.id, checked)}
                  thumbnail={overlay.thumbnail}
                />
              ))}
            </div>
          </div>

          <div className="layer-separator" />

          <div className="layer-section">
            <h3 className="layer-section-title">Routes</h3>
            <div className="layer-sliders" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Slider
                label="Selected"
                value={localOpacity.selected}
                onValueChange={(val) => handleOpacityChange("selected", val)}
              />
              <Slider
                label="Completed"
                value={localOpacity.completed}
                onValueChange={(val) => handleOpacityChange("completed", val)}
              />
              <Slider
                label="Incomplete"
                value={localOpacity.incomplete}
                onValueChange={(val) => handleOpacityChange("incomplete", val)}
              />
            </div>
          </div>

          <Popover.Arrow className="popover-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>,
    container
  );
}
