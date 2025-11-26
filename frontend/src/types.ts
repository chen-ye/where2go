export interface Route {
  id: number;
  source_url: string;
  title: string;
  tags: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geojson: any;
  // Mock data for stats if not present in backend yet
  distance?: number;
  elevation?: string;
  time?: string;
  total_ascent?: number;
  total_descent?: number;
}
