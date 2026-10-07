"use client";

import { useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import {
  avg,
  FLEET_SIZE,
  generateDailyFleet,
  generateMonthlyHistory,
  summarizeByUpt,
  type DailyVehicleRecord,
} from "@/lib/fleetSim";
import { AVAILABILITY_TARGET_PCT } from "@/lib/alerts";
import { DEFAULT_FUEL_THRESHOLDS } from "@/lib/analytics";
import "./manajemen.css";

type Filter = "semua" | "bbm" | "rute" | "tps" | "data";

const FUEL_LABEL = { wajar: "Wajar", perlu_cek: "Perlu Cek", anomali: "Anomali" } as const;

const fmt = (n: number, d = 1) => n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (n: number) => (n > 0 ? "+" : "");

function priority(r: DailyVehicleRecord): number {
  let p = 0;
  if (!r.online) p += 50;
  if (r.fuel.status === "anomali") p += 40;
  if (r.fuel.status === "perlu_cek") p += 10;
  if (r.routeDeviations) p += 20;
  if (r.stopsServed < r.stopsPlanned) p += 15;
  if (r.availabilityPct < AVAILABILITY_TARGET_PCT) p += 5;
  return p;
}

export default function ManajemenPage() {
  const fleet = useMemo(() => generateDailyFleet(), []);
  const history = useMemo(() => generateMonthlyHistory(), []);
  const upts = useMemo(() => summarizeByUpt(fleet), [fleet]);
  const [filter, setFilter] = useState<Filter>("semua");

  const online = fleet.filter((r) => r.online);
  const availability = avg(fleet.map((r) => r.availabilityPct));
  const estTotal = online.reduce((s, r) => s + r.fuel.estimatedL, 0);
  const adminTotal = online.reduce((s, r) => s + r.fuel.adminL, 0);
  const fleetDev = ((adminTotal - estTotal) / estTotal) * 100;
  const fuelAnomalies = online.filter((r) => r.fuel.status === "anomali").length;
  const fuelChecks = online.filter((r) => r.fuel.status === "perlu_cek").length;
  const routeDev = online.filter((r) => r.routeDeviations > 0).length;
  const compliance = avg(online.map((r) => r.compliancePct));
  const stopsPlanned = fleet.reduce((s, r) => s + r.stopsPlanned, 0);
  const stopsServed = fleet.reduce((s, r) => s + r.stopsServed, 0);
  const missedVehicles = online.filter((r) => r.stopsServed < r.stopsPlanned).length;
  const lowData = fleet.filter((r) => r.availabilityPct < AVAILABILITY_TARGET_PCT).length;

  const filters: [Filter, string, number][] = [
    ["semua", "Semua", fleet.length],
    ["bbm", "BBM tidak wajar", fuelAnomalies + fuelChecks + (fleet.length - online.length)],
    ["rute", "Keluar rute", routeDev],
    ["tps", "TPS NOT SERVED", missedVehicles],
    ["data", `Data < ${AVAILABILITY_TARGET_PCT}%`, lowData],
  ];

  const rows = fleet
    .filter((r) => {
      if (filter === "bbm") return r.fuel.status !== "wajar";
      if (filter === "rute") return r.routeDeviations > 0;
      if (filter === "tps") return r.online && r.stopsServed < r.stopsPlanned;
      if (filter === "data") return r.availabilityPct < AVAILABILITY_TARGET_PCT;
      return true;
    })
    .sort((a, b) => priority(b) - priority(a));

  return (
    <div className="mgmt">
      <AppHeader floating={false} />

      <main className="mgmtMain">
        <div className="mgmtTitleRow">
          <div>
            <h1>Rekap Operasional Armada</h1>
            <p className="mgmtSub">Rabu, 7 Oktober 2026 · seluruh UPT · {FLEET_SIZE} kendaraan</p>
          </div>
          <span className="simBadge">Data simulasi pilot: 10 armada aktif</span>
        </div>

        <section className="kpiGrid">
          <Kpi label="Armada terpantau" value={`${online.length}/${FLEET_SIZE}`} note={`${FLEET_SIZE - online.length} tanpa sinyal GPS hari ini`} tone={online.length === FLEET_SIZE ? "ok" : "warn"} />
          <Kpi
            label="Ketersediaan data"
            value={`${fmt(availability)}%`}
            note={`target ≥ ${AVAILABILITY_TARGET_PCT}% · ${lowData} kendaraan di bawah target`}
            tone={availability >= AVAILABILITY_TARGET_PCT ? "ok" : "bad"}
          />
          <Kpi
            label="BBM administrasi vs estimasi GPS"
            value={`${sign(fleetDev)}${fmt(fleetDev)}%`}
            note={`${fmt(adminTotal, 0)} L vs ${fmt(estTotal, 0)} L`}
            tone={Math.abs(fleetDev) <= DEFAULT_FUEL_THRESHOLDS.warnPct ? "ok" : "warn"}
          />
          <Kpi label="Anomali BBM" value={String(fuelAnomalies)} note={`+${fuelChecks} perlu dicek (deviasi > ${DEFAULT_FUEL_THRESHOLDS.warnPct}%)`} tone={fuelAnomalies ? "bad" : "ok"} />
          <Kpi label="Kepatuhan rute" value={`${fmt(compliance)}%`} note={`${routeDev} kendaraan keluar rute standar`} tone={routeDev ? "warn" : "ok"} />
          <Kpi
            label="Cakupan titik pelayanan"
            value={`${fmt((stopsServed / stopsPlanned) * 100)}%`}
            note={`${stopsServed}/${stopsPlanned} TPS · ${missedVehicles} kendaraan melewatkan TPS`}
            tone={missedVehicles ? "warn" : "ok"}
          />
        </section>

        <div className="mgmtTwoCol">
          <section className="card">
            <h2>Rekap per UPT</h2>
            <div className="tableWrap">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>UPT</th>
                    <th className="num">Armada</th>
                    <th className="num">Data</th>
                    <th className="num">Kepatuhan rute</th>
                    <th className="num">Cakupan TPS</th>
                    <th className="num">BBM admin</th>
                    <th className="num">Deviasi</th>
                    <th className="num">Anomali</th>
                  </tr>
                </thead>
                <tbody>
                  {upts.map((u) => (
                    <tr key={u.upt}>
                      <td>{u.upt.replace("UPT Wilayah ", "")}</td>
                      <td className="num">
                        {u.online}/{u.vehicles}
                      </td>
                      <td className={`num ${u.availabilityPct < AVAILABILITY_TARGET_PCT ? "tone-bad" : ""}`}>{fmt(u.availabilityPct)}%</td>
                      <td className="num">{fmt(u.compliancePct)}%</td>
                      <td className="num">{fmt(u.stopsCoveragePct)}%</td>
                      <td className="num">{fmt(u.adminL, 0)} L</td>
                      <td className={`num ${Math.abs(u.deviationPct) > DEFAULT_FUEL_THRESHOLDS.warnPct ? "tone-warn" : ""}`}>
                        {sign(u.deviationPct)}
                        {fmt(u.deviationPct)}%
                      </td>
                      <td className={`num ${u.anomalies ? "tone-bad" : ""}`}>{u.anomalies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>Histori 12 bulan (simulasi): BBM administrasi vs estimasi GPS</h2>
            <HistoryChart data={history} />
          </section>
        </div>

        <section className="card">
          <div className="cardHeadRow">
            <h2>Prioritas pemeriksaan kendaraan</h2>
            <div className="filterRow">
              {filters.map(([key, label, n]) => (
                <button key={key} className={`filterBtn ${filter === key ? "active" : ""}`} onClick={() => setFilter(key)}>
                  {label} <span>{n}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="tableWrap tall">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Kendaraan</th>
                  <th>UPT</th>
                  <th className="num">Jarak GPS</th>
                  <th className="num">Estimasi BBM</th>
                  <th className="num">BBM admin</th>
                  <th className="num">Deviasi</th>
                  <th>Status BBM</th>
                  <th className="num">Kepatuhan rute</th>
                  <th className="num">TPS</th>
                  <th className="num">Data GPS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code}>
                    <td>
                      <strong>{r.code}</strong>
                      <span className="cellSub">
                        {r.plate} · {r.type}
                      </span>
                    </td>
                    <td>{r.upt.replace("UPT Wilayah ", "")}</td>
                    <td className="num">{r.online ? `${fmt(r.gpsDistanceKm)} km` : "—"}</td>
                    <td className="num">{r.online ? `${fmt(r.fuel.estimatedL)} L` : "—"}</td>
                    <td className="num">{fmt(r.fuel.adminL)} L</td>
                    <td className="num">{r.online ? `${sign(r.fuel.deviationPct)}${fmt(r.fuel.deviationPct)}%` : "—"}</td>
                    <td>
                      {r.online ? (
                        <span className={`chip ${r.fuel.status === "wajar" ? "chipOk" : r.fuel.status === "perlu_cek" ? "chipWarn" : "chipBad"}`}>
                          {FUEL_LABEL[r.fuel.status]}
                        </span>
                      ) : (
                        <span className="chip chipBad">Tanpa data GPS</span>
                      )}
                    </td>
                    <td className={`num ${r.routeDeviations ? "tone-bad" : ""}`}>
                      {r.online ? `${fmt(r.compliancePct)}%` : "—"}
                      {r.routeDeviations > 0 && <span className="cellSub">{r.routeDeviations}× keluar rute</span>}
                    </td>
                    <td className={`num ${r.online && r.stopsServed < r.stopsPlanned ? "tone-bad" : ""}`}>
                      {r.stopsServed}/{r.stopsPlanned}
                    </td>
                    <td className={`num ${r.availabilityPct < AVAILABILITY_TARGET_PCT ? "tone-bad" : ""}`}>{fmt(r.availabilityPct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="footNote">
          Prediksi BBM (Machine Learning) = Fungsi(Jarak, Kecepatan, Idle, Muatan, dll). Status deviasi MAE: ≤
          {DEFAULT_FUEL_THRESHOLDS.warnPct}% wajar, ≤{DEFAULT_FUEL_THRESHOLDS.anomalyPct}% perlu cek, &gt;{DEFAULT_FUEL_THRESHOLDS.anomalyPct}%
          anomali (Fuel Consumption Anomaly Detection). Indikator Anomaly Score dihitung dengan modul cerdas (route, fuel, stops, GPS).
        </p>
      </main>
    </div>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone: "ok" | "warn" | "bad" }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <span className="kpiLabel">{label}</span>
      <span className="kpiValue">{value}</span>
      <span className="kpiNote">{note}</span>
    </div>
  );
}

function HistoryChart({ data }: { data: ReturnType<typeof generateMonthlyHistory> }) {
  const W = 640;
  const H = 260;
  const pad = { l: 52, r: 44, t: 16, b: 40 };
  const max = Math.max(...data.map((d) => Math.max(d.adminL, d.estimatedL))) * 1.08;
  const maxDev = 25;
  const cw = (W - pad.l - pad.r) / data.length;
  const bw = cw * 0.34;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const yDev = (v: number) => pad.t + (1 - v / maxDev) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  return (
    <div className="chartWrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik histori BBM 12 bulan">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e5e5e5" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="axis">
              {fmt(t / 1000, 0)}k
            </text>
          </g>
        ))}
        {[0, 10, 20].map((t) => (
          <text key={t} x={W - pad.r + 6} y={yDev(t) + 3} className="axis">
            {t}%
          </text>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={yDev(DEFAULT_FUEL_THRESHOLDS.anomalyPct)} y2={yDev(DEFAULT_FUEL_THRESHOLDS.anomalyPct)} stroke="#e60000" strokeDasharray="4 4" />
        {data.map((d, i) => {
          const x0 = pad.l + i * cw + (cw - 2 * bw) / 2;
          return (
            <g key={d.label}>
              <rect x={x0} y={y(d.estimatedL)} width={bw} height={H - pad.b - y(d.estimatedL)} fill="#0044ff">
                <title>{`${d.label} · estimasi ${fmt(d.estimatedL, 0)} L`}</title>
              </rect>
              <rect x={x0 + bw} y={y(d.adminL)} width={bw} height={H - pad.b - y(d.adminL)} fill="#111111">
                <title>{`${d.label} · administrasi ${fmt(d.adminL, 0)} L`}</title>
              </rect>
              <text x={pad.l + i * cw + cw / 2} y={H - pad.b + 16} textAnchor="middle" className="axis">
                {d.label}
              </text>
            </g>
          );
        })}
        <polyline
          fill="none"
          stroke="#ff8c00"
          strokeWidth={2.5}
          points={data.map((d, i) => `${pad.l + i * cw + cw / 2},${yDev(d.deviationPct)}`).join(" ")}
        />
        {data.map((d, i) => (
          <circle key={d.label} cx={pad.l + i * cw + cw / 2} cy={yDev(d.deviationPct)} r={3.5} fill="#ff8c00">
            <title>{`${d.label} · deviasi ${fmt(d.deviationPct)}% · ${d.anomalies} anomali`}</title>
          </circle>
        ))}
        <line x1={pad.l + 6 * cw} x2={pad.l + 6 * cw} y1={pad.t} y2={H - pad.b} stroke="#111" strokeDasharray="2 3" />
        <text x={pad.l + 6 * cw + 4} y={pad.t + 10} className="axis strong">
          skenario: monitoring GPS aktif
        </text>
      </svg>
      <div className="chartLegend">
        <span><i style={{ background: "#0044ff" }} /> Estimasi GPS (L)</span>
        <span><i style={{ background: "#111" }} /> BBM administrasi (L)</span>
        <span><i style={{ background: "#ff8c00" }} /> Deviasi (%)</span>
        <span><i className="dash" /> Ambang anomali {DEFAULT_FUEL_THRESHOLDS.anomalyPct}%</span>
      </div>
    </div>
  );
}
