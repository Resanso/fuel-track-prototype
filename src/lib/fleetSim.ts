/**
 * Data simulasi skala pilot (10 kendaraan) untuk dashboard manajemen.
 * Nilai mentah (jarak, ping, BBM administrasi, kunjungan TPS) dibangkitkan
 * secara deterministik; seluruh indikator dihitung dengan modul analitik yang
 * sama dengan peta operasional.
 */

import {
  estimateFuelL,
  reconcileFuel,
  type FuelReconciliation,
} from "./analytics.ts";
import { FUEL_PARAMS_BY_TYPE, UPT_LIST, type VehicleType } from "./fleetData.ts";
import { mulberry32 } from "./random.ts";

export const FLEET_SIZE = 10;

export interface DailyVehicleRecord {
  code: string;
  plate: string;
  type: VehicleType;
  upt: string;
  online: boolean;
  gpsDistanceKm: number;
  pingsExpected: number;
  pingsReceived: number;
  availabilityPct: number;
  stopsPlanned: number;
  stopsServed: number;
  compliancePct: number;
  routeDeviations: number;
  fuel: FuelReconciliation;
}

export interface MonthlyRecord {
  label: string;
  estimatedL: number;
  adminL: number;
  deviationPct: number;
  anomalies: number;
}

const TYPES: VehicleType[] = ["Dump Truck", "Dump Truck", "Arm Roll", "Arm Roll", "Compactor"];
const round1 = (x: number) => Math.round(x * 10) / 10;

export function generateDailyFleet(seed = 20261007): DailyVehicleRecord[] {
  const rand = mulberry32(seed);
  const records: DailyVehicleRecord[] = [];

  for (let i = 0; i < FLEET_SIZE; i++) {
    const type = TYPES[Math.floor(rand() * TYPES.length)];
    const upt = UPT_LIST[i % UPT_LIST.length];
    const params = FUEL_PARAMS_BY_TYPE[type];
    const online = rand() > 0.05;

    const hours = 6 + rand() * 3;
    const pingsExpected = Math.round((hours * 3600) / 10);
    const lossy = rand() < 0.12;
    const pingsReceived = online
      ? Math.round(pingsExpected * (lossy ? 0.82 + rand() * 0.12 : 0.965 + rand() * 0.035))
      : 0;

    const gpsDistanceKm = online ? round1(38 + rand() * 50) : 0;
    const stopsPlanned = 10 + Math.floor(rand() * 14);
    const missRoll = rand();
    const missed = !online ? stopsPlanned : missRoll < 0.12 ? 1 + Math.floor(rand() * 3) : 0;
    const stopsServed = stopsPlanned - missed;

    const deviates = online && rand() < 0.1;
    const routeDeviations = deviates ? 1 + Math.floor(rand() * 2) : 0;
    const compliancePct = !online ? 0 : deviates ? 72 + rand() * 18 : 96 + rand() * 4;

    const estimatedL = online ? estimateFuelL(gpsDistanceKm, stopsServed, params) : 0;
    const fraudRoll = rand();
    const factor = fraudRoll < 0.08 ? 1.22 + rand() * 0.3 : fraudRoll < 0.18 ? 1.11 + rand() * 0.08 : 0.93 + rand() * 0.15;
    const plannedL = estimateFuelL(online ? gpsDistanceKm : 45, stopsPlanned, params);
    const adminL = round1((online ? estimatedL : plannedL) * factor);

    records.push({
      code: `DLH-${String(i + 1).padStart(3, "0")}`,
      plate: `D ${8000 + i * 7} ${String.fromCharCode(65 + (i % 26))}`,
      type,
      upt,
      online,
      gpsDistanceKm,
      pingsExpected,
      pingsReceived,
      availabilityPct: (pingsReceived / pingsExpected) * 100,
      stopsPlanned,
      stopsServed,
      compliancePct,
      routeDeviations,
      fuel: online
        ? reconcileFuel(estimatedL, adminL)
        : { estimatedL: 0, adminL, deviationL: adminL, deviationPct: Infinity, status: "anomali" },
    });
  }
  return records;
}

const MONTHS = ["Nov", "Des", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt"];

/** Histori 12 bulan (rekap bulanan seluruh armada). */
export function generateMonthlyHistory(seed = 2026): MonthlyRecord[] {
  const rand = mulberry32(seed);
  return MONTHS.map((m, i) => {
    const year = i < 2 ? 2025 : 2026;
    const estimatedL = Math.round(10 * 26 * (19 + rand() * 3));
    // Tren perbaikan setelah monitoring diterapkan (bulan ke-7 dst.).
    const gap = i < 6 ? 0.14 + rand() * 0.06 : 0.09 - (i - 6) * 0.008 + rand() * 0.02;
    const adminL = Math.round(estimatedL * (1 + gap));
    return {
      label: `${m} ${String(year).slice(2)}`,
      estimatedL,
      adminL,
      deviationPct: ((adminL - estimatedL) / estimatedL) * 100,
      anomalies: Math.round((i < 6 ? 14 : 9 - (i - 6)) + rand() * 4),
    };
  });
}

export interface UptSummary {
  upt: string;
  vehicles: number;
  online: number;
  availabilityPct: number;
  compliancePct: number;
  stopsCoveragePct: number;
  estimatedL: number;
  adminL: number;
  deviationPct: number;
  anomalies: number;
}

export function summarizeByUpt(records: DailyVehicleRecord[]): UptSummary[] {
  return UPT_LIST.map((upt) => {
    const rs = records.filter((r) => r.upt === upt);
    const on = rs.filter((r) => r.online);
    const est = on.reduce((s, r) => s + r.fuel.estimatedL, 0);
    const adm = on.reduce((s, r) => s + r.fuel.adminL, 0);
    return {
      upt,
      vehicles: rs.length,
      online: on.length,
      availabilityPct: avg(rs.map((r) => r.availabilityPct)),
      compliancePct: avg(on.map((r) => r.compliancePct)),
      stopsCoveragePct:
        (rs.reduce((s, r) => s + r.stopsServed, 0) / rs.reduce((s, r) => s + r.stopsPlanned, 0)) * 100,
      estimatedL: est,
      adminL: adm,
      deviationPct: est > 0 ? ((adm - est) / est) * 100 : 0,
      anomalies: rs.filter((r) => r.fuel.status === "anomali").length,
    };
  });
}

export function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
