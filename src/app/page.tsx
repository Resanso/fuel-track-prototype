"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import AlertsPanel from "@/components/AlertsPanel";

// Dynamically import Map component (MapLibre needs browser APIs)
const Map = dynamic(() => import("@/components/Map/Map"), {
  ssr: false,
});

export default function Home() {
  const [alertsOpen, setAlertsOpen] = useState(false);

  return (
    <div className="appContainer">
      {/* Header */}
      <header className="appHeader">
        <div className="brandLogo">
          <div className="logoIcon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
            </svg>
          </div>
          <span className="logoText">
            Car<span className="logoTextAccent">track</span>
            <span className="logoSubtext">Fleet</span>
          </span>
        </div>

        <div className="headerActions">
          <button className="headerBtn" onClick={() => setAlertsOpen(true)}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
            </svg>
            <span>Alerts</span>
            <span className="alertDot" />
          </button>
          <button className="headerBtn">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
            <span>Search</span>
          </button>
          <button className="headerBtn headerBtnPrimary">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
            </svg>
            <span>MiFleet</span>
          </button>
        </div>
      </header>

      {/* Map Area */}
      <div className="mapArea">
        <Map />
      </div>

      {/* Fleet Stats Bar */}
      <div className="statsBar">
        <div className="statCard">
          <div className="statIcon vehicles" style={{fontFamily: 'sans-serif', fontWeight: 900}}>TRK</div>
          <div className="statInfo">
            <span className="statValue">5</span>
            <span className="statLabel">Total Vehicles</span>
          </div>
        </div>
        <div className="statCard">
          <div className="statIcon fuel">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
            </svg>
          </div>
          <div className="statInfo">
            <span className="statValue">4 <small className="statActive">Active</small></span>
            <span className="statLabel">Live Tracking</span>
          </div>
        </div>
        <div className="statCard">
          <div className="statIcon efficiency" style={{fontFamily: 'sans-serif', fontWeight: 900}}>L/H</div>
          <div className="statInfo">
            <span className="statValue">56.2%</span>
            <span className="statLabel">Avg Fuel Level</span>
          </div>
        </div>
        <div className="statCard">
          <div className="statIcon distance">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
          </div>
          <div className="statInfo">
            <span className="statValue">3 <small className="statWarning">Active</small></span>
            <span className="statLabel">Alerts</span>
          </div>
        </div>
      </div>

      {/* Alerts Panel */}
      <AlertsPanel isOpen={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </div>
  );
}
