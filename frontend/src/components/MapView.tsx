import { MapboxOverlay } from "@deck.gl/mapbox";
import { Layer, type DeckProps, type PickingInfo } from "@deck.gl/core";

import Map, {
  Source,
  NavigationControl,
  GeolocateControl,
  useControl,
  type ViewState,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import "./MapView.css";
import { useCallback, useMemo } from "react";
import type { Route, RouteDataPoint } from "../types.ts";
import { GeoJsonLayer, ScatterplotLayer, PathLayer } from "deck.gl";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { getGradeColor } from "../utils/geo";

function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

const MAPTILER_API_KEY = "di0gshXc0zUqmVTNctjb";

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
    const layers: Layer[] = [];

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
          id: "selected-route-segments",
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
        id: "route-lines",
        data: routesGeoJson,
        getLineColor: (object) => {
          const selectedRoute = object.properties.id === selectedRouteId;
          return selectedRoute
            ? displayGradeOnMap
              ? [0, 0, 0, 0]
              : [217, 119, 6, 255]
            : [167, 119, 199, 80];
        },
        getLineWidth: (object) =>
          object.properties.id === selectedRouteId ? 60 : 10,
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

  return (
    <div className="map-container">
      <Map
        {...viewState}
        onMove={(evt) => onMove(evt.viewState)}
        mapStyle={`https://api.maptiler.com/maps/dataviz-v4-dark/style.json?key=${MAPTILER_API_KEY}`}
        // mapStyle={`https://api.maptiler.com/maps/outdoor-v4-dark/style.json?key=${MAPTILER_API_KEY}`}
        terrain={{
          source: "maptiler-terrain",
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
        <Source
          id="maptiler-terrain"
          type="raster-dem"
          url={`https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${MAPTILER_API_KEY}`}
          tileSize={256}
          maxzoom={11} // Max zoom level for Terrain RGB
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
