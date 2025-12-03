import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
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
import { useCallback, useMemo, useEffect, useState, forwardRef } from "react";
import { LayerSelector } from "./LayerSelector";
import { BASEMAPS, OVERLAYS } from "../utils/layerConfig";
import { getGradeColor } from "../utils/geo";
import { hexToRgb } from "../utils/colors";
import { getOpenPropsRgb } from "../utils/colors";
import type { Route, RouteDataPoint } from "../types.ts";
import type { Feature, Geometry } from "geojson";
import type { MapRef } from "react-map-gl/maplibre";
import { MVTLayer } from "@deck.gl/geo-layers";
import type { StyleSpecification, LayerSpecification, SourceSpecification } from "maplibre-gl";
import { MapLibreRouteResults } from "./MapLibreRouteResults";

const USE_DECK_MVT = false;

function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

// Offset elevation to avoid z-fighting
const elvOffset = 0;

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
  hoveredRouteId: number | null;
  onHoverRoute: (id: number | null) => void;
  padding?: { top: number; bottom: number; left: number; right: number };
  filterParams: string;
}

export const MapView = forwardRef<MapRef, MapViewProps>(({
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
  hoveredRouteId,
  onHoverRoute,
  padding,
  filterParams,
}, ref) => {
  // Use the forwarded ref directly for the Map component

  // Fly to selected route's bounding box only when selected from search
  useEffect(() => {
    if (!selectedRouteId || selectionSource !== 'search') return;
    if (!ref || typeof ref === 'function' || !ref.current) return;

    const selectedRoute = routes.find((r) => r.id === selectedRouteId);
    if (!selectedRoute?.bbox) return;

    // Extract bounds from the bbox LineString
    // ST_BoundingDiagonal returns a LineString with two points: [southwest, northeast]
    const coords = selectedRoute.bbox.coordinates as number[][];
    const bounds: [[number, number], [number, number]] = [
      [coords[0][0], coords[0][1]], // [minLng, minLat]
      [coords[1][0], coords[1][1]], // [maxLng, maxLat]
    ];

    ref.current.fitBounds(bounds, {
      padding: { top: 100, bottom: 100, left: 100, right: 100 },
      duration: 1000,
    });
  }, [selectedRouteId, routes, selectionSource, ref]);

  // Manage feature states for MapLibre layer

  // Ref to track previous IDs for clearing feature state
  const prevIds = useMemo(() => ({ selected: null as number | null, hovered: null as number | null }), []);

  useEffect(() => {
    if (USE_DECK_MVT) return;
    if (!ref || typeof ref === 'function' || !ref.current) return;
    const map = ref.current;

    // Update selected state
    if (prevIds.selected !== selectedRouteId) {
      if (prevIds.selected) {
        map.setFeatureState(
          { source: 'routes-source', sourceLayer: 'routes', id: prevIds.selected },
          { selected: false }
        );
      }
      if (selectedRouteId) {
        map.setFeatureState(
          { source: 'routes-source', sourceLayer: 'routes', id: selectedRouteId },
          { selected: true }
        );
      }
      prevIds.selected = selectedRouteId;
    }

    // Update hovered state
    if (prevIds.hovered !== hoveredRouteId) {
      if (prevIds.hovered) {
        map.setFeatureState(
          { source: 'routes-source', sourceLayer: 'routes', id: prevIds.hovered },
          { hover: false }
        );
      }
      if (hoveredRouteId) {
        map.setFeatureState(
          { source: 'routes-source', sourceLayer: 'routes', id: hoveredRouteId },
          { hover: true }
        );
      }
      prevIds.hovered = hoveredRouteId;
    }
  }, [selectedRouteId, hoveredRouteId, ref, prevIds]);

  const activeOverlaysConfigs = useMemo(() => {
    return OVERLAYS.filter((o) => activeOverlayIds.has(o.id));
  }, [activeOverlayIds]);

  const orderedActiveOverlayBottomIds = useMemo(() => {
    return activeOverlaysConfigs.map((o) => o.layers?.[1]?.id).filter((id) => id !== undefined)
  }, [activeOverlaysConfigs]);

  // const [hoverInfo, setHoverInfo] = useState<PickingInfo<Feature<Geometry, {}>>>();



  const [tooltipInfo, setTooltipInfo] = useState<{ x: number; y: number; content: string } | null>(null);

  const selectedRouteData = useMemo(() => {
    return [routeData];
  }, [routeData]);

  const deckGLLayers: DeckProps["layers"] = useMemo(() => {
    const layers: DeckLayer[] = [];

    // Selected route layer (PathLayer)
    const hasSelectedRoute = selectedRouteId && routeData && routeData.length > 1;
    layers.push(
      new PathLayer<RouteDataPoint[]>({
        id: "selected-route",
        data: hasSelectedRoute ? selectedRouteData : [],
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

    // Main routes layer (MVT)
    if (USE_DECK_MVT) {
      layers.push(
        new MVTLayer({
          id: "routes-mvt",
          data: `/api/routes/tiles/{z}/{x}/{y}?${filterParams}`,
          minZoom: 0,
          maxZoom: 23,
          getLineColor: (f: Feature) => {
            const props = f.properties as any;
            const routeId = f.id ?? props.id;
            const isSelected = routeId === selectedRouteId;
            const isHovered = routeId === hoveredRouteId;
            const isCompleted = props.is_completed;

            if (isSelected) {
              return [0, 0, 0, 0];
            }

            return isCompleted
              ? [...getOpenPropsRgb("--purple-6"), isHovered ? 255 : Math.floor(routeOpacity.completed * 2.55)]
              : [...getOpenPropsRgb("--blue-7"), isHovered ? 255 : Math.floor(routeOpacity.incomplete * 2.55)];
          },
          getLineWidth: (f: Feature) => {
             const props = f.properties as any;
             const routeId = f.id ?? props.id;
             return routeId === selectedRouteId ? 60 : 20;
          },
          lineWidthUnits: "meters",
          lineWidthMinPixels: 1,
          pickable: true,
          binary: false,
          onClick: (info) => {
            if (info.object) {
              const routeId = info.object.id ?? info.object.properties.id;
              onSelectRoute(routeId as number, 'map');
            }
          },
          onHover: (info) => {
            const routeId = info.object?.id ?? info.object?.properties?.id ?? null;
            if (routeId !== hoveredRouteId) {
               onHoverRoute(routeId as number);
            }

            // Only update hoveredLocation if hovering over the selected route
            if (info.object && info.coordinate && routeId === selectedRouteId) {
               onHover({ lat: info.coordinate[1], lon: info.coordinate[0] });
            } else if (routeId !== selectedRouteId) {
              onHover(null);
            }
          },
          updateTriggers: {
            getLineColor: [selectedRouteId, routeOpacity, hoveredRouteId],
            getLineWidth: [selectedRouteId],
          },
          loadersOptions: {
            mvt: {
              workerUrl: null,
              shape: 'geojson',
            },
          },
        })
      );
    }

    layers.push(
      new ScatterplotLayer({
        id: "selected-route-point",
        data: hoveredLocation ? [hoveredLocation] : [],
        getPosition: (d) => [d.lon, d.lat],
        getFillColor: getOpenPropsRgb("--gray-0"),
        getLineColor: getOpenPropsRgb("--gray-9"),
        stroked: true,
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        getRadius: 10,
        radiusUnits: "pixels",
        pickable: false,
      })
    );

    layers.push(
      new ScatterplotLayer({
        id: 'hovered-location',
        data: hoveredLocation ? [hoveredLocation] : [],
        getPosition: (d: { lat: number; lon: number }) => [d.lon, d.lat, 0],

        getFillColor: getOpenPropsRgb("--gray-0"),
        getLineColor: getOpenPropsRgb("--gray-12"),
        getRadius: 50,
        radiusUnits: 'meters',
        radiusMinPixels: 4,
        stroked: true,
        filled: true,
        pickable: false,
      })
    );

    return layers;
  }, [
    filterParams, // Add filterParams dependency
    selectedRouteId,
    hoveredRouteId,
    hoveredLocation,
    onHover,
    displayGradeOnMap,
    routeOpacity,
    selectedRouteData,
    onSelectRoute, // Add onSelectRoute dependency
    USE_DECK_MVT // Add USE_DECK_MVT dependency
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
        ref={ref}
        {...viewState}
        padding={padding}
        onMove={(evt) => onMove(evt.viewState)}
        mapStyle={resolvedMapStyle || { version: 8, sources: {}, layers: [] }}
        terrain={{
          source: "terrain",
          exaggeration: 1,
        }}
        onClick={useCallback(
          (e: MapLayerMouseEvent) => {
            if (USE_DECK_MVT) return;
            const feature = e.features?.[0];
            if (feature) {
              const routeId = feature.id ?? feature.properties?.id;
              onSelectRoute(routeId as number, 'map');
            } else {
              onSelectRoute(null, 'map');
            }
          },
          [onSelectRoute]
        )}
        onMouseMove={useCallback(
          (e: MapLayerMouseEvent) => {
            if (USE_DECK_MVT) return;
            const feature = e.features?.[0];
            if (feature) {
              const routeId = feature.id ?? feature.properties?.id;
              onHoverRoute(routeId as number);

              // Set tooltip info
              if (feature.properties?.title) {
                setTooltipInfo({
                  x: e.point.x,
                  y: e.point.y,
                  content: feature.properties.title
                });
              } else {
                setTooltipInfo(null);
              }

              // Update hovered location if needed, similar to Deck.gl logic
              if (routeId === selectedRouteId) {
                onHover({ lat: e.lngLat.lat, lon: e.lngLat.lng });
              } else {
                onHover(null);
              }
            } else {
              onHoverRoute(null);
              onHover(null);
              setTooltipInfo(null);
            }
          },
          [onHoverRoute, onHover, selectedRouteId]
        )}
        interactiveLayerIds={["route-line-hitbox", "routes-line", "routes-hitbox"]}
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

        {!USE_DECK_MVT && (
          <MapLibreRouteResults
            filterParams={filterParams}
            routeOpacity={routeOpacity}
          />
        )}

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

        {tooltipInfo && (
          <div
            className="deck-tooltip"
            style={{
              position: 'absolute',
              left: tooltipInfo.x,
              top: tooltipInfo.y,
              transform: 'translate(-50%, -100%)',
              marginTop: '-10px',
            }}
          >
            {tooltipInfo.content}
          </div>
        )}
      </Map>
    </div>
  );
});

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
