import { type RasterSourceSpecification, type StyleSpecification } from "maplibre-gl";

export interface BasemapConfig extends Partial<StyleSpecification> {
  id: string;
  name: string;
  url?: string;
  thumbnail?: string;
}

export interface OverlayConfig extends Partial<StyleSpecification> {
  order: number;
  id: string;
  name: string;
  url?: string;
  thumbnail?: string;
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

// Load local thumbnails
const basemapThumbnails = import.meta.glob<string>("@config/layers/basemaps/*.{png,jpg,jpeg}", {
  eager: true,
  import: "default",
});

const overlayThumbnails = import.meta.glob<string>("@config/layers/overlay/*.{png,jpg,jpeg}", {
  eager: true,
  import: "default",
});

/**
 * Returns a thumbnail URL from a local file.
 * @param id The ID of the basemap or overlay.
 * @param thumbnails The map of thumbnail URLs.
 * @returns The thumbnail URL or undefined if no thumbnail is found.
 */
function getLocalThumbnail(id: string, thumbnails: Record<string, string>): string | undefined {
  // Find a key that ends with /{id}.{ext}
  const key = Object.keys(thumbnails).find(k => {
    const filename = k.split('/').pop();
    return filename?.startsWith(`${id}.`);
  });
  return key ? thumbnails[key] : undefined;
}

function substituteSlippyTemplates(url: string | undefined, _config: OverlayConfig | BasemapConfig) {
  if (!url) {
    return undefined;
  }

  // Bellevue neighborhood level coordinates
  // TODO: If there are bounds, set x and y to the center of the bounds
  // TODO: If there is a minzoom, ensure z is at least that value, while maintaining lat/long center
  // TODO: If there is a maxzoom, ensure z is at most that value, while maintaining lat/long center
  return url.replace('{z}', '13').replace('{x}', '1315').replace('{y}', '2860');
}

/**
 * Returns a thumbnail URL automatically generated from a raster source.
 * @param config The basemap or overlay configuration.
 * @returns The thumbnail URL or undefined if no raster source is found.
 */
function getRasterThumbnail(config: OverlayConfig | BasemapConfig) {
  if (config.sources) {
    const rasterSource = Object.values(config.sources).find((s: any) => s.type === 'raster');
    if (rasterSource) {
      const tiles = (rasterSource as RasterSourceSpecification).tiles;
      if (tiles && tiles.length > 0) {
        return substituteSlippyTemplates(tiles[0], config);
      }
    }
  }
  return undefined;
}

/**
 * Returns a resolved thumbnail URL.
 * Defaults to an explicitly configured thumbnail,
 * falls back to a locally provided thumbnail,
 * or an automatically generated thumbnail from a raster source.
 *
 * @param config The basemap or overlay configuration.
 * @returns The thumbnail URL or undefined if no thumbnail is found.
 */
function getThumbnail(config: OverlayConfig | BasemapConfig) {
  return substituteSlippyTemplates(config.thumbnail, config) || getLocalThumbnail(config.id, basemapThumbnails) || getRasterThumbnail(config);
}

export const BASEMAPS: BasemapConfig[] = Object.values(basemapModules).map(config => ({
  ...config,
  thumbnail: getThumbnail(config),
}));

export const OVERLAYS: OverlayConfig[] = Object.values(overlayModules).map(config => ({
  ...config,
  thumbnail: getThumbnail(config),
})).sort(
  (a, b) => a.order - b.order
);
