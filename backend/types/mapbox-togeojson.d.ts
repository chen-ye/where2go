declare module '@mapbox/togeojson' {
  import { FeatureCollection } from 'geojson';

  const toGeoJSON: {
    gpx(doc: Document): FeatureCollection;
    kml(doc: Document): FeatureCollection;
  };

  export default toGeoJSON;
}
