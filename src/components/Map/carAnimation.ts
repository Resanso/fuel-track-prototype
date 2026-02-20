import type { LngLatLike } from "maplibre-gl";

export interface RoutePoint {
  lng: number;
  lat: number;
}

/**
 * Fetch a driving route from OSRM (free, no API key needed)
 */
export async function fetchRoute(
  start: [number, number],
  end: [number, number]
): Promise<RoutePoint[]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.code !== "Ok" || !data.routes?.[0]) {
    throw new Error("Failed to fetch route from OSRM");
  }

  const coordinates: [number, number][] =
    data.routes[0].geometry.coordinates;

  return coordinates.map(([lng, lat]) => ({ lng, lat }));
}

/**
 * Convert route points to GeoJSON for drawing on the map
 */
export function routeToGeoJSON(points: RoutePoint[]): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
  };
}

/**
 * Calculate bearing (rotation angle) between two points
 */
export function calculateBearing(
  start: RoutePoint,
  end: RoutePoint
): number {
  const startLat = (start.lat * Math.PI) / 180;
  const endLat = (end.lat * Math.PI) / 180;
  const diffLng = ((end.lng - start.lng) * Math.PI) / 180;

  const x =
    Math.sin(diffLng) * Math.cos(endLat);
  const y =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(diffLng);

  const bearing = (Math.atan2(x, y) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Interpolate position along route based on progress (0 to 1)
 */
export function interpolateRoute(
  points: RoutePoint[],
  progress: number
): { position: RoutePoint; bearing: number; traveledMeters: number; segmentIndex: number } {
  if (points.length < 2) {
    return { position: points[0], bearing: 0, traveledMeters: 0, segmentIndex: 0 };
  }

  // Calculate total distance
  const distances: number[] = [0];
  let totalDist = 0;

  for (let i = 1; i < points.length; i++) {
    const d = haversineDistance(points[i - 1], points[i]);
    totalDist += d;
    distances.push(totalDist);
  }

  // Find target distance
  const targetDist = progress * totalDist;

  // Find segment
  let segIdx = 0;
  for (let i = 1; i < distances.length; i++) {
    if (distances[i] >= targetDist) {
      segIdx = i - 1;
      break;
    }
  }

  // Interpolate within segment
  const segStart = distances[segIdx];
  const segEnd = distances[segIdx + 1];
  const segLen = segEnd - segStart;
  const t = segLen > 0 ? (targetDist - segStart) / segLen : 0;

  const p1 = points[segIdx];
  const p2 = points[segIdx + 1] || p1;

  const position: RoutePoint = {
    lng: p1.lng + (p2.lng - p1.lng) * t,
    lat: p1.lat + (p2.lat - p1.lat) * t,
  };

  const bearing = calculateBearing(p1, p2);

  return { position, bearing, traveledMeters: targetDist, segmentIndex: segIdx };
}

/**
 * Haversine distance between two points in meters
 */
export function haversineDistance(a: RoutePoint, b: RoutePoint): number {
  const R = 6371e3;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;

  const h =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Convert RoutePoint to MapLibre LngLatLike
 */
export function toMapLngLat(point: RoutePoint): LngLatLike {
  return [point.lng, point.lat];
}
