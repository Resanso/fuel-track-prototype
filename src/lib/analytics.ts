/**
 * Modul analitik operasional armada DLH.
 *
 * Semua fungsi di sini murni (tanpa efek samping, tanpa akses jaringan/DOM)
 * sehingga dapat diuji langsung dengan `npm test` dan dipakai ulang oleh
 * backend saat data GPS riil sudah masuk.
 */

export interface LngLat {
  lng: number;
  lat: number;
}

/** Satu titik data GPS yang diterima server. `t` dalam detik sejak awal ritase. */
export interface GpsPing extends LngLat {
  t: number;
}

const EARTH_RADIUS_M = 6371008.8;
const DEG = Math.PI / 180;

// ─── Geometri dasar ──────────────────────────────────────────

export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLengthM(points: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineM(points[i - 1], points[i]);
  return total;
}

/**
 * Jarak tempuh dari ping GPS. Perpindahan di bawah `minStepM` dari titik
 * terakhir yang diterima dianggap jitter (kendaraan diam di TPS) dan diabaikan.
 */
export function gpsDistanceM(pings: LngLat[], minStepM = 12): number {
  if (pings.length < 2) return 0;
  let total = 0;
  let anchor = pings[0];
  for (let i = 1; i < pings.length; i++) {
    const d = haversineM(anchor, pings[i]);
    if (d >= minStepM) {
      total += d;
      anchor = pings[i];
    }
  }
  return total;
}

