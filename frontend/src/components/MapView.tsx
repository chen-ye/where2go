import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, ScatterplotLayer, PathLayer } from "@deck.gl/layers";
import { Layer as DeckLayer, type DeckProps, type PickingInfo } from "@deck.gl/core";

import Map, {
  Source,
  Layer,
  NavigationControl,
  GeolocateControl,
  useControl,
  type ViewState,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import "./MapView.css";
import { useCallback, useMemo, useRef, useEffect } from "react";
import { LayerSelector } from "./LayerSelector";
import { BASEMAPS, OVERLAYS } from "../utils/layerConfig";
import type { Route, RouteDataPoint } from "../types.ts";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { getGradeColor } from "../utils/geo";
import type { MapRef } from "react-map-gl/maplibre";

function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

// Offset elevation to avoid z-fighting
const elvOffset = 5;

// Helper to convert hex to rgb
const hexToRgb = (hex: string): [number, number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, 255];
};

interface MapViewProps {
  routes: Route[];
  selectedRouteId: number | null;
  selectionSource: 'map' | 'search' | null;
  onSelectRoute: (id: number | null, source?: 'map' | 'search') => void;
  viewState: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
  onMove: (viewState: ViewState) => void;
  hoveredLocation: { lat: number; lon: number } | null;
  onHover: (location: { lat: number; lon: number } | null) => void;
  displayGradeOnMap: boolean;
  routeData?: RouteDataPoint[];
  baseStyle: string;
  onBaseStyleChange: (style: string) => void;
  customStyleUrl: string;
  onCustomStyleUrlChange: (url: string) => void;
  activeOverlays: Set<string>;
  onToggleOverlay: (id: string, active: boolean) => void;
  padding?: { top: number; bottom: number; left: number; right: number };
}

