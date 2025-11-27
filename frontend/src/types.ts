import type { LineString, MultiLineString } from "geojson";

export interface Route {
  id: number;
  source_url: string;
  title: string;
  tags: string[];
  geojson: LineString | MultiLineString;
  // Mock data for stats if not present in backend yet
  distance?: number;
  elevation?: string;
  time?: string;
  total_ascent?: number;
  total_descent?: number;
}

export interface RouteDataPoint {
  distance: number; // meters
  elevation: number; // meters
  lat: number;
  lon: number;
  grade: number; // percentage
}
