/**
 * Menyiapkan ritase simulasi: mengambil geometri jalan dari OSRM untuk rute
 * standar dan lintasan aktual, lalu membangun Trip untuk tiap kendaraan.
 */

import { ASSIGNMENTS, getServicePoint, getVehicle } from "./fleetData.ts";
import type { LngLat } from "./analytics.ts";
import { buildTrip, type ActualWaypoint, type RouteGeometry, type Trip } from "./trip.ts";

const CACHE_PREFIX = "osrm:v1:";

function straightLine(waypoints: [number, number][]): RouteGeometry {
  const line: LngLat[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const [a, b] = [waypoints[i - 1], waypoints[i]];
    for (let s = 0; s < 20; s++) {
      const f = s / 20;
      line.push({ lng: a[0] + (b[0] - a[0]) * f, lat: a[1] + (b[1] - a[1]) * f });
    }
  }
  const last = waypoints[waypoints.length - 1];
  line.push({ lng: last[0], lat: last[1] });
  return { line, snapped: waypoints.map(([lng, lat]) => ({ lng, lat })) };
}

/** Rute jalan melalui seluruh waypoint (OSRM publik, tanpa API key). */
export async function fetchRoadRoute(waypoints: [number, number][]): Promise<RouteGeometry> {
  const coords = waypoints.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(";");
  const key = CACHE_PREFIX + coords;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached) as RouteGeometry;
  } catch {
    /* storage tidak tersedia */
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) throw new Error(data.code ?? "OSRM error");
    const geometry: RouteGeometry = {
      line: (data.routes[0].geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lng, lat })),
      snapped: (data.waypoints as { location: [number, number] }[]).map(({ location: [lng, lat] }) => ({
        lng,
        lat,
      })),
    };
    try {
      localStorage.setItem(key, JSON.stringify(geometry));
    } catch {
      /* abaikan */
    }
    return geometry;
  } catch (err) {
    console.warn("OSRM gagal, memakai garis lurus:", err);
    return straightLine(waypoints);
  }
}

export async function loadTrips(): Promise<Trip[]> {
  const trips: Trip[] = [];
  // Berurutan agar tidak terkena rate limit server OSRM publik.
  for (const assignment of ASSIGNMENTS) {
    const vehicle = getVehicle(assignment.vehicleId);
    const stopPoints = assignment.stopIds.map(getServicePoint);
    const plannedWps = stopPoints.map((s) => [s.lng, s.lat] as [number, number]);
    const planned = await fetchRoadRoute(plannedWps);

    const sim = assignment.sim;
    const actualWps: { coord: [number, number]; wp: ActualWaypoint }[] = [];
    stopPoints.forEach((s, i) => {
      if (!sim.skipStopIds?.includes(s.id)) {
        const snapped = planned.snapped[i];
        actualWps.push({ coord: [snapped.lng, snapped.lat], wp: { stopId: s.id } });
      }
      if (sim.detour?.afterStop === i) {
        for (const via of sim.detour.via) actualWps.push({ coord: via, wp: { stopId: null } });
      }
    });

    const isSame = actualWps.length === stopPoints.length;
    const actual = isSame ? planned : await fetchRoadRoute(actualWps.map((a) => a.coord));

    trips.push(buildTrip(vehicle, assignment, stopPoints, planned, actual, actualWps.map((a) => a.wp)));
  }
  return trips;
}