export function MapView({
  routes,
  selectedRouteId,
  selectionSource,
  onSelectRoute,
  viewState,
  onMove,
  hoveredLocation,
  onHover,
  displayGradeOnMap,
  routeData,
  baseStyle,
  onBaseStyleChange,
  customStyleUrl,
  onCustomStyleUrlChange,
  activeOverlays,
  onToggleOverlay,
  padding,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);

  // Fly to selected route's bounding box only when selected from search
  useEffect(() => {
    if (!selectedRouteId || !mapRef.current || selectionSource !== 'search') return;

    const selectedRoute = routes.find((r) => r.id === selectedRouteId);
    if (!selectedRoute?.bbox) return;

    // Extract bounds from the bbox LineString
    // ST_BoundingDiagonal returns a LineString with two points: [southwest, northeast]
    const coords = selectedRoute.bbox.coordinates as number[][];
    const bounds: [[number, number], [number, number]] = [
      [coords[0][0], coords[0][1]], // [minLng, minLat]
      [coords[1][0], coords[1][1]], // [maxLng, maxLat]
    ];

    mapRef.current.fitBounds(bounds, {
      padding: { top: 100, bottom: 100, left: 100, right: 100 },
      duration: 1000,
    });
  }, [selectedRouteId, routes, selectionSource]);

  // const [hoverInfo, setHoverInfo] = useState<PickingInfo<Feature<Geometry, {}>>>();

  const routesGeoJson: FeatureCollection = useMemo(() => {
    return {
      type: "FeatureCollection",
      features: routes.map((r) => ({
        type: "Feature",
        properties: {
          id: r.id,
          title: r.title,
          is_completed: r.is_completed,
          grades: r.grades,
        },
        geometry: r.geojson,
      })),
    };
  }, [routes]);

  const deckGLLayers: DeckProps["layers"] = useMemo(() => {
    const layers: DeckLayer[] = [];

    // If displayGradeOnMap is enabled and a route is selected, we render the selected route as segments
    if (
      selectedRouteId &&
      routeData &&
      routeData.length > 1
    ) {
      layers.push(
        new PathLayer<RouteDataPoint[]>({
          id: "selected-route",
          data: [routeData],
          getPath: (d) => { return d.flatMap((p) => [p.lon, p.lat, p.elevation + elvOffset])},
          getColor: (d) => {
            return displayGradeOnMap ? ([...d, d.at(-1)] as RouteDataPoint[]).map((p) => hexToRgb(getGradeColor(p.grade))) : [217, 119, 6, 255];
          },
          getWidth: 40,
          widthUnits: "meters",
          capRounded: true,
          jointRounded: true,
          pickable: false,
          widthMinPixels: 2,
          _pathType: 'open',
        })
      );
    }

    // Main routes layer
    layers.push(
      new GeoJsonLayer({
        id: "routes",
        data: routesGeoJson,
        getLineColor: (object) => {
          const selectedRoute = object.properties.id === selectedRouteId;
          const isCompleted = object.properties.is_completed;

          if (selectedRoute) {
            return [0, 0, 0, 0];
            // return displayGradeOnMap ? [0, 0, 0, 0] : [217, 119, 6, 255];
          }
          return isCompleted ? [167, 119, 199, 255 * 0.4] : [17, 70, 120, 255 * 0.6];
        },
        getLineWidth: (object) =>
          object.properties.id === selectedRouteId ? 60 : 20,
        lineWidthUnits: "meters",
        pickable: true,
        stroked: true,
        onHover: (info) => {
          // Only emit hover events when actually hovering over the selected route
          if (
            info.object?.properties.id === selectedRouteId &&
            info.coordinate
          ) {
            onHover({ lat: info.coordinate[1], lon: info.coordinate[0] });
          } else {
            onHover(null);
          }
        },
        lineWidthMinPixels: 1,
        onClick: (info) => {
          onSelectRoute(info.object.properties.id, 'map');
        },
        updateTriggers: {
          getLineColor: [selectedRouteId, displayGradeOnMap],
          getLineWidth: selectedRouteId,
        },
      })
    );

    if (hoveredLocation) {
      layers.push(
        new ScatterplotLayer({
          id: "hover-marker",
          data: [{ position: [hoveredLocation.lon, hoveredLocation.lat] }],
          getPosition: (d: { position: [number, number] }) => d.position,
          getFillColor: [255, 255, 255],
          getLineColor: [0, 0, 0],
          getLineWidth: 2,
          getRadius: 10,
          radiusMinPixels: 5,
          radiusMaxPixels: 10,
        })
      );
    }

    return layers;
  }, [
    routesGeoJson,
    selectedRouteId,
    hoveredLocation,
    onHover,
    displayGradeOnMap,
    routes,
  ]);

  const mapStyle = useMemo(() => {
    if (baseStyle === "custom") {
      return customStyleUrl;
    }
    const config = BASEMAPS.find((b) => b.id === baseStyle);
    if (config) {
      // Append API key from config if present
      if (config.apiKey && !config.url.includes("key=")) {
        const separator = config.url.includes("?") ? "&" : "?";
        return `${config.url}${separator}key=${config.apiKey}`;
      }
      return config.url;
    }
    // Fallback to first available basemap
    return BASEMAPS[0]?.url ?? "";
  }, [baseStyle, customStyleUrl]);

  return (
    <div
      className="map-container"
      style={
        {
          "--map-padding-top": `${padding?.top ?? 0}px`,
          "--map-padding-bottom": `${padding?.bottom ?? 0}px`,
          "--map-padding-left": `${padding?.left ?? 0}px`,
          "--map-padding-right": `${padding?.right ?? 0}px`,
        } as React.CSSProperties
      }
    >
      <Map
        ref={mapRef}
        {...viewState}
        padding={padding}
        onMove={(evt) => onMove(evt.viewState)}
        mapStyle={mapStyle}
        terrain={{
          source: "terrain",
          exaggeration: 1,
        }}
        onClick={useCallback(
          (e: MapLayerMouseEvent) => {
            const feature = e.features?.[0];
            if (feature) {
              onSelectRoute(feature.properties?.id, 'map');
            } else {
              onSelectRoute(null, 'map');
            }
          },
          [onSelectRoute]
        )}
        interactiveLayerIds={["route-line-hitbox"]}
      >
        <GeolocateControl position="top-right" />
        <NavigationControl
          position="top-right"
          showCompass={true}
          visualizePitch={true}
          visualizeRoll={true}
        />
        <LayerSelector
          currentStyle={baseStyle}
          onStyleChange={onBaseStyleChange}
          customStyleUrl={customStyleUrl}
          onCustomStyleUrlChange={onCustomStyleUrlChange}
          activeOverlays={activeOverlays}
          onToggleOverlay={onToggleOverlay}
        />

        {(() => {
          // Sort active overlays by order (Low -> High)
          const activeConfigs = OVERLAYS.filter((o) => activeOverlays.has(o.id));
          // Render in reverse order (High -> Low) so that the "top" layer exists
          // when the "bottom" layer tries to insert itself before it.
          const reversedConfigs = activeConfigs.toReversed();

          return reversedConfigs.map((overlay, index) => {
            // The layer "above" this one is the previous one in the reversed list
            const aboveOverlay = index > 0 ? reversedConfigs[index - 1] : undefined;
            const beforeId = aboveOverlay ? `${aboveOverlay.id}-layer` : undefined;

            return (
              <Source
                key={overlay.id}
                id={overlay.id}
                type="raster"
                tiles={[overlay.url]}
                tileSize={256}
              >
                <Layer
                  id={`${overlay.id}-layer`}
                  type="raster"
                  paint={{ "raster-opacity": overlay.opacity }}
                  beforeId={beforeId}
                />
              </Source>
            );
          });
        })()}

        <Source
          id="terrain"
          type="raster-dem"
          tiles={["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"]}
          tileSize={256}
          encoding="terrarium"
          maxzoom={15}
        />
        <Source id="routes-data" type="geojson" data={routesGeoJson}>
          <DeckGLOverlay
            layers={deckGLLayers}
            pickingRadius={10}
            getTooltip={useCallback(
              ({
                object,
              }: PickingInfo<
                Feature<Geometry, { id: number; title: string }>
              >) => object?.properties.title ?? null,
              []
            )}
          />
        </Source>
      </Map>
    </div>
  );
}

// <DeckGL layers={deckGLLayers}
//   initialViewState={{
//     latitude: 38,
//     longitude: -100,
//     zoom: 4,
//     minZoom: 2,
//     maxZoom: 18
//   }}
//   pickingRadius={10}
//   getTooltip={({object}: PickingInfo<Feature<Geometry, {id: number, title: string}>>) => (object?.properties.title ?? '')}
//   controller={true}>
//   <Map reuseMaps mapStyle={'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'} />
// </DeckGL>
