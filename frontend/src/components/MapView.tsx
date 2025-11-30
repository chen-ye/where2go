import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer, PathLayer } from "@deck.gl/layers";
import { MVTLayer } from "@deck.gl/geo-layers";
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
import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { LayerSelector } from "./LayerSelector";
import { BASEMAPS, OVERLAYS } from "../utils/layerConfig";
import { getGradeColor } from "../utils/geo";
import { hexToRgb } from "../utils/colors";
import { getOpenPropsRgb } from "../utils/colors";
import type { Route, RouteDataPoint } from "../types.ts";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { MapRef } from "react-map-gl/maplibre";

import type { StyleSpecification, LayerSpecification, SourceSpecification } from "maplibre-gl";

function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

// Offset elevation to avoid z-fighting
const elvOffset = 5;

function useResolvedStyle(config: any): StyleSpecification | null {
  const [style, setStyle] = useState<StyleSpecification | null>(null);

  useEffect(() => {
    if (!config) {
      setStyle(null);
      return;
    }

    const loadStyle = async () => {
      // Handle MapLibre style
      let baseStyle: Partial<StyleSpecification> = {};

      if (config.url) {
        try {
          const response = await fetch(config.url);
          baseStyle = await response.json();
        } catch (e) {
          console.error("Failed to load style:", config.url, e);
        }
      }

      // Merge overrides
      // Exclude internal config keys
      const { id, name, url, order, opacity, ...overrides } = config;

      setStyle({
        ...baseStyle,
        ...overrides,
      } as StyleSpecification);
    };

    loadStyle();
  }, [config]);

  return style;
}

