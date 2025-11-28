import type { StyleSpecification } from "maplibre-gl";

export interface BasemapConfig extends Partial<StyleSpecification> {
  id: string;
  name: string;
  url?: string;
}

export interface OverlayConfig extends Partial<StyleSpecification> {
  order: number;
  id: string;
  name: string;
  url?: string;
  // Legacy property, migrated to paint['raster-opacity']
  opacity?: number;
}

// Use Vite's glob import to load all JSON files from the config directories
const basemapModules = import.meta.glob<BasemapConfig>("@config/layers/basemaps/*.json", {
  eager: true,
  import: "default",
});

const overlayModules = import.meta.glob<OverlayConfig>("@config/layers/overlay/*.json", {
  eager: true,
  import: "default",
});

export const BASEMAPS: BasemapConfig[] = Object.values(basemapModules);

export const OVERLAYS: OverlayConfig[] = Object.values(overlayModules).sort(
  (a, b) => a.order - b.order
);
