export interface Route {
  id: number;
  source_url: string;
  title: string;
  tags: string[] | null;
  created_at: Date;
  gpx_content?: string;
  geom?: unknown; // PostGIS geometry
  geojson?: GeoJSONLineString | null;
}

export interface RouteRow extends Omit<Route, "geojson"> {
  geojson: string | null;
}

export interface GeoJSONFeature<G extends GeoJSONGeometry | null = GeoJSONGeometry> {
  type: "Feature";
  geometry: G;
  properties: { [name: string]: unknown } | null;
}

export interface GeoJSONGeometry {
  type: string;
  coordinates: unknown[];
}

export interface GeoJSONLineString extends GeoJSONGeometry {
  type: "LineString";
  coordinates: number[][];
}

// Partial typing for the parsed GPX XML structure
export interface GPXParseResult {
  gpx?: {
    trk?: Trk | Trk[];
  };
}

export interface Trk {
  trkseg?: TrkSeg | TrkSeg[];
}

export interface TrkSeg {
  trkpt?: TrkPt[];
}

export interface TrkPt {
  "@lat": string;
  "@lon": string;
}
