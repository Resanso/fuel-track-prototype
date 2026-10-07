/**
 * Uji skenario end-to-end tanpa jaringan: geometri jalan sintetis,
 * simulator ping GPS, lalu analitik dijalankan atas ping yang diterima.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrip, tripStateAt, type RouteGeometry } from "../src/lib/trip.ts";
import { deriveAlerts } from "../src/lib/alerts.ts";
import type { Assignment, ServicePoint, Vehicle } from "../src/lib/fleetData.ts";
import type { LngLat } from "../src/lib/analytics.ts";

const LAT = -6.9;
const stops: ServicePoint[] = [
  { id: "pool", name: "Pool", kind: "pool", lng: 107.6, lat: LAT },
  { id: "tps-1", name: "TPS 1", kind: "tps", lng: 107.61, lat: LAT },
  { id: "tps-2", name: "TPS 2", kind: "tps", lng: 107.62, lat: LAT },
  { id: "depo", name: "Depo", kind: "depo", lng: 107.63, lat: LAT },
];

function line(points: [number, number][], step = 0.0005): LngLat[] {
  const out: LngLat[] = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let s = 0; s < n; s++) out.push({ lng: a[0] + ((b[0] - a[0]) * s) / n, lat: a[1] + ((b[1] - a[1]) * s) / n });
  }
  const last = points[points.length - 1];
  out.push({ lng: last[0], lat: last[1] });
  return out;
}

const plannedWps = stops.map((s) => [s.lng, s.lat] as [number, number]);
const planned: RouteGeometry = { line: line(plannedWps), snapped: stops.map(({ lng, lat }) => ({ lng, lat })) };

const vehicle: Vehicle = {
  id: "v99", code: "UJI-99", plate: "D 0000 X", model: "Uji", type: "Dump Truck", upt: "UPT Uji", driver: "Uji",
  fuel: { kmPerLiter: 4, literPerStop: 0.1 }, gpsIntervalS: 10, color: "#000",
};

function assignment(sim: Partial<Assignment["sim"]>): Assignment {
  return {
    vehicleId: "v99", routeName: "Rute Uji", stopIds: stops.map((s) => s.id),
    sim: { startProgress: 0, speedKmh: 24, dwellS: 180, adminFuelFactor: 1.0, ...sim },
  };
}

const allStops = stops.map((s) => ({ stopId: s.id }));

test("kendaraan patuh: tanpa penyimpangan, semua TPS terlayani, BBM wajar", () => {
  const trip = buildTrip(vehicle, assignment({ adminFuelFactor: 1.04 }), stops, planned, planned, allStops);
  const st = tripStateAt(trip, trip.durationS + 1);
  assert.equal(st.deviations.length, 0);
  assert.deepEqual(st.statuses, ["terlayani", "terlayani", "terlayani"]);
  assert.equal(st.fuel?.status, "wajar");
  assert.ok(st.availabilityPct >= 99);
  assert.ok(Math.abs(st.gpsDistanceKm - trip.plannedLengthM / 1000) / (trip.plannedLengthM / 1000) < 0.05);
  assert.equal(deriveAlerts(trip, st).length, 0);
});

test("jalan memutar terdeteksi sebagai penyimpangan rute", () => {
  const detourPts: [number, number][] = [[107.6, LAT], [107.61, LAT], [107.612, -6.893], [107.618, -6.893], [107.62, LAT], [107.63, LAT]];
  const actual: RouteGeometry = { line: line(detourPts), snapped: detourPts.map(([lng, lat]) => ({ lng, lat })) };
  const wps = [{ stopId: "pool" }, { stopId: "tps-1" }, { stopId: null }, { stopId: null }, { stopId: "tps-2" }, { stopId: "depo" }];
  const trip = buildTrip(vehicle, assignment({ adminFuelFactor: 1.0 }), stops, planned, actual, wps);
  const st = tripStateAt(trip, trip.durationS + 1);
  assert.equal(st.deviations.length, 1);
  assert.ok(st.deviations[0].maxDistanceM > 700);
  assert.ok(st.compliancePct < 80);
  assert.ok(deriveAlerts(trip, st).some((a) => a.category === "rute"));
});

test("TPS yang dilewati tanpa berhenti dinyatakan terlewat", () => {
  const wps = [{ stopId: "pool" }, { stopId: "tps-2" }, { stopId: "depo" }];
  const actual: RouteGeometry = {
    line: planned.line,
    snapped: [stops[0], stops[2], stops[3]].map(({ lng, lat }) => ({ lng, lat })),
  };
  const trip = buildTrip(vehicle, assignment({}), stops, planned, actual, wps);
  const mid = tripStateAt(trip, trip.durationS * 0.2);
  assert.equal(mid.statuses[0], "menunggu");
  const st = tripStateAt(trip, trip.durationS + 1);
  assert.deepEqual(st.statuses, ["terlewat", "terlayani", "terlayani"]);
  assert.equal(st.deviations.length, 0, "rute fisik sama, hanya tidak berhenti");
  assert.ok(deriveAlerts(trip, st).some((a) => a.category === "tps"));
});

test("BBM administrasi +45% dari kebutuhan → anomali", () => {
  const trip = buildTrip(vehicle, assignment({ adminFuelFactor: 1.45 }), stops, planned, planned, allStops);
  const st = tripStateAt(trip, trip.durationS + 1);
  assert.equal(st.fuel?.status, "anomali");
  assert.ok(st.fuel!.deviationPct > 35 && st.fuel!.deviationPct < 55);
});

test("sinyal hilang menurunkan ketersediaan data dan memicu peringatan", () => {
  const trip = buildTrip(vehicle, assignment({ signalLoss: [{ fromT: 200, toT: 400 }] }), stops, planned, planned, allStops);
  const st = tripStateAt(trip, trip.durationS + 1);
  assert.ok(st.availabilityPct < 95, `got ${st.availabilityPct}`);
  assert.equal(st.gaps.length, 1);
  const cats = deriveAlerts(trip, st).map((a) => a.category);
  assert.ok(cats.includes("data"));
});