function OverlayRenderer({ config, beforeId }: { config: any; beforeId?: string }) {
  const style = useResolvedStyle(config);

  if (!style) return null;

  return (
    <>
      {Object.entries(style.sources || {}).map(([id, source]) => (
        <Source key={id} id={id} {...(source as SourceSpecification)} />
      ))}
      {
      // Reverse the order of layers. The layer array is arranged top-last.
      // Since each layer is rendered with a beforeId set to the previous overlay,
      // we need to reverse the order to ensure the correct layer order:
      // [prevOverlayLayer, 3, nextOverlayLayer]
      // [prevOverlayLayer, 2, 3, nextOverlayLayer]
      // [prevOverlayLayer, 1, 2, 3, nextOverlayLayer]
      style.layers?.toReversed().map((layer) => (
        <Layer key={layer.id} {...(layer as LayerSpecification)} beforeId={beforeId} />
      ))
      }
    </>
  );
}

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
  activeOverlayIds: Set<string>;
  onToggleOverlay: (id: string, active: boolean) => void;
  routeOpacity: { selected: number; completed: number; incomplete: number };
  onOpacityChange: (opacity: { selected: number; completed: number; incomplete: number }) => void;
  hoveredSearchRouteId: number | null;
  padding?: { top: number; bottom: number; left: number; right: number };
  filterParams: string;
  selectedRoute?: Route;
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
  activeOverlayIds,
  onToggleOverlay,
  routeOpacity,
  onOpacityChange,
  hoveredSearchRouteId,
  padding,
  filterParams,
  selectedRoute,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);

  // Fly to selected route's bounding box only when selected from search
  useEffect(() => {
    if (!selectedRouteId || !mapRef.current || selectionSource !== 'search') return;

    // Use selectedRoute passed from App if available and matches ID
    // Otherwise try to find in routes (though routes list might lack bbox if it was removed? No, list has bbox)
    const route = (selectedRoute && selectedRoute.id === selectedRouteId) ? selectedRoute : routes.find((r) => r.id === selectedRouteId);

    if (!route?.bbox) return;

    // Extract bounds from the bbox LineString
    const coords = route.bbox.coordinates as number[][];
    const bounds: [[number, number], [number, number]] = [
      [coords[0][0], coords[0][1]], // [minLng, minLat]
      [coords[1][0], coords[1][1]], // [maxLng, maxLat]
    ];

    mapRef.current.fitBounds(bounds, {
      padding: { top: 100, bottom: 100, left: 100, right: 100 },
      duration: 1000,
    });
  }, [selectedRouteId, routes, selectionSource, selectedRoute]);

  const activeOverlaysConfigs = useMemo(() => {
    return OVERLAYS.filter((o) => activeOverlayIds.has(o.id));
  }, [activeOverlayIds]);

  const orderedActiveOverlayBottomIds = useMemo(() => {
    return activeOverlaysConfigs.map((o) => o.layers?.[1]?.id).filter((id) => id !== undefined)
  }, [activeOverlaysConfigs]);

  const selectedRouteData = useMemo(() => {
    return [routeData];
  }, [routeData]);

  const deckGLLayers: DeckProps["layers"] = useMemo(() => {
    const layers: DeckLayer[] = [];

    // If displayGradeOnMap is enabled and a route is selected, we render the selected route as segments
    if (
      selectedRouteId &&
      routeData &&
      routeData.length > 1 &&
      selectedRoute?.geojson // Ensure we have the full geometry
    ) {
      layers.push(
        new PathLayer<RouteDataPoint[]>({
          id: "selected-route",
          data: selectedRouteData,
          getPath: (d) => { return d.flatMap((p) => [p.lon, p.lat, p.elevation + elvOffset])},
          getColor: (d) => {
            return displayGradeOnMap ? ([...d, d.at(-1)] as RouteDataPoint[]).map((p) => hexToRgb(getGradeColor(p.grade))) : [...getOpenPropsRgb("--orange-6"), Math.floor(routeOpacity.selected * 2.55)];
          },
          getWidth: 40,
          widthUnits: "meters",
          capRounded: true,
          jointRounded: true,
          pickable: false,
          widthMinPixels: 2,
          updateTriggers: {
            getPath: [elvOffset],
            getColor: [displayGradeOnMap, routeOpacity],
          },
          _pathType: 'open',
        })
      );
    }

    // MVT Layer
    layers.push(
      new MVTLayer({
        id: "routes-mvt",
        data: `/api/routes/tiles/{z}/{x}/{y}?${filterParams}`,
        minZoom: 0,
        maxZoom: 23,
        getLineColor: (f: Feature) => {
          const props = f.properties as any;
          const id = props.id;
          const isCompleted = props.is_completed;
          const isSelected = id === selectedRouteId;
          const isHovered = id === hoveredSearchRouteId;

          // If selected and we have the high-res layer ready, hide it in MVT
          if (isSelected && selectedRoute?.geojson) {
            return [0, 0, 0, 0];
          }

          return isCompleted
            ? [...getOpenPropsRgb("--purple-6"), isHovered ? 255 : Math.floor(routeOpacity.completed * 2.55)]
            : [...getOpenPropsRgb("--blue-7"), isHovered ? 255 : Math.floor(routeOpacity.incomplete * 2.55)];
        },
        getLineWidth: (f: Feature) => {
          const props = f.properties as any;
          return props.id === selectedRouteId ? 60 : 20;
        },
        lineWidthUnits: "meters",
        pickable: true,
        onHover: (info) => {
           if (info.object?.properties?.id && info.coordinate) {
             // MVT feature properties only have id, is_completed
             // We want to pass lat/lon
             onHover({ lat: info.coordinate[1], lon: info.coordinate[0] });
           } else {
             onHover(null);
           }
        },
        onClick: (info) => {
          if (info.object?.properties?.id) {
            onSelectRoute(info.object.properties.id, 'map');
          }
        },
        updateTriggers: {
          getLineColor: [selectedRouteId, displayGradeOnMap, routeOpacity, hoveredSearchRouteId, selectedRoute?.geojson],
          getLineWidth: [selectedRouteId],
        }
      })
    );

    if (hoveredLocation) {
      layers.push(
        new ScatterplotLayer({
          id: "hover-marker",
          data: [{ position: [hoveredLocation.lon, hoveredLocation.lat] }],
          getPosition: (d: { position: [number, number] }) => d.position,
          getFillColor: getOpenPropsRgb("--gray-0"),
          getLineColor: getOpenPropsRgb("--gray-12"),
          getLineWidth: 2,
          getRadius: 10,
          radiusMinPixels: 5,
          radiusMaxPixels: 10,
        })
      );
    }

    return layers;
  }, [
    selectedRouteId,
    hoveredSearchRouteId,
    hoveredLocation,
    onHover,
    displayGradeOnMap,
    routes, // Included for dependency completeness though used less
    routeOpacity,
    selectedRouteData,
    filterParams,
    selectedRoute
  ]);

  const currentBaseConfig = useMemo(() => {
    if (baseStyle === "custom") {
      return { url: customStyleUrl, id: 'custom', name: 'Custom' };
    }
    return BASEMAPS.find((b) => b.id === baseStyle);
  }, [baseStyle, customStyleUrl]);

  const resolvedMapStyle = useResolvedStyle(currentBaseConfig);

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
        mapStyle={resolvedMapStyle || { version: 8, sources: {}, layers: [] }}
        terrain={{
          source: "terrain",
          exaggeration: 1,
        }}
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
          activeOverlays={activeOverlayIds}
          onToggleOverlay={onToggleOverlay}
          routeOpacity={routeOpacity}
          onOpacityChange={onOpacityChange}
        />
        <Source
          id="terrain"
          type="raster-dem"
          tiles={["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"]}
          tileSize={256}
          encoding="terrarium"
          maxzoom={15}
        />
        <Source
          id="empty"
          type="geojson"
          data={{ type: "FeatureCollection", features: [] }}>
        </Source>
        <Layer
          id="bottom"
          type="fill"
          source="empty"
          paint={{
            "fill-color": "#000",
            "fill-opacity": 0,
          }}
        />
        {OVERLAYS.filter((o) => activeOverlayIds.has(o.id)).map((config) => (
          <OverlayRenderer key={config.id} config={config} beforeId={orderedActiveOverlayBottomIds[orderedActiveOverlayBottomIds.indexOf(config.id) - 1] ?? 'bottom'}/>
        ))}
        {/* Removed routes-data Source as we don't have routesGeoJson anymore */}
        <DeckGLOverlay
          layers={deckGLLayers}
          pickingRadius={10}
          getTooltip={useCallback(
            ({
              object,
            }: PickingInfo<
              Feature<Geometry, { id: number; title: string }>
            >) => {
              if (!object?.properties?.id) return null;
              // Look up title from routes list using ID from MVT feature
              const r = routes.find(route => route.id === object.properties.id);
              return r?.title ?? null;
            },
            [routes]
          )}
          />
      </Map>
    </div>
  );
}
