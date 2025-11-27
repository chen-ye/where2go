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

export interface RouteRow extends Omit<Route, 'geojson'> {
  geojson: string | null;
}
