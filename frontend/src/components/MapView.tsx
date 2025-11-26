import {MapboxOverlay} from '@deck.gl/mapbox';
import {type DeckProps, type PickingInfo} from '@deck.gl/core';

import Map, { Source, NavigationControl, GeolocateControl, useControl, type ViewState, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useMemo, useState } from 'react';
import type { Route } from '../types.ts';
import { GeoJsonLayer, ScatterplotLayer } from 'deck.gl';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

function DeckGLOverlay(props: DeckProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

const MAPTILER_API_KEY = 'di0gshXc0zUqmVTNctjb';

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
}

export function MapView({ routes, selectedRouteId, onSelectRoute, viewState, onMove, hoveredLocation, onHover }: MapViewProps) {
  // const [hoverInfo, setHoverInfo] = useState<PickingInfo<Feature<Geometry, {}>>>();

  const routesGeoJson: FeatureCollection = useMemo(() => {
    return {
      type: "FeatureCollection",
      features: routes.map(r => ({
        type: "Feature",
        properties: {
          id: r.id,
          title: r.title,
          selected: r.id === selectedRouteId
        },
        geometry: r.geojson
      }))
    };
  }, [routes, selectedRouteId]);


  const deckGLLayers: DeckProps['layers'] = useMemo(() => {
    const layers: any[] = [
      new GeoJsonLayer({
        id: 'route-lines',
        data: routesGeoJson,
        getLineColor: (object) => object.properties.id === selectedRouteId ? [217, 119, 6, 255] : [167, 119, 199, 80],
        getLineWidth: (object) => object.properties.id === selectedRouteId ? 60 : 10,
        lineWidthUnits: 'meters',
        pickable: true,
        stroked: true,
        onHover: (info) => {
             if (info.object) {
                 // We need to get the coordinate on the line that is hovered.
                 // info.coordinate is [lon, lat]
                 if (info.coordinate) {
                     onHover({ lat: info.coordinate[1], lon: info.coordinate[0] });
                 }
             } else {
                 onHover(null);
             }
        },
        lineWidthMinPixels: 1,
        onClick: (info) => {
          onSelectRoute(info.object.properties.id);
        },
        updateTriggers: {
          getLineColor: selectedRouteId,
          getLineWidth: selectedRouteId,
        }
      })
    ];

    if (hoveredLocation) {
        layers.push(
            new ScatterplotLayer({
                id: 'hover-marker',
                data: [{ position: [hoveredLocation.lon, hoveredLocation.lat] }],
                getPosition: (d: { position: [number, number] }) => d.position,
                getFillColor: [255, 255, 255],
                getLineColor: [0, 0, 0],
                getLineWidth: 2,
                getRadius: 10,
                radiusMinPixels: 5,
                radiusMaxPixels: 10
            })
        );
    }

    return layers;
  }, [routesGeoJson, selectedRouteId, hoveredLocation, onHover]);

  return (
    <div className="map-container">
      <Map
          {...viewState}
          onMove={evt => onMove(evt.viewState)}
          mapStyle={`https://api.maptiler.com/maps/dataviz-v4-dark/style.json?key=${MAPTILER_API_KEY}`}
          // mapStyle={`https://api.maptiler.com/maps/outdoor-v4-dark/style.json?key=${MAPTILER_API_KEY}`}
          terrain={{
            source: 'maptiler-terrain',
            exaggeration: 1
          }}
          onClick={useCallback((e: MapLayerMouseEvent) => {
            const feature = e.features?.[0];
            if (feature) {
                onSelectRoute(feature.properties?.id);
            } else {
                onSelectRoute(null);
            }
          }, [onSelectRoute])}
          interactiveLayerIds={['route-line-hitbox']}
        >
          <GeolocateControl position="top-right" />
          <NavigationControl position="top-right" showCompass={true} visualizePitch={true} visualizeRoll={true}/>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Source
            id="maptiler-terrain"
            type="raster-dem"
            url={`https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${MAPTILER_API_KEY}`}
            tileSize={256}
            maxzoom={11} // Max zoom level for Terrain RGB
          />
          <Source id="routes-data" type="geojson" data={routesGeoJson as any}>
            <DeckGLOverlay
              layers={deckGLLayers}
              pickingRadius={10}
              getTooltip={useCallback(({object}: PickingInfo<Feature<Geometry, {id: number, title: string}>>) => (object?.properties.title ?? null), [])} />
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
