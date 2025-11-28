export interface ValhallaSegment {
  start: number;
  end: number;
  duration: number;
  length: number; // km
  surface: string;
  road_class?: string;
  speed?: number;
  use?: string;
  bicycle_type?: string;
  lane_count?: number;
  cycle_lane?: string;
  bicycle_network?: string;
}
