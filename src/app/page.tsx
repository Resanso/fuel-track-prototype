"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import AlertsPanel from "@/components/AlertsPanel";
import AppHeader from "@/components/AppHeader";
import type { FleetSnapshot } from "@/lib/snapshot";
import { AVAILABILITY_TARGET_PCT } from "@/lib/alerts";

// MapLibre butuh API browser
const Map = dynamic(() => import("@/components/Map/Map"), { ssr: false });

export default function Home() {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [focus, setFocus] = useState<{ vehicleId: string; nonce: number } | null>(null);

  const onSelectVehicle = useCallback((vehicleId: string) => setFocus({ vehicleId, nonce: Date.now() }), []);

  const items = snapshot?.items ?? [];
  const moving = items.filter((i) => !i.state.done).length;
  const availability = items.length ? items.reduce((s, i) => s + i.state.availabilityPct, 0) / items.length : 0;
  const compliance = items.length ? items.reduce((s, i) => s + i.state.compliancePct, 0) / items.length : 0;
  const served = items.reduce((s, i) => s + i.state.servedCount, 0);
  const missed = items.reduce((s, i) => s + i.state.statuses.filter((x) => x === "terlewat").length, 0);
  const unverified = items.reduce((s, i) => s + i.state.statuses.filter((x) => x === "tak_terverifikasi").length, 0);
  const totalStops = items.reduce((s, i) => s + i.state.validatedStops.length, 0);
  const fuelDone = items.filter((i) => i.state.fuel);
  const fuelFlagged = fuelDone.filter((i) => i.state.fuel!.status !== "wajar").length;
  const critical = snapshot?.alerts.filter((a) => a.severity === "kritis").length ?? 0;

  return (
    <div className="appContainer">
      <AppHeader alertCount={snapshot?.alerts.length} onAlertsClick={() => setAlertsOpen(true)} />

      <div className="mapArea">
        <Map onSnapshot={setSnapshot} focusRequest={focus} />
      </div>

      {snapshot && (
        <div className="statsBar">
          <StatCard label="Armada beroperasi" value={`${moving}/${items.length}`} note="ritase berjalan" />
          <StatCard
            label="Ketersediaan data"
            value={`${availability.toFixed(1)}%`}
            note={`target ≥ ${AVAILABILITY_TARGET_PCT}%`}
            tone={availability >= AVAILABILITY_TARGET_PCT ? "ok" : "bad"}
          />
          <StatCard
            label="Kepatuhan rute"
            value={`${compliance.toFixed(1)}%`}
            note="jarak di dalam rute standar"
            tone={compliance >= 95 ? "ok" : "warn"}
          />
          <StatCard
            label="TPS SERVED"
            value={`${served}/${totalStops}`}
            note={`${missed} NOT SERVED · ${unverified} UNVERIFIED`}
            tone={missed ? "bad" : unverified ? "warn" : "ok"}
          />
          <StatCard
            label="Rekonsiliasi BBM"
            value={`${fuelFlagged}/${fuelDone.length}`}
            note="ritase selesai bermasalah"
            tone={fuelFlagged ? "bad" : "ok"}
          />
          <StatCard label="Peringatan kritis" value={String(critical)} note="klik Peringatan" tone={critical ? "bad" : "ok"} />
        </div>
      )}

      <AlertsPanel
        isOpen={alertsOpen}
        alerts={snapshot?.alerts ?? []}
        onClose={() => setAlertsOpen(false)}
        onSelectVehicle={onSelectVehicle}
      />
    </div>
  );
}

function StatCard({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className={`statCard ${tone ? `statCard-${tone}` : ""}`}>
      <div className="statInfo">
        <span className="statLabel">{label}</span>
        <span className="statValue">{value}</span>
        <span className="statNote">{note}</span>
      </div>
    </div>
  );
}
