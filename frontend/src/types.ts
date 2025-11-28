import type { LineString, MultiLineString } from "geojson";

export interface ValhallaSegment {
  start: number;
  end: number;
  duration: number;
  surface: string;
  road_class?: string;
  speed?: number;
  use?: string;
  bicycle_type?: string;
  lane_count?: number;
  cycle_lane?: string;
  bicycle_network?: string;
}

export interface Route {
  id: number;
  source_url: string;
  title: string;
  tags: string[];
  is_completed: boolean;
  geojson: LineString | MultiLineString;
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
