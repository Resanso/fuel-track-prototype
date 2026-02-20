"use client";

import { useState } from "react";

export interface Alert {
  id: string;
  type: "danger" | "warning" | "success" | "info";
  title: string;
  message: string;
  truck: string;
  time: string;
}

const MOCK_ALERTS: Alert[] = [
  {
    id: "a1",
    type: "danger",
    title: "Fuel Anomaly Detected",
    message: "Unusual fuel drop of 15L detected — possible siphoning",
    truck: "Dump Truck #04",
    time: "2 min ago",
  },
  {
    id: "a2",
    type: "warning",
    title: "Speeding Alert",
    message: "85 km/h in 60 km/h zone — Jl. Pasteur",
    truck: "Dump Truck #02",
    time: "5 min ago",
  },
  {
    id: "a3",
    type: "success",
    title: "Geofence Entered",
    message: "Arrived at Alun-Alun Bandung delivery zone",
    truck: "Dump Truck #01",
    time: "8 min ago",
  },
  {
    id: "a4",
    type: "info",
    title: "Driver ID Scanned",
    message: "Driver Cahya Pratama authenticated via ID Tag",
    truck: "Dump Truck #03",
    time: "12 min ago",
  },
  {
    id: "a5",
    type: "warning",
    title: "Harsh Braking",
    message: "Sudden deceleration detected — Jl. Buah Batu",
    truck: "Dump Truck #04",
    time: "15 min ago",
  },
  {
    id: "a6",
    type: "success",
    title: "Delivery Completed",
    message: "Package #BDG-2847 delivered successfully",
    truck: "Dump Truck #05",
    time: "20 min ago",
  },
  {
    id: "a7",
    type: "danger",
    title: "Temperature Warning",
    message: "Cargo temperature exceeds 8°C threshold",
    truck: "Dump Truck #03",
    time: "25 min ago",
  },
  {
    id: "a8",
    type: "info",
    title: "Engine Start",
    message: "Engine started after 2h idle period",
    truck: "Dump Truck #01",
    time: "30 min ago",
  },
];

const ALERT_ICONS: Record<string, string> = {
  danger: "•",
  warning: "•",
  success: "•",
  info: "•",
};

const ALERT_COLORS: Record<string, string> = {
  danger: "rgba(239, 68, 68, 0.15)",
  warning: "rgba(245, 158, 11, 0.15)",
  success: "rgba(16, 185, 129, 0.15)",
  info: "rgba(99, 102, 241, 0.15)",
};

const ALERT_BORDER_COLORS: Record<string, string> = {
  danger: "rgba(239, 68, 68, 0.3)",
  warning: "rgba(245, 158, 11, 0.3)",
  success: "rgba(16, 185, 129, 0.3)",
  info: "rgba(99, 102, 241, 0.3)",
};

interface AlertsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AlertsPanel({ isOpen, onClose }: AlertsPanelProps) {
  const [filter, setFilter] = useState<string>("all");

  const filtered =
    filter === "all"
      ? MOCK_ALERTS
      : MOCK_ALERTS.filter((a) => a.type === filter);

  const counts = {
    all: MOCK_ALERTS.length,
    danger: MOCK_ALERTS.filter((a) => a.type === "danger").length,
    warning: MOCK_ALERTS.filter((a) => a.type === "warning").length,
    success: MOCK_ALERTS.filter((a) => a.type === "success").length,
    info: MOCK_ALERTS.filter((a) => a.type === "info").length,
  };

  if (!isOpen) return null;

  return (
    <div className="alertsOverlay" onClick={onClose}>
      <div className="alertsPanel" onClick={(e) => e.stopPropagation()}>
        <div className="alertsPanelHeader">
          <div className="alertsTitleRow">
            <h3>ALERTS</h3>
            <span className="alertsBadgeCount">{counts.all}</span>
          </div>
          <button className="alertsCloseBtn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="alertsFilters">
          {(
            [
              ["all", "ALL"],
              ["danger", "CRITICAL"],
              ["warning", "WARNING"],
              ["success", "RESOLVED"],
              ["info", "INFO"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`alertFilterBtn ${filter === key ? "active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="alertFilterCount">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="alertsList">
          {filtered.map((alert) => (
            <div
              key={alert.id}
              className="alertItem"
              style={{
                background: ALERT_COLORS[alert.type],
                borderLeft: `3px solid ${ALERT_BORDER_COLORS[alert.type]}`,
              }}
            >
              <div className="alertItemIcon">{ALERT_ICONS[alert.type]}</div>
              <div className="alertItemContent">
                <div className="alertItemHeader">
                  <span className="alertItemTitle">{alert.title}</span>
                  <span className="alertItemTime">{alert.time}</span>
                </div>
                <span className="alertItemMsg">{alert.message}</span>
                <span className="alertItemTruck">{alert.truck}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
