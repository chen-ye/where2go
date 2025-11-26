export interface Route {
  id: number;
  source_url: string;
  title: string;
  tags: string[] | null;
  created_at: Date;
  gpx_content?: string;
  geom?: unknown; // PostGIS geometry
  geojson?: GeoJSONLineString | null;
  distance?: number;
  total_ascent?: number;
  total_descent?: number;
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
