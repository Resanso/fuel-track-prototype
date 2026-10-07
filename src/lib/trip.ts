/**
 * Simulasi satu ritase kendaraan dan analisis kondisinya pada waktu tertentu.
 *
 * `buildTrip` meniru perangkat GPS: kendaraan bergerak di sepanjang lintasan
 * aktual (yang bisa berbeda dari rute standar), berhenti di TPS, lalu
 * mengirim ping setiap `gpsIntervalS` detik. `tripStateAt` kemudian
 * menjalankan analitik HANYA atas ping yang sudah diterima — persis seperti
 * yang akan dilakukan server terhadap data GPS riil.
 */

import {
  bearingDeg,
  calculateAnomalyScore,
  dataAvailabilityPct,
  detectRouteDeviations,
  detectStopVisits,
  distanceToPolylineM,
  estimateFuelML,
  findDataGaps,
  gpsDistanceM,
  haversineM,
  pathLengthM,
  reconcileFuel,
  routeCompliancePct,
  stopStatuses,
  type DeviationSegment,
  type AnomalyScoreResult,
  type FuelReconciliation,
  type GpsPing,
  type LngLat,
  type MLFeatures,
  type ServicePointRef,
  type StopStatus,
  type StopVisit,
} from "./analytics.ts";
import { SIM_START_CLOCK_S, type Assignment, type ServicePoint, type Vehicle } from "./fleetData.ts";
import { mulberry32 } from "./random.ts";

export interface RouteGeometry {
  line: LngLat[];
  /** Waypoint yang sudah di-snap ke jalan, sesuai urutan permintaan. */
  snapped: LngLat[];
}

/** Waypoint lintasan aktual; `stopId` null untuk titik jalan memutar. */
export interface ActualWaypoint {
  stopId: string | null;
}

interface Phase {
  t0: number;
  t1: number;
  d0: number;
  d1: number;
}

export interface TripStop extends ServicePoint {
  /** Bukan pool: wajib dilayani dan divalidasi. */
  validated: boolean;
}

export interface Trip {
  vehicle: Vehicle;
  assignment: Assignment;
  stops: TripStop[];
  plannedLine: LngLat[];
  plannedLengthM: number;
  path: LngLat[];
  cum: number[];
  phases: Phase[];
  durationS: number;
  startT: number;
  pings: GpsPing[];
  offRouteM: number[];
  plannedEstimateL: number;
  adminFuelL: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Fitur model ML BBM (purwarupa: bobot variabel) pada waktu ritase `t`. */
function mlFeatures(vehicle: Vehicle, t: number, speedKmh: number, servedCount: number): MLFeatures {
  return { speed: speedKmh / 40 || 0.5, idle: (t / 3600) * 0.1, load: 0.85, stop: servedCount / 10, road: 1.0, vehicle: vehicle.code.length * 0.1 };
}

function cumulative(path: LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineM(path[i - 1], path[i]));
  return cum;
}

function pointAtDistance(path: LngLat[], cum: number[], d: number): { p: LngLat; seg: number } {
  const total = cum[cum.length - 1];
  const dd = Math.max(0, Math.min(total, d));
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= dd) lo = mid;
    else hi = mid;
  }
  const segLen = cum[hi] - cum[lo];
  const f = segLen > 0 ? (dd - cum[lo]) / segLen : 0;
  const a = path[lo];
  const b = path[hi];
  return { p: { lng: a.lng + (b.lng - a.lng) * f, lat: a.lat + (b.lat - a.lat) * f }, seg: lo };
}

