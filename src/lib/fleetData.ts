/**
 * Data master armada, titik pelayanan, dan penugasan rute.
 *
 * Koordinat TPS adalah perkiraan untuk keperluan simulasi purwarupa dan akan
 * diganti dengan data master DLH (spesifikasi kendaraan, rute, dan titik
 * pelayanan) pada tahap analisis kebutuhan.
 */

import type { FuelParams } from "./analytics.ts";

export type VehicleType = "Dump Truck" | "Arm Roll" | "Compactor";

export interface Vehicle {
  id: string;
  code: string;
  plate: string;
  model: string;
  type: VehicleType;
  upt: string;
  driver: string;
  fuel: FuelParams;
  /** Interval pengiriman data GPS tracker (detik). */
  gpsIntervalS: number;
  color: string;
}

export interface ServicePoint {
  id: string;
  name: string;
  kind: "pool" | "tps" | "depo";
  lng: number;
  lat: number;
}

/**
 * Skenario pembangkit data uji. Bagian ini HANYA dipakai simulator untuk
 * meniru kondisi lapangan; analitik tidak membaca nilai-nilai ini.
 */
export interface SimulationScenario {
  /** Posisi awal dalam ritase (0–1) agar kendaraan tidak mulai bersamaan. */
  startProgress: number;
  /** Kecepatan rata-rata (km/jam). */
  speedKmh: number;
  /** Lama berhenti di tiap TPS (detik). */
  dwellS: number;
  /** TPS yang tidak dikunjungi pengemudi. */
  skipStopIds?: string[];
  /** Titik jalan memutar yang disisipkan setelah stop ke-`afterStop`. */
  detour?: { afterStop: number; via: [number, number][] };
  /** Rentang ping yang hilang (detik sejak awal ritase), meniru sinyal lemah. */
  signalLoss?: { fromT: number; toT: number }[];
  /** BBM administrasi = estimasi rute standar × faktor ini. */
  adminFuelFactor: number;
}

export interface Assignment {
  vehicleId: string;
  routeName: string;
  /** Urutan titik: pool → TPS… → depo/TPS transfer. */
  stopIds: string[];
  sim: SimulationScenario;
}

export const UPT_LIST = [
  "UPT Wilayah Bojonagara",
  "UPT Wilayah Cibeunying",
  "UPT Wilayah Karees",
  "UPT Wilayah Tegalega",
  "UPT Wilayah Ujungberung",
] as const;

export const FUEL_PARAMS_BY_TYPE: Record<VehicleType, FuelParams> = {
  "Dump Truck": { kmPerLiter: 4.0, literPerStop: 0.1 },
  "Arm Roll": { kmPerLiter: 3.6, literPerStop: 0.35 },
  Compactor: { kmPerLiter: 3.0, literPerStop: 0.45 },
};

export const SERVICE_POINTS: ServicePoint[] = [
  // UPT Bojonagara / Cibeunying (utara)
  { id: "pool-sukajadi", name: "Pool Sukajadi", kind: "pool", lng: 107.5962, lat: -6.8862 },
  { id: "tps-cihampelas", name: "TPS Cihampelas", kind: "tps", lng: 107.6035, lat: -6.8938 },
  { id: "tps-tamansari", name: "TPS Tamansari", kind: "tps", lng: 107.6088, lat: -6.8985 },
  { id: "tps-dago", name: "TPS Dago", kind: "tps", lng: 107.6132, lat: -6.8905 },
  { id: "depo-dipatiukur", name: "Depo Dipatiukur", kind: "depo", lng: 107.6168, lat: -6.8862 },

  // Pusat kota
  { id: "pool-gedungsate", name: "Pool Gasibu", kind: "pool", lng: 107.6182, lat: -6.9008 },
  { id: "tps-riau", name: "TPS Jl. RE Martadinata", kind: "tps", lng: 107.6150, lat: -6.9062 },
  { id: "tps-braga", name: "TPS Braga", kind: "tps", lng: 107.6093, lat: -6.9140 },
  { id: "tps-alunalun", name: "TPS Alun-Alun", kind: "tps", lng: 107.6078, lat: -6.9215 },
  { id: "depo-kosambi", name: "Depo Kosambi", kind: "depo", lng: 107.6188, lat: -6.9198 },

  // Selatan
  { id: "pool-buahbatu", name: "Pool Buah Batu", kind: "pool", lng: 107.6338, lat: -6.9405 },
  { id: "tps-buahbatu", name: "TPS Buah Batu", kind: "tps", lng: 107.6295, lat: -6.9368 },
  { id: "tps-pelajar", name: "TPS Pelajar Pejuang", kind: "tps", lng: 107.6215, lat: -6.9335 },
  { id: "tps-karapitan", name: "TPS Karapitan", kind: "tps", lng: 107.6148, lat: -6.9282 },
  { id: "depo-tegalega", name: "Depo Tegalega", kind: "depo", lng: 107.6052, lat: -6.9318 },

  // Barat
  { id: "pool-kopo", name: "Pool Kopo", kind: "pool", lng: 107.5892, lat: -6.9372 },
  { id: "tps-kopo", name: "TPS Kopo", kind: "tps", lng: 107.5932, lat: -6.9302 },
  { id: "tps-pasirkoja", name: "TPS Pasirkoja", kind: "tps", lng: 107.5962, lat: -6.9238 },
  { id: "tps-sudirman", name: "TPS Jl. Sudirman", kind: "tps", lng: 107.5990, lat: -6.9172 },
  { id: "depo-andir", name: "Depo Andir", kind: "depo", lng: 107.5902, lat: -6.9112 },

  // Timur
  { id: "pool-cicadas", name: "Pool Cicadas", kind: "pool", lng: 107.6462, lat: -6.9058 },
  { id: "tps-cicadas", name: "TPS Cicadas", kind: "tps", lng: 107.6418, lat: -6.9048 },
  { id: "tps-supratman", name: "TPS Supratman", kind: "tps", lng: 107.6328, lat: -6.9022 },
  { id: "tps-cihapit", name: "TPS Cihapit", kind: "tps", lng: 107.6242, lat: -6.9030 },
  { id: "depo-gasibu", name: "Depo Gasibu", kind: "depo", lng: 107.6195, lat: -6.8992 },
];

