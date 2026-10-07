import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dataAvailabilityPct,
  detectRouteDeviations,
  detectStopVisits,
  distanceToPolylineM,
  estimateFuelL,
  findDataGaps,
  gpsDistanceM,
  haversineM,
  pathLengthM,
  reconcileFuel,
  routeCompliancePct,
  stopStatuses,
  type GpsPing,
  type LngLat,
} from "../src/lib/analytics.ts";

const P = (lng: number, lat: number): LngLat => ({ lng, lat });
const ping = (t: number, lng: number, lat: number): GpsPing => ({ t, lng, lat });

test("haversine: 1° lintang ≈ 111,2 km (bumi bola)", () => {
  const d = haversineM(P(107.6, -6.9), P(107.6, -5.9));
  assert.ok(Math.abs(d - 111_195) < 50, `got ${d}`);
});

test("panjang lintasan = jumlah segmen", () => {
  const line = [P(107.6, -6.9), P(107.6, -6.899), P(107.6, -6.898)];
  assert.ok(Math.abs(pathLengthM(line) - 2 * haversineM(line[0], line[1])) < 1e-6);
});

test("jarak titik ke polyline (tegak lurus)", () => {
  const line = [P(107.6, -6.9), P(107.61, -6.9)];
  const d = distanceToPolylineM(P(107.605, -6.8995), line); // ~55 m utara
  assert.ok(Math.abs(d - 55.3) < 1.5, `got ${d}`);
  assert.ok(distanceToPolylineM(P(107.605, -6.9), line) < 0.5);
});

test("jarak GPS menyaring jitter saat kendaraan diam", () => {
  const diam = Array.from({ length: 30 }, (_, i) => ping(i * 10, 107.6 + (i % 2) * 0.00004, -6.9)); // lompat ±4 m
  assert.ok(pathLengthM(diam) > 100);
  assert.ok(gpsDistanceM(diam) < 5);
  const jalan = Array.from({ length: 11 }, (_, i) => ping(i * 10, 107.6 + i * 0.001, -6.9));
  assert.ok(Math.abs(gpsDistanceM(jalan) - pathLengthM(jalan)) < 1e-6);
});

test("estimasi BBM = jarak/rasio + tambahan per TPS", () => {
  assert.equal(estimateFuelL(40, 10, { kmPerLiter: 4, literPerStop: 0.2 }), 12);
  assert.throws(() => estimateFuelL(10, 0, { kmPerLiter: 0, literPerStop: 0 }));
});

test("rekonsiliasi BBM: ambang wajar / perlu cek / anomali", () => {
  assert.equal(reconcileFuel(10, 10.8).status, "wajar"); // +8%
  assert.equal(reconcileFuel(10, 11.5).status, "perlu_cek"); // +15%
  assert.equal(reconcileFuel(10, 12.5).status, "anomali"); // +25%
  assert.equal(reconcileFuel(10, 7.5).status, "anomali"); // −25%
  const r = reconcileFuel(20, 26);
  assert.equal(r.deviationL, 6);
  assert.ok(Math.abs(r.deviationPct - 30) < 1e-9);
});

test("deteksi penyimpangan rute mengabaikan noise singkat", () => {
  const pings = Array.from({ length: 12 }, (_, i) => ping(i * 10, 107.6 + i * 0.0005, -6.9));
  const off = [0, 5, 80, 4, 3, 90, 120, 150, 110, 5, 2, 1]; // 1 ping noise, 4 ping menyimpang
  const segs = detectRouteDeviations(pings, off, { thresholdM: 60, minConsecutive: 3 });
  assert.equal(segs.length, 1);
  assert.equal(segs[0].startIndex, 5);
  assert.equal(segs[0].endIndex, 8);
  assert.equal(segs[0].maxDistanceM, 150);
  assert.equal(segs[0].ongoing, false);
  const compliance = routeCompliancePct(pathLengthM(pings), segs);
  assert.ok(compliance > 60 && compliance < 80, `got ${compliance}`);
});

test("penyimpangan yang masih berlangsung ditandai ongoing", () => {
  const pings = Array.from({ length: 5 }, (_, i) => ping(i * 10, 107.6, -6.9 + i * 0.001));
  const segs = detectRouteDeviations(pings, [0, 0, 70, 80, 90]);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].ongoing, true);
});

test("kunjungan TPS butuh waktu berhenti, bukan sekadar lewat", () => {
  const tps = { id: "tps-a", lng: 107.6, lat: -6.9 };
  const lewat = [ping(0, 107.5995, -6.9), ping(10, 107.6, -6.9), ping(20, 107.6005, -6.9)];
  const berhenti = [ping(0, 107.5995, -6.9), ...Array.from({ length: 15 }, (_, i) => ping(10 + i * 10, 107.6, -6.9)), ping(170, 107.6005, -6.9)];
  assert.equal(detectStopVisits(lewat, [tps])[0].visited, false);
  const v = detectStopVisits(berhenti, [tps])[0];
  assert.equal(v.visited, true);
  assert.equal(v.arrivedT, 10);
  assert.equal(v.dwellS, 140);
});

test("status TPS: terlewat bila TPS berikutnya sudah dilayani atau ritase selesai", () => {
  const mk = (visited: boolean) => ({ stopId: "x", visited, arrivedT: null, dwellS: 0, minDistanceM: 0, nearDataGap: false });
  assert.deepEqual(stopStatuses([mk(true), mk(false), mk(true), mk(false)], false), [
    "terlayani",
    "terlewat",
    "terlayani",
    "menunggu",
  ]);
  assert.deepEqual(stopStatuses([mk(true), mk(false)], true), ["terlayani", "terlewat"]);
});

test("TPS di tepi celah data GPS → tidak terverifikasi, bukan terlewat", () => {
  const tps = { id: "tps-a", lng: 107.6, lat: -6.9 };
  // sinyal hilang t=20..250 saat kendaraan berhenti di TPS
  const pings = [ping(0, 107.598, -6.9), ping(10, 107.599, -6.9), ping(260, 107.6, -6.9), ping(270, 107.601, -6.9), ping(280, 107.602, -6.9)];
  const v = detectStopVisits(pings, [tps]);
  assert.equal(v[0].visited, false);
  assert.equal(v[0].nearDataGap, true);
  assert.deepEqual(stopStatuses(v, true), ["tak_terverifikasi"]);
});

test("ketersediaan data dan deteksi celah sinyal", () => {
  const pings = [0, 10, 20, 30, 40, 100, 110].map((t) => ping(t, 107.6, -6.9));
  const pct = dataAvailabilityPct(pings, 10, 0, 110); // 7 dari 12
  assert.ok(Math.abs(pct - (7 / 12) * 100) < 1e-9);
  const gaps = findDataGaps(pings, 10);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].durationS, 60);
});