export function buildTrip(
  vehicle: Vehicle,
  assignment: Assignment,
  stopPoints: ServicePoint[],
  planned: RouteGeometry,
  actual: RouteGeometry,
  actualWaypoints: ActualWaypoint[]
): Trip {
  const sim = assignment.sim;
  const stops: TripStop[] = stopPoints.map((sp, i) => ({
    ...sp,
    // Gunakan koordinat hasil snap ke jalan sebagai titik layanan.
    lng: planned.snapped[i]?.lng ?? sp.lng,
    lat: planned.snapped[i]?.lat ?? sp.lat,
    validated: sp.kind !== "pool",
  }));

  const path = actual.line;
  const cum = cumulative(path);
  const total = cum[cum.length - 1];
  const speedMs = (sim.speedKmh * 1000) / 3600;

  // Jarak di sepanjang lintasan untuk tiap waypoint pemberhentian.
  const stopDistances: number[] = [];
  let searchFrom = 0;
  actualWaypoints.forEach((wp, k) => {
    const target = actual.snapped[k];
    let bestIdx = searchFrom;
    let bestD = Infinity;
    for (let i = searchFrom; i < path.length; i++) {
      const d = haversineM(path[i], target);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
      if (bestD < 5 && d > 200) break;
    }
    searchFrom = bestIdx;
    const sp = wp.stopId ? stops.find((s) => s.id === wp.stopId) : null;
    if (sp?.validated) stopDistances.push(cum[bestIdx]);
  });

  const phases: Phase[] = [];
  let t = 0;
  let d = 0;
  for (const sd of stopDistances) {
    const dt = Math.max(0, sd - d) / speedMs;
    phases.push({ t0: t, t1: t + dt, d0: d, d1: sd });
    t += dt;
    d = sd;
    phases.push({ t0: t, t1: t + sim.dwellS, d0: d, d1: d });
    t += sim.dwellS;
  }
  if (d < total) {
    const dt = (total - d) / speedMs;
    phases.push({ t0: t, t1: t + dt, d0: d, d1: total });
    t += dt;
  }
  const durationS = t;

  const partial: Omit<Trip, "pings" | "offRouteM"> = {
    vehicle,
    assignment,
    stops,
    plannedLine: planned.line,
    plannedLengthM: pathLengthM(planned.line),
    path,
    cum,
    phases,
    durationS,
    startT: sim.startProgress * durationS,
    plannedEstimateL: 0,
    adminFuelL: 0,
  };

  // Ping GPS dengan noise ±4 m dan celah sinyal sesuai skenario.
  const rand = mulberry32(parseInt(vehicle.id.replace(/\D/g, ""), 10) * 7919);
  const pings: GpsPing[] = [];
  for (let pt = 0; pt <= durationS; pt += vehicle.gpsIntervalS) {
    if (sim.signalLoss?.some((g) => pt >= g.fromT && pt <= g.toT)) continue;
    const { position } = motionAt(partial as Trip, pt);
    const noiseM = 4;
    pings.push({
      t: pt,
      lng: position.lng + ((rand() - 0.5) * 2 * noiseM) / (111320 * Math.cos((position.lat * Math.PI) / 180)),
      lat: position.lat + ((rand() - 0.5) * 2 * noiseM) / 110540,
    });
  }

  const validatedCount = stops.filter((s) => s.validated).length;
  // Kebutuhan BBM rute standar memakai model yang sama dengan analitik, agar
  // `adminFuelFactor` skenario = rasio BBM administrasi terhadap kebutuhan wajar.
  const plannedEstimateL = estimateFuelML(
    partial.plannedLengthM / 1000,
    validatedCount,
    vehicle.fuel,
    mlFeatures(vehicle, durationS, 0, validatedCount)
  );

  return {
    ...partial,
    pings,
    offRouteM: pings.map((p) => distanceToPolylineM(p, planned.line)),
    plannedEstimateL,
    adminFuelL: round1(plannedEstimateL * sim.adminFuelFactor),
  };
}

/** Posisi fisik kendaraan (untuk animasi peta), terlepas dari ping yang diterima. */
export function motionAt(trip: Trip, t: number) {
  const tt = Math.max(0, Math.min(trip.durationS, t));
  const phase = trip.phases.find((ph) => tt <= ph.t1) ?? trip.phases[trip.phases.length - 1];
  const f = phase && phase.t1 > phase.t0 ? (tt - phase.t0) / (phase.t1 - phase.t0) : 1;
  const d = phase ? phase.d0 + (phase.d1 - phase.d0) * f : 0;
  const moving = !!phase && phase.d1 > phase.d0 && tt < trip.durationS;
  const { p, seg } = pointAtDistance(trip.path, trip.cum, d);
  const ahead = pointAtDistance(trip.path, trip.cum, d + 8).p;
  const behind = pointAtDistance(trip.path, trip.cum, d - 8).p;
  return {
    position: p,
    distanceM: d,
    segmentIndex: seg,
    bearing: bearingDeg(behind, ahead),
    speedKmh: moving ? trip.assignment.sim.speedKmh : 0,
  };
}

