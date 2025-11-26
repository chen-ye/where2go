import Map, { Source, Layer, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMemo } from 'react';
import type { Route } from '../types.ts';

interface MapViewProps {
  routes: Route[];
  selectedRouteId: number | null;
  onSelectRoute: (id: number | null) => void;
  viewState: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMove: (viewState: any) => void;
}

export function MapView({ routes, selectedRouteId, onSelectRoute, viewState, onMove }: MapViewProps) {
  const lineDisplayStyle = {
    id: 'route-line',
    type: 'line',
    paint: {
      'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#D97706', '#3B82F6'], // Orange selected, Blue default
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 4, 3],
      'line-opacity': 0.8
    }
  };

  const lineHitBoxStyle = {
    id: 'route-line-hitbox',
    type: 'line',
    paint: {
      'line-color': 'transparent',
      'line-width': 20,
      'line-opacity': 0
    }
  };

  const routesGeoJson = useMemo(() => {
    return {
      type: "FeatureCollection",
      features: routes.map(r => ({
        type: "Feature",
        geometry: r.geojson,
        properties: { id: r.id, title: r.title },
        id: r.id
      }))
    };
  }, [routes]);

  const dynamicLineStyle = {
    ...lineDisplayStyle,
    paint: {
        ...lineDisplayStyle.paint,
        'line-color': ['case', ['==', ['get', 'id'], selectedRouteId || -1], '#D97706', '#834E21'],
        'line-width': ['case', ['==', ['get', 'id'], selectedRouteId || -1], 5, 3],
        'line-opacity': ['case', ['==', ['get', 'id'], selectedRouteId || -1], 1, 0.6]
    }
  };

  return (
    <div className="map-container">
      <Map
        {...viewState}
        onMove={evt => onMove(evt.viewState)}
        mapStyle="https://api.maptiler.com/maps/outdoor-v4-dark/style.json?key=di0gshXc0zUqmVTNctjb"
        onClick={(e) => {
           const feature = e.features?.[0];
           if (feature) {
               onSelectRoute(feature.properties?.id);
           } else {
               onSelectRoute(null);
           }
        }}
        interactiveLayerIds={['route-line-hitbox']}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Source id="routes-data" type="geojson" data={routesGeoJson as any}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Layer {...dynamicLineStyle as any} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Layer {...lineHitBoxStyle as any} />
        </Source>
      </Map>
    </div>
  );
}
