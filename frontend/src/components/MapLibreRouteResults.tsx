import { Source, Layer } from "react-map-gl/maplibre";
import { useMemo } from "react";
import { getOpenPropsRgb } from "../utils/colors";

interface MapLibreRouteResultsProps {
  filterParams: string;
  routeOpacity: { selected: number; completed: number; incomplete: number };
}

export function MapLibreRouteResults({
  filterParams,
  routeOpacity,
}: MapLibreRouteResultsProps) {
  const tileUrl = useMemo(() => {
    const baseUrl = `${window.location.origin}/api/routes/tiles/{z}/{x}/{y}`;
    return filterParams ? `${baseUrl}?${filterParams}` : baseUrl;
  }, [filterParams]);

  // Convert OpenProps RGB array to hex string for MapLibre
  const purple6 = `rgb(${getOpenPropsRgb("--purple-6").join(",")})`;
  const blue7 = `rgb(${getOpenPropsRgb("--blue-7").join(",")})`;

  const linePaint = useMemo(() => {
    return {
      'line-color': [
        'case',
        ['to-boolean', ['feature-state', 'selected']],
        'transparent', // Hide selected route in this layer (rendered by Deck.gl PathLayer)
        ['get', 'is_completed'],
        purple6,
        blue7
      ] as any,
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        10, 1,
        15, 4
      ] as any,
      'line-opacity': [
        'case',
        ['to-boolean', ['feature-state', 'hover']],
        1,
        ['get', 'is_completed'],
        routeOpacity.completed / 100,
        routeOpacity.incomplete / 100
      ] as any
    };
  }, [routeOpacity, purple6, blue7]);

  return (
    <Source
      id="routes-source"
      type="vector"
      tiles={[tileUrl]}
      minzoom={0}
      maxzoom={23}
    >
      <Layer
        id="routes-line"
        type="line"
        source="routes-source"
        source-layer="routes"
        paint={linePaint}
      />

      {/* Wider transparent line for easier clicking */}
      <Layer
        id="routes-hitbox"
        type="line"
        source="routes-source"
        source-layer="routes"
        paint={{
          'line-width': 15,
          'line-color': 'transparent',
          'line-opacity': 1
        }}
      />
    </Source>
  );
}