export const VEHICLES: Vehicle[] = [
  {
    id: "v01", code: "DLH-01", plate: "D 8011 A", model: "Hino Dutro 130 HD", type: "Dump Truck",
    upt: "UPT Wilayah Cibeunying", driver: "Ahmad Suryadi",
    fuel: FUEL_PARAMS_BY_TYPE["Dump Truck"], gpsIntervalS: 10, color: "#2563eb",
  },
  {
    id: "v02", code: "DLH-02", plate: "D 8022 A", model: "Mitsubishi Canter Arm Roll", type: "Arm Roll",
    upt: "UPT Wilayah Karees", driver: "Budi Santoso",
    fuel: FUEL_PARAMS_BY_TYPE["Arm Roll"], gpsIntervalS: 10, color: "#db2777",
  },
  {
    id: "v03", code: "DLH-03", plate: "D 8033 A", model: "Isuzu Elf Compactor", type: "Compactor",
    upt: "UPT Wilayah Tegalega", driver: "Cahya Pratama",
    fuel: FUEL_PARAMS_BY_TYPE.Compactor, gpsIntervalS: 10, color: "#d97706",
  },
  {
    id: "v04", code: "DLH-04", plate: "D 8044 A", model: "Hino Dutro 130 HD", type: "Dump Truck",
    upt: "UPT Wilayah Bojonagara", driver: "Deni Firmansyah",
    fuel: FUEL_PARAMS_BY_TYPE["Dump Truck"], gpsIntervalS: 10, color: "#059669",
  },
  {
    id: "v05", code: "DLH-05", plate: "D 8055 A", model: "Mitsubishi Canter Arm Roll", type: "Arm Roll",
    upt: "UPT Wilayah Ujungberung", driver: "Eko Wibowo",
    fuel: FUEL_PARAMS_BY_TYPE["Arm Roll"], gpsIntervalS: 10, color: "#7c3aed",
  },
];

export const ASSIGNMENTS: Assignment[] = [
  {
    vehicleId: "v01",
    routeName: "Rute Cibeunying 01",
    stopIds: ["pool-sukajadi", "tps-cihampelas", "tps-tamansari", "tps-dago", "depo-dipatiukur"],
    sim: { startProgress: 0.15, speedKmh: 22, dwellS: 240, adminFuelFactor: 1.04 },
  },
  {
    // Skenario: keluar rute standar + BBM administrasi jauh di atas estimasi.
    vehicleId: "v02",
    routeName: "Rute Karees 03",
    stopIds: ["pool-gedungsate", "tps-riau", "tps-braga", "tps-alunalun", "depo-kosambi"],
    sim: {
      startProgress: 0.05, speedKmh: 24, dwellS: 240, adminFuelFactor: 1.6,
      detour: { afterStop: 1, via: [[107.6275, -6.9105], [107.6240, -6.9160]] },
    },
  },
  {
    // Skenario: satu TPS dilaporkan namun tidak dikunjungi.
    vehicleId: "v03",
    routeName: "Rute Tegalega 02",
    stopIds: ["pool-buahbatu", "tps-buahbatu", "tps-pelajar", "tps-karapitan", "depo-tegalega"],
    sim: {
      startProgress: 0.1, speedKmh: 20, dwellS: 300, adminFuelFactor: 1.08,
      skipStopIds: ["tps-pelajar"],
    },
  },
  {
    // Skenario: sinyal GPS hilang ±4 menit (uji ketersediaan data).
    vehicleId: "v04",
    routeName: "Rute Bojonagara 01",
    stopIds: ["pool-kopo", "tps-kopo", "tps-pasirkoja", "tps-sudirman", "depo-andir"],
    sim: {
      startProgress: 0.2, speedKmh: 22, dwellS: 240, adminFuelFactor: 0.97,
      signalLoss: [{ fromT: 900, toT: 1140 }],
    },
  },
  {
    vehicleId: "v05",
    routeName: "Rute Ujungberung 04",
    stopIds: ["pool-cicadas", "tps-cicadas", "tps-supratman", "tps-cihapit", "depo-gasibu"],
    sim: { startProgress: 0.0, speedKmh: 21, dwellS: 240, adminFuelFactor: 1.13 },
  },
];

export function getServicePoint(id: string): ServicePoint {
  const sp = SERVICE_POINTS.find((s) => s.id === id);
  if (!sp) throw new Error(`Titik pelayanan tidak dikenal: ${id}`);
  return sp;
}

export function getVehicle(id: string): Vehicle {
  const v = VEHICLES.find((x) => x.id === id);
  if (!v) throw new Error(`Kendaraan tidak dikenal: ${id}`);
  return v;
}

/** Jam dinding saat simulasi dimulai (detik sejak 00:00). */
export const SIM_START_CLOCK_S = 6.5 * 3600;

/** Format detik-sejak-00:00 menjadi HH:MM. */
export function formatClock(clockS: number): string {
  const total = Math.floor(clockS);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