export interface TripState {
  t: number;
  done: boolean;
  position: LngLat;
  bearing: number;
  speedKmh: number;
  /** Jumlah ping yang sudah diterima. */
  pingCount: number;
  gpsDistanceKm: number;
  availabilityPct: number;
  gaps: { fromT: number; toT: number; durationS: number }[];
  deviations: DeviationSegment[];
  compliancePct: number;
  offRouteNow: boolean;
  visits: StopVisit[];
  statuses: StopStatus[];
  servedCount: number;
  validatedStops: TripStop[];
  fuelEstimateL: number;
  /** Rekonsiliasi akhir; tersedia setelah ritase selesai. */
  fuel: FuelReconciliation | null;
  anomaly: AnomalyScoreResult | null;
}


export function tripStateAt(trip: Trip, t: number): TripState {
  const tt = Math.max(0, Math.min(trip.durationS, t));
  const done = t >= trip.durationS;
  let n = 0;
  while (n < trip.pings.length && trip.pings[n].t <= tt) n++;
  const pings = trip.pings.slice(0, n);
  const offRoute = trip.offRouteM.slice(0, n);

  const motion = motionAt(trip, tt);
  const gpsDistance = gpsDistanceM(pings);
  const deviations = detectRouteDeviations(pings, offRoute);
  const validatedStops = trip.stops.filter((s) => s.validated);
  const visits = detectStopVisits(pings, validatedStops as ServicePointRef[]);
  const statuses = stopStatuses(visits, done);
  const servedCount = visits.filter((v) => v.visited).length;
  // Implementasi ML Features secara purwarupa (mock variable weight)
  const fuelEstimateL = estimateFuelML(
    gpsDistance / 1000,
    servedCount,
    trip.vehicle.fuel,
    mlFeatures(trip.vehicle, tt, motion.speedKmh, servedCount)
  );
  
  const compliance = routeCompliancePct(gpsDistance, deviations);
  let anomaly: AnomalyScoreResult | null = null;
  if (done) {
    const fuelResult = reconcileFuel(fuelEstimateL, trip.adminFuelL);
    const missedStops = statuses.filter(s => s === "terlewat").length; // we keep old strings inside analytics tests for now, but UI will show english.
    const gaps = findDataGaps(pings, trip.vehicle.gpsIntervalS);
    anomaly = calculateAnomalyScore(compliance, fuelResult.deviationPct, missedStops, validatedStops.length, gaps.length);
  }

  return {
    t: tt,
    done,
    position: motion.position,
    bearing: motion.bearing,
    speedKmh: motion.speedKmh,
    pingCount: n,
    gpsDistanceKm: gpsDistance / 1000,
    availabilityPct: dataAvailabilityPct(pings, trip.vehicle.gpsIntervalS, 0, tt),
    gaps: findDataGaps(pings, trip.vehicle.gpsIntervalS),
    deviations,
    compliancePct: routeCompliancePct(gpsDistance, deviations),
    offRouteNow: deviations.some((d) => d.ongoing),
    visits,
    statuses,
    servedCount,
    validatedStops,
    fuelEstimateL,
    fuel: done ? reconcileFuel(fuelEstimateL, trip.adminFuelL) : null,
    anomaly,
  };

}

/** Potongan lintasan aktual yang sudah ditempuh (untuk digambar di peta). */
export function traveledPath(trip: Trip, t: number): [number, number][] {
  const { position, segmentIndex } = motionAt(trip, t);
  const coords = trip.path.slice(0, segmentIndex + 1).map((p) => [p.lng, p.lat] as [number, number]);
  coords.push([position.lng, position.lat]);
  return coords;
}

/** Jam dinding (detik sejak 00:00) untuk waktu ritase `tripT`. */
export function clockAt(trip: Trip, tripT: number): number {
  return SIM_START_CLOCK_S - trip.startT + tripT;
}
