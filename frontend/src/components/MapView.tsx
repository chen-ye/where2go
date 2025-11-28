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
import { useCallback, useMemo, useState } from "react";
import { LayerSelector } from "./LayerSelector";
import { BASEMAPS, OVERLAYS } from "../utils/layerConfig";
import type { Route, RouteDataPoint } from "../types.ts";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { getGradeColor } from "../utils/geo";

function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}



interface MapViewProps {
  routes: Route[];
  selectedRouteId: number | null;
  onSelectRoute: (id: number | null) => void;
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
}

export function MapView({
  routes,
  selectedRouteId,
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
}: MapViewProps) {
  // const [hoverInfo, setHoverInfo] = useState<PickingInfo<Feature<Geometry, {}>>>();

  const routesGeoJson: FeatureCollection = useMemo(() => {
    return {
      type: "FeatureCollection",
      features: routes.map((r) => ({
        type: "Feature",
        properties: {
          id: r.id,
          title: r.title,
          selected: r.id === selectedRouteId,
        },
        geometry: r.geojson,
      })),
    };
  }, [routes, selectedRouteId]);

  const deckGLLayers: DeckProps["layers"] = useMemo(() => {
    const layers: DeckLayer[] = [];

    // If displayGradeOnMap is enabled and a route is selected, we render the selected route as segments
    if (
      displayGradeOnMap &&
      selectedRouteId &&
      routeData &&
      routeData.length > 1
    ) {
      // Actually deck.gl PathLayer expects coordinates.
      // routeData has lat, lon.
      const pathCoords = routeData.map((p) => [p.lon, p.lat]);

      const colors: [number, number, number, number][] = [];

      // Helper to convert hex to rgb
      const hexToRgb = (hex: string): [number, number, number, number] => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b, 255];
      };

      // Map grades to vertex colors
      for (let i = 0; i < routeData.length; i++) {
        // For vertex i, we use its grade.
        // Note: routeData[i].grade is the grade of the segment ENDING at i (calculated from i-1 to i).
        // But for coloring, we might want the segment STARTING at i?
        // In the previous loop:
        // grades.push(calculateGrade(coords[i], coords[i+1]));
        // colors.push(hexToRgb(getGradeColor(grades[gradeIndex])));

        // routeData[i].grade is calculated from i-1 to i.
        // So routeData[i].grade is the grade of the segment arriving at i.
        // If we want the grade of the segment departing i, we need routeData[i+1].grade.

        // Let's look at previous logic:
        // grades[i] = grade(i, i+1)
        // So for vertex i, we want grade(i, i+1).
        // That corresponds to routeData[i+1].grade.

        let grade = 0;
        if (i < routeData.length - 1) {
          grade = routeData[i + 1].grade;
        } else {
          // Last point, use previous grade
          grade = routeData[i].grade;
        }

        colors.push(hexToRgb(getGradeColor(grade)));
      }

      layers.push(
        new PathLayer<{
          path: [number, number][];
          colors: [number, number, number, number][];
        }>({
          id: "selected-route",
          data: [{ path: pathCoords, colors }],
          getPath: (d) => d.path,
          getColor: (d) => d.colors,
          getWidth: 60,
          widthUnits: "meters",
          capRounded: true,
          jointRounded: true,
          pickable: false,
          widthMinPixels: 2,
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
          // find the route object to check completion status
          const route = routes.find((r) => r.id === object.properties.id);
          const isCompleted = route?.is_completed;

          if (selectedRoute) {
            return displayGradeOnMap ? [0, 0, 0, 0] : [217, 119, 6, 255];
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
          onSelectRoute(info.object.properties.id);
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
    <div className="map-container">
      <Map
        {...viewState}
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
              onSelectRoute(feature.properties?.id);
            } else {
              onSelectRoute(null);
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
