/**
 * Early warning: peringatan diturunkan langsung dari hasil analitik,
 * bukan dari data yang ditulis manual.
 */

import { formatClock } from "./fleetData.ts";
import { clockAt, type Trip, type TripState } from "./trip.ts";

export type AlertCategory = "bbm" | "rute" | "tps" | "data";
export type AlertSeverity = "kritis" | "peringatan" | "info";

export interface FleetAlert {
  id: string;
  vehicleId: string;
  vehicleCode: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** Jam kejadian (detik sejak 00:00), untuk pengurutan. */
  t: number;
  clock: string;
}

function at(trip: Trip, tripT: number) {
  const t = clockAt(trip, tripT);
  return { t, clock: formatClock(t) };
}

export const AVAILABILITY_TARGET_PCT = 95;

export function deriveAlerts(trip: Trip, state: TripState): FleetAlert[] {
  const v = trip.vehicle;
  const alerts: FleetAlert[] = [];
  const base = { vehicleId: v.id, vehicleCode: v.code };

  state.deviations.forEach((d, i) => {
    alerts.push({
      ...base,
      id: `${v.id}-rute-${i}`,
      category: "rute",
      severity: "kritis",
      title: d.ongoing ? "Kendaraan keluar rute standar" : "Penyimpangan rute terdeteksi",
      message: `${(d.lengthM / 1000).toFixed(2)} km di luar ${trip.assignment.routeName}, maks. ${Math.round(
        d.maxDistanceM
      )} m dari rute${d.ongoing ? " — masih berlangsung" : ""}.`,
      ...at(trip, d.startT),
    });
  });

  state.statuses.forEach((s, i) => {
    const stop = state.validatedStops[i];
    const v2 = state.visits[i];
    if (s === "tak_terverifikasi") {
      alerts.push({
        ...base,
        id: `${v.id}-tps-${stop.id}`,
        category: "tps",
        severity: "peringatan",
        title: "Kunjungan TPS tidak terverifikasi",
        message: `${stop.name}: kendaraan terlihat di lokasi, tetapi data GPS terputus saat berhenti. Perlu konfirmasi manual.`,
        ...at(trip, state.t),
      });
      return;
    }
    if (s !== "terlewat") return;
    alerts.push({
      ...base,
      id: `${v.id}-tps-${stop.id}`,
      category: "tps",
      severity: "kritis",
      title: "Titik pelayanan tidak dikunjungi",
      message: `${stop.name} terlewat (jarak terdekat ${Math.round(v2.minDistanceM)} m, berhenti ${Math.round(
        v2.dwellS
      )} dtk).`,
      ...at(trip, state.t),
    });
  });

  if (state.fuel && state.fuel.status !== "wajar") {
    const f = state.fuel;
    alerts.push({
      ...base,
      id: `${v.id}-bbm`,
      category: "bbm",
      severity: f.status === "anomali" ? "kritis" : "peringatan",
      title: f.status === "anomali" ? "Anomali BBM" : "BBM perlu dicek",
      message: `Administrasi ${f.adminL.toFixed(1)} L vs estimasi GPS ${f.estimatedL.toFixed(1)} L (${
        f.deviationPct > 0 ? "+" : ""
      }${f.deviationPct.toFixed(1)}%).`,
      ...at(trip, state.t),
    });
  }

  state.gaps.forEach((g, i) => {
    alerts.push({
      ...base,
      id: `${v.id}-gap-${i}`,
      category: "data",
      severity: "peringatan",
      title: "Data GPS terputus",
      message: `Tidak ada data ${Math.round(g.durationS / 60)} menit (${at(trip, g.fromT).clock}–${at(trip, g.toT).clock}).`,
      ...at(trip, g.fromT),
    });
  });

  if (state.pingCount > 30 && state.availabilityPct < AVAILABILITY_TARGET_PCT) {
    alerts.push({
      ...base,
      id: `${v.id}-avail`,
      category: "data",
      severity: "info",
      title: "Ketersediaan data di bawah target",
      message: `${state.availabilityPct.toFixed(1)}% (target ≥ ${AVAILABILITY_TARGET_PCT}%).`,
      ...at(trip, state.t),
    });
  }

  return alerts;
}
