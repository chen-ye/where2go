import { useState } from "react";
import { createPortal } from "react-dom";
import { useControl } from "react-map-gl/maplibre";
import * as Popover from "@radix-ui/react-popover";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Layers, Check } from "lucide-react";
import "./LayerSelector.css";
import { BASEMAPS, OVERLAYS } from "../utils/layerConfig";

export type BaseStyle = string;

export interface LayerSelectorProps {
  currentStyle: string;
  onStyleChange: (style: string) => void;
  customStyleUrl: string;
  onCustomStyleUrlChange: (url: string) => void;
  activeOverlays: Set<string>;
  onToggleOverlay: (id: string, active: boolean) => void;
}

export function LayerSelector({
  currentStyle,
  onStyleChange,
  customStyleUrl,
  onCustomStyleUrlChange,
  activeOverlays,
  onToggleOverlay,
}: LayerSelectorProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

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
                <RadioGroup.Item key={basemap.id} value={basemap.id} className="layer-card">
                  <div className={`layer-card-preview ${basemap.id}-preview`} />
                  <span className="layer-card-label">{basemap.name}</span>
                </RadioGroup.Item>
              ))}
              {/* <RadioGroup.Item value="custom" className="layer-card">
                <div className="layer-card-preview custom-preview" />
                <span className="layer-card-label">Custom</span>
              </RadioGroup.Item> */}
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
              {OVERLAYS.map((overlay) => {
                const checked = activeOverlays.has(overlay.id);
                return (
                  <div
                    key={overlay.id}
                    className={`layer-card checkbox-card ${checked ? "checked" : ""}`}
                    onClick={() => onToggleOverlay(overlay.id, !checked)}
                  >
                    <div className="layer-card-header">
                      <Checkbox.Root
                        className="layer-checkbox"
                        checked={checked}
                        onCheckedChange={(c) => onToggleOverlay(overlay.id, c === true)}
                        id={overlay.id}
                      >
                        <Checkbox.Indicator className="checkbox-indicator">
                          <Check size={12} />
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                    </div>
                    <span className="layer-card-label">{overlay.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <Popover.Arrow className="popover-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>,
    container
  );
}
