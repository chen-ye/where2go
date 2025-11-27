export interface SurfaceSegment {
  start: number;
  end: number;
  surface: string;
  duration: number;
}

interface ValhallaEdge {
  surface?: string;
  begin_shape_index: number;
  end_shape_index: number;
  length: number; // km
  speed: number; // km/h
}

interface ValhallaResponse {
  edges?: ValhallaEdge[];
}

export async function getRouteAttributes(
  coordinates: number[][],
): Promise<SurfaceSegment[] | null> {
  const endpoint = Deno.env.get('VALHALLA_ENDPOINT') ||
    'https://valhalla1.openstreetmap.de/trace_attributes';

  const body = {
    shape: coordinates.map((c) => ({ lat: c[1], lon: c[0] })),
    costing: 'bicycle',
    shape_match: 'map_snap',
    filters: {
      attributes: [
        'edge.surface',
        'edge.begin_shape_index',
        'edge.end_shape_index',
        'edge.length',
        'edge.speed',
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
      console.error(
        `Valhalla API error: ${response.status} ${response.statusText}`,
      );
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
        surface: edge.surface || 'unknown',
        duration: Math.round(duration), // rounding to nearest second
      };
    });
  } catch (e) {
    console.error('Error calling Valhalla API:', e);
    return null;
  }
}
