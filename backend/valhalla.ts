import distance from '@turf/distance';
import type { ValhallaSegment } from 'where2go-shared/types/valhalla.ts';

export type { ValhallaSegment };

interface ValhallaEdge {
  begin_shape_index: number;
  end_shape_index: number;
  length: number; // km
  speed: number; // km/h
  surface?: string;
  road_class?: string;
  use?: string;
  bicycle_type?: string;
  lane_count?: number;
  cycle_lane?: string;
  bicycle_network?: string;
}

interface ValhallaResponse {
  edges?: ValhallaEdge[];
}

const MAX_POINTS = 15000;
const MAX_DISTANCE_KM = 150;

/**
 * Fetches and processes route attributes from the Valhalla API.
 * Handles large routes by splitting them into chunks to respect API limits (max points/distance).
 * Stitches the results back together into a single continuous array of segments.
 *
 * @param coordinates - Array of [lon, lat] coordinates representing the route path.
 * @returns Promise resolving to an array of ValhallaSegment objects, or null if processing fails.
 */
export async function getRouteAttributes(
  coordinates: number[][],
): Promise<ValhallaSegment[] | null> {
  if (coordinates.length < 2) return null;

  const chunks: number[][][] = [];
  let currentChunk: number[][] = [coordinates[0]];
  let currentChunkDist = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1];
    const curr = coordinates[i];

    const dist = distance(prev, curr, { units: 'kilometers' });

    if (
      currentChunk.length > 1 &&
      (currentChunk.length >= MAX_POINTS || currentChunkDist + dist > MAX_DISTANCE_KM)
    ) {
      chunks.push(currentChunk);
      currentChunk = [prev, curr];
      currentChunkDist = dist;
    } else {
      currentChunk.push(curr);
      currentChunkDist += dist;
    }
  }
  if (currentChunk.length > 1) {
    chunks.push(currentChunk);
  }

  const allSegments: ValhallaSegment[] = [];
  let indexOffset = 0;

  console.log(`Processing route with ${coordinates.length} points in ${chunks.length} chunks.`);

  for (const chunk of chunks) {
    const segments = await fetchAttributes(chunk);
    if (!segments) {
      console.error('Failed to fetch attributes for a chunk, aborting.');
      return null;
    }

    const adjustedSegments = segments.map((s) => ({
      ...s,
      start: s.start + indexOffset,
      end: s.end + indexOffset,
    }));

    allSegments.push(...adjustedSegments);

    // Offset is increased by (chunk length - 1) because the last point of chunk N
    // is the same as the first point of chunk N+1
    indexOffset += chunk.length - 1;
  }

  return allSegments;
}

async function fetchAttributes(coordinates: number[][]): Promise<ValhallaSegment[] | null> {
  const endpoint =
    process.env.VALHALLA_ENDPOINT || 'https://valhalla1.openstreetmap.de/trace_attributes';

  const body = {
    shape: coordinates.map((c) => ({ lat: c[1], lon: c[0] })),
    costing: 'bicycle',
    costing_options: {
      bicycle: {
        bicycle_type: 'Cross',
        cycling_speed: 25,
      },
    },
    shape_match: 'map_snap',
    filters: {
      attributes: [
        'edge.begin_shape_index',
        'edge.end_shape_index',
        'edge.length',
        'edge.speed',
        'edge.surface',
        'edge.road_class',
        'edge.use',
        'edge.bicycle_type',
        'edge.lane_count',
        'edge.cycle_lane',
        'edge.bicycle_network',
      ],
      action: 'include',
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`Valhalla API error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(`Response body: ${text}`);
      return null;
    }

    const data: ValhallaResponse = await response.json();

    if (!data.edges || !Array.isArray(data.edges)) {
      console.error('Valhalla API response missing edges');
      return null;
    }

    return data.edges.map((edge) => {
      // Calculate duration in seconds
      // length is in km, speed is in km/h
      // duration = (length / speed) * 3600
      let duration = 0;
      if (edge.length > 0 && edge.speed > 0) {
        duration = (edge.length / edge.speed) * 3600;
      }

      return {
        start: edge.begin_shape_index,
        end: edge.end_shape_index,
        duration: Math.round(duration), // rounding to nearest second
        length: edge.length, // km
        surface: edge.surface || 'unknown',
        road_class: edge.road_class,
        speed: edge.speed,
        use: edge.use,
        bicycle_type: edge.bicycle_type,
        lane_count: edge.lane_count,
        cycle_lane: edge.cycle_lane,
        bicycle_network: edge.bicycle_network,
      };
    });
  } catch (e) {
    console.error('Error calling Valhalla API:', e);
    return null;
  }
}
