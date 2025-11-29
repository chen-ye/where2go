import { type RasterSourceSpecification } from "maplibre-gl";
import type { BasemapConfig, OverlayConfig } from "./layerTypes.ts";

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

function long2tile(lon: number, zoom: number) {
  return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
}

function lat2tile(lat: number, zoom: number) {
  return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
}

function substituteSlippyTemplates(url: string | undefined, config: OverlayConfig | BasemapConfig) {
  if (!url) {
    return undefined;
  }

  let lat = 47.6101; // Default Bellevue
  let lon = -122.2015;
  let zoom = 13;

  // Check for center in config
  if (config.center) {
    [lon, lat] = config.center;
  }

  // Check for zoom in config
  if (config.zoom !== undefined) {
    zoom = config.zoom;
  }

  // Check sources for bounds or minzoom/maxzoom
  if (config.sources) {
    const rasterSource = Object.values(config.sources).find((s: any) => s.type === 'raster' || s.type === 'raster-dem') as RasterSourceSpecification | undefined;
    if (rasterSource) {
      if (rasterSource.bounds) {
        const [minLon, minLat, maxLon, maxLat] = rasterSource.bounds;
        lon = (minLon + maxLon) / 2;
        lat = (minLat + maxLat) / 2;
      }
      if (rasterSource.minzoom !== undefined) {
        zoom = Math.max(zoom, rasterSource.minzoom);
      }
      if (rasterSource.maxzoom !== undefined) {
        zoom = Math.min(zoom, rasterSource.maxzoom);
      }
    }
  }

  const x = long2tile(lon, zoom);
  const y = lat2tile(lat, zoom);

  return url.replace('{z}', zoom.toString()).replace('{x}', x.toString()).replace('{y}', y.toString());
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
function getThumbnail(config: OverlayConfig | BasemapConfig, thumbnails: Record<string, string>) {
  return substituteSlippyTemplates(config.thumbnail, config) || getLocalThumbnail(config.id, thumbnails) || getRasterThumbnail(config);
}

export const BASEMAPS: BasemapConfig[] = Object.values(basemapModules).map(config => ({
  ...config,
  thumbnail: getThumbnail(config, basemapThumbnails),
}));

export const OVERLAYS: OverlayConfig[] = Object.values(overlayModules).map(config => ({
  ...config,
  thumbnail: getThumbnail(config, overlayThumbnails),
})).sort(
  (a, b) => a.order - b.order
);
