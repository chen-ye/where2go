import type { StyleSpecification } from "maplibre-gl";

export interface BasemapConfig extends Partial<StyleSpecification> {
  $schema: string;
  id: string;
  name: string;
  url?: string;
  thumbnail?: string;
}

export interface OverlayConfig extends Partial<StyleSpecification> {
  $schema: string;
  order: number;
  id: string;
  name: string;
  url?: string;
  thumbnail?: string;
}

export interface TestConfig extends StyleSpecification {
  order: number;
  id: string;
  name: string;
  url?: string;
  thumbnail?: string;
}
