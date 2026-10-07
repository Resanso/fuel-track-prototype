"use client";

import { useState } from "react";
import type { AlertCategory, FleetAlert } from "@/lib/alerts";

const SEVERITY_CLASS: Record<FleetAlert["severity"], string> = {
  kritis: "alert-danger",
  peringatan: "alert-warning",
  info: "alert-info",
};

const FILTERS: [AlertCategory | "all", string][] = [
  ["all", "Semua"],
  ["bbm", "BBM"],
  ["rute", "Rute"],
  ["tps", "TPS"],
  ["data", "Data GPS"],
];

interface AlertsPanelProps {
  isOpen: boolean;
  alerts: FleetAlert[];
  onClose: () => void;
  onSelectVehicle: (vehicleId: string) => void;
}

export default function AlertsPanel({ isOpen, alerts, onClose, onSelectVehicle }: AlertsPanelProps) {
  const [filter, setFilter] = useState<AlertCategory | "all">("all");

  if (!isOpen) return null;

  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.category === filter);
  const count = (key: AlertCategory | "all") =>
    key === "all" ? alerts.length : alerts.filter((a) => a.category === key).length;

  return (
    <div className="alertsOverlay" onClick={onClose}>
      <div className="alertsPanel" onClick={(e) => e.stopPropagation()}>
        <div className="alertsPanelHeader">
          <div className="alertsTitleRow">
            <h3>Early Warning</h3>
            <span className="alertsBadgeCount">{alerts.length}</span>
          </div>
          <button className="alertsCloseBtn" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </div>
        <div className="alertsFilters">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              className={`alertFilterBtn ${filter === key ? "active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="alertFilterCount">{count(key)}</span>
            </button>
          ))}
        </div>
        <div className="alertsList">
          {filtered.length === 0 && (
            <p className="alertsEmpty">Belum ada peringatan. Peringatan muncul otomatis dari hasil analisis data GPS.</p>
          )}
          {filtered.map((alert) => (
            <button
              key={alert.id}
              className={`alertItem ${SEVERITY_CLASS[alert.severity]}`}
              onClick={() => {
                onSelectVehicle(alert.vehicleId);
                onClose();
              }}
            >
              <div className="alertItemContent">
                <div className="alertItemHeader">
                  <span className="alertItemTitle">{alert.title}</span>
                  <span className="alertItemTime">{alert.clock}</span>
                </div>
                <span className="alertItemMsg">{alert.message}</span>
                <span className="alertItemTruck">
                  {alert.vehicleCode} · {alert.category.toUpperCase()}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