export function bearingDeg(a: LngLat, b: LngLat): number {
  const y = Math.sin((b.lng - a.lng) * DEG) * Math.cos(b.lat * DEG);
  const x =
    Math.cos(a.lat * DEG) * Math.sin(b.lat * DEG) -
    Math.sin(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos((b.lng - a.lng) * DEG);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Proyeksi ekuirektangular lokal (akurat untuk jarak < beberapa km). */
function toLocalXY(p: LngLat, ref: LngLat): [number, number] {
  return [
    (p.lng - ref.lng) * DEG * EARTH_RADIUS_M * Math.cos(ref.lat * DEG),
    (p.lat - ref.lat) * DEG * EARTH_RADIUS_M,
  ];
}

export function distanceToSegmentM(p: LngLat, a: LngLat, b: LngLat): number {
  const [ax, ay] = toLocalXY(a, p);
  const [bx, by] = toLocalXY(b, p);
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Jarak terdekat (meter) dari sebuah titik ke polyline rute standar. */
export function distanceToPolylineM(p: LngLat, line: LngLat[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return haversineM(p, line[0]);
  let min = Infinity;
  for (let i = 1; i < line.length; i++) {
    const d = distanceToSegmentM(p, line[i - 1], line[i]);
    if (d < min) min = d;
  }
  return min;
}

// ─── Estimasi & rekonsiliasi BBM ─────────────────────────────

export interface FuelParams {
  /** Rasio konsumsi kendaraan saat berjalan (km per liter). */
  kmPerLiter: number;
  /** Tambahan BBM per titik layanan (mis. PTO kompaktor / hidrolik arm roll). */
  literPerStop: number;
}
export interface MLFeatures {
  speed: number;
  idle: number;
  load: number;
  stop: number;
  road: number;
  vehicle: number;
}

/** 
 * Prediksi BBM Berbasis Machine Learning.
 * Model proposed ditargetkan menurunkan MAE menjadi <10-15%.
 * Fuel = f(distance, speed, idle, load, stop, road, vehicle)
 */
export function estimateFuelML(distanceKm: number, servedStops: number, params: FuelParams, features: MLFeatures): number {
  if (params.kmPerLiter <= 0) throw new Error("kmPerLiter harus > 0");
  // Baseline formula
  let baseEstimate = distanceKm / params.kmPerLiter + servedStops * params.literPerStop;
  // Mock ML adjustments based on features
  const featureMultiplier = 1.0 + (features.speed * 0.05) + (features.idle * 0.1) + (features.load * 0.15) + (features.road * 0.05) + (features.vehicle * 0.05);
  return baseEstimate * featureMultiplier;
}

export function estimateFuelL(distanceKm: number, servedStops: number, params: FuelParams): number {
  // Fallback to simple calculation
  if (params.kmPerLiter <= 0) throw new Error("kmPerLiter harus > 0");
  return distanceKm / params.kmPerLiter + servedStops * params.literPerStop;
}

export type FuelStatus = "wajar" | "perlu_cek" | "anomali";

export interface FuelThresholds {
  /** Deviasi (%) di atas nilai ini → perlu dicek. Target proposed: <10-15% MAE */
  warnPct: number;
  /** Deviasi (%) di atas nilai ini → anomali. */
  anomalyPct: number;
}

export const DEFAULT_FUEL_THRESHOLDS: FuelThresholds = { warnPct: 10, anomalyPct: 15 };

export interface FuelReconciliation {
  estimatedL: number;
  adminL: number;
  deviationL: number;
  /** (BBM administrasi − estimasi) / estimasi × 100. Positif = administrasi lebih besar. */
  deviationPct: number;
  status: FuelStatus;
}

export function reconcileFuel(
  estimatedL: number,
  adminL: number,
  thresholds: FuelThresholds = DEFAULT_FUEL_THRESHOLDS
): FuelReconciliation {
  const deviationL = adminL - estimatedL;
  const deviationPct = estimatedL > 0 ? (deviationL / estimatedL) * 100 : adminL > 0 ? Infinity : 0;
  const abs = Math.abs(deviationPct);
  const status: FuelStatus =
    abs > thresholds.anomalyPct ? "anomali" : abs > thresholds.warnPct ? "perlu_cek" : "wajar";
  return { estimatedL, adminL, deviationL, deviationPct, status };
}

// ─── Validasi rute ───────────────────────────────────────────

export interface DeviationSegment {
  startIndex: number;
  endIndex: number;
  startT: number;
  endT: number;
  maxDistanceM: number;
  lengthM: number;
  /** true bila segmen masih berlangsung (titik terakhir masih di luar rute). */
  ongoing: boolean;
}

export interface RouteDeviationOptions {
  /** Jarak dari rute standar yang dianggap keluar jalur. */
  thresholdM: number;
  /** Minimal jumlah ping berurutan di luar jalur (menyaring noise GPS). */
  minConsecutive: number;
}

export const DEFAULT_ROUTE_OPTIONS: RouteDeviationOptions = { thresholdM: 60, minConsecutive: 3 };

/**
 * Mendeteksi segmen perjalanan yang keluar dari rute standar.
 * `offRouteM[i]` adalah jarak ping ke-i terhadap rute standar.
 */
export function detectRouteDeviations(
  pings: GpsPing[],
  offRouteM: number[],
  opts: RouteDeviationOptions = DEFAULT_ROUTE_OPTIONS
): DeviationSegment[] {
  const segments: DeviationSegment[] = [];
  let start = -1;

  const close = (end: number, ongoing: boolean) => {
    if (end - start + 1 >= opts.minConsecutive) {
      let maxD = 0;
      for (let k = start; k <= end; k++) maxD = Math.max(maxD, offRouteM[k]);
      segments.push({
        startIndex: start,
        endIndex: end,
        startT: pings[start].t,
        endT: pings[end].t,
        maxDistanceM: maxD,
        lengthM: pathLengthM(pings.slice(start, end + 1)),
        ongoing,
      });
    }
    start = -1;
  };

  for (let i = 0; i < pings.length; i++) {
    const off = offRouteM[i] > opts.thresholdM;
    if (off && start < 0) start = i;
    if (!off && start >= 0) close(i - 1, false);
  }
  if (start >= 0) close(pings.length - 1, true);
  return segments;
}

/** Persentase jarak tempuh yang berada di dalam rute standar. */
export function routeCompliancePct(totalLengthM: number, deviations: DeviationSegment[]): number {
  if (totalLengthM <= 0) return 100;
  const off = deviations.reduce((s, d) => s + d.lengthM, 0);
  return Math.max(0, Math.min(100, (1 - off / totalLengthM) * 100));
}
// ─── Anomaly Detection (Skoring Anomali) ─────────────────────

export interface AnomalyScoreResult {
  score: number;
  status: "normal" | "waspada" | "anomali";
  isAnomaly: boolean;
  components: { s1: number; s2: number; s3: number; s4: number };
}

/**
 * Sistem mendeteksi pola perjalanan yang secara statistik tidak normal.
 * Sesuai proposal: AS = 100 * sum(w_i * S_i)
 */
export function calculateAnomalyScore(
  routeCompliance: number,
  fuelDeviationPct: number,
  missedStops: number,
  totalStops: number,
  dataGapCount: number
): AnomalyScoreResult {
  // S1: Anomali BBM (Normalisasi CDF baku) -> diproksikan max(0, min(1, deviasi/30))
  const s1 = Math.max(0, Math.min(1, Math.abs(fuelDeviationPct) / 30));
  // S2: Deviasi rute -> 1 - (kepatuhan/100)
  const s2 = Math.max(0, 1 - (routeCompliance / 100));
  // S3: Pola perjalanan (Isolation Forest) -> diproksikan via data gaps dan noise
  const s3 = Math.min(1, dataGapCount * 0.25);
  // S4: Titik layanan -> 1 - (terkunjungi/terjadwal) = terlewat/terjadwal
  const s4 = totalStops > 0 ? Math.min(1, missedStops / totalStops) : 0;

  // Bobot W = (0.35; 0.25; 0.25; 0.15)
  const AS = 100 * (0.35 * s1 + 0.25 * s2 + 0.25 * s3 + 0.15 * s4);
  const score = Math.round(AS);

  // Klasifikasi: <40 normal, 40-70 waspada, >70 anomali
  let status: "normal" | "waspada" | "anomali" = "normal";
  if (score > 70) status = "anomali";
  else if (score >= 40) status = "waspada";

  return {
    score,
    status,
    isAnomaly: status === "anomali",
    components: { s1, s2, s3, s4 }
  };
}

// ─── Validasi titik pelayanan (TPS) ──────────────────────────

export interface ServicePointRef extends LngLat {
  id: string;
}

export interface StopVisit {
  stopId: string;
  visited: boolean;
  /** Waktu tiba (detik) bila terlayani. */
  arrivedT: number | null;
  dwellS: number;
  minDistanceM: number;
  /** Kendaraan terlihat di radius TPS tepat sebelum/sesudah celah data GPS. */
  nearDataGap: boolean;
}

export interface StopVisitOptions {
  radiusM: number;
  /** Minimal lama berhenti di radius TPS agar dianggap melayani (bukan sekadar lewat). */
  minDwellS: number;
  /** Selang antar-ping di atas nilai ini dianggap celah data. */
  gapS: number;
}

export const DEFAULT_STOP_OPTIONS: StopVisitOptions = { radiusM: 50, minDwellS: 120, gapS: 30 };

export function detectStopVisits(
  pings: GpsPing[],
  stops: ServicePointRef[],
  opts: StopVisitOptions = DEFAULT_STOP_OPTIONS
): StopVisit[] {
  return stops.map((stop) => {
    let minDistanceM = Infinity;
    let best: { arrivedT: number; dwellS: number } | null = null;
    let runStart: number | null = null;
    let runEnd = 0;

    const flush = () => {
      if (runStart === null) return;
      const dwell = runEnd - runStart;
      if (!best || dwell > best.dwellS) best = { arrivedT: runStart, dwellS: dwell };
      runStart = null;
    };

    let nearDataGap = false;
    pings.forEach((p, i) => {
      const d = haversineM(p, stop);
      if (d < minDistanceM) minDistanceM = d;
      if (d <= opts.radiusM) {
        if (runStart === null) runStart = p.t;
        runEnd = p.t;
        const prevGap = i > 0 && p.t - pings[i - 1].t > opts.gapS;
        const nextGap = i < pings.length - 1 && pings[i + 1].t - p.t > opts.gapS;
        if (prevGap || nextGap) nearDataGap = true;
      } else {
        flush();
      }
    });
    flush();

    const b = best as { arrivedT: number; dwellS: number } | null;
    const visited = b !== null && b.dwellS >= opts.minDwellS;
    return {
      stopId: stop.id,
      visited,
      arrivedT: visited && b ? b.arrivedT : null,
      dwellS: b ? b.dwellS : 0,
      minDistanceM,
      nearDataGap,
    };
  });
}

export type StopStatus = "terlayani" | "terlewat" | "tak_terverifikasi" | "menunggu";

/**
 * Status tiap TPS dalam urutan rute: TPS dianggap terlewat bila TPS sesudahnya
 * sudah terlayani atau ritase sudah selesai, sementara TPS tersebut belum.
 * Bila kendaraan terlihat di TPS tepat di tepi celah data GPS, kunjungan
 * tidak bisa dibuktikan maupun dibantah → "tak_terverifikasi" (cek manual).
 */
export function stopStatuses(visits: StopVisit[], tripDone: boolean): StopStatus[] {
  let lastVisited = -1;
  visits.forEach((v, i) => {
    if (v.visited) lastVisited = i;
  });
  return visits.map((v, i) => {
    if (v.visited) return "terlayani";
    if (tripDone || i < lastVisited) return v.nearDataGap ? "tak_terverifikasi" : "terlewat";
    return "menunggu";
  });
}

// ─── Ketersediaan data ───────────────────────────────────────

/**
 * Rasio ping yang diterima terhadap ping yang seharusnya dikirim
 * pada interval pelaporan perangkat (target proposal: ≥ 95%).
 */
export function dataAvailabilityPct(
  pings: GpsPing[],
  intervalS: number,
  startT: number,
  endT: number
): number {
  if (endT < startT) return 100;
  const expected = Math.floor((endT - startT) / intervalS) + 1;
  const received = pings.filter((p) => p.t >= startT && p.t <= endT).length;
  return Math.min(100, (received / expected) * 100);
}

/** Celah data (gap) yang lebih panjang dari `gapFactor` × interval. */
export function findDataGaps(pings: GpsPing[], intervalS: number, gapFactor = 3) {
  const gaps: { fromT: number; toT: number; durationS: number }[] = [];
  for (let i = 1; i < pings.length; i++) {
    const dt = pings[i].t - pings[i - 1].t;
    if (dt > intervalS * gapFactor) gaps.push({ fromT: pings[i - 1].t, toT: pings[i].t, durationS: dt });
  }
  return gaps;
}
