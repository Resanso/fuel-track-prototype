import { deriveAlerts, type FleetAlert } from "./alerts.ts";
import { formatClock, SIM_START_CLOCK_S } from "./fleetData.ts";
import { tripStateAt, type Trip, type TripState } from "./trip.ts";

export interface FleetSnapshot {
  simT: number;
  clock: string;
  items: { trip: Trip; state: TripState }[];
  alerts: FleetAlert[];
}

/** `simT` = detik simulasi sejak tombol mulai; tiap kendaraan punya posisi awal sendiri. */
export function computeSnapshot(trips: Trip[], simT: number): FleetSnapshot {
  const items = trips.map((trip) => ({ trip, state: tripStateAt(trip, trip.startT + simT) }));
  const alerts = items
    .flatMap(({ trip, state }) => deriveAlerts(trip, state))
    .sort((a, b) => b.t - a.t);
  return { simT, clock: formatClock(SIM_START_CLOCK_S + simT), items, alerts };
}
