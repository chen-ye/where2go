import type { LineString, MultiLineString } from "geojson";
import type { ValhallaSegment } from "./valhalla.ts";

export interface Route {
  id: number;
  source_url: string;
  title: string;
  tags: string[];
  is_completed: boolean;
  geojson?: LineString | MultiLineString;
  bbox?: LineString;
  grades?: number[];
  distance?: number;
  elevation?: string;
  time?: string;
  total_ascent?: number;
  total_descent?: number;
  valhalla_segments?: ValhallaSegment[];
}

export interface RouteDataPoint {
  distance: number; // meters
  elevation: number; // meters
  lat: number;
  lon: number;
  grade: number; // percentage
}
