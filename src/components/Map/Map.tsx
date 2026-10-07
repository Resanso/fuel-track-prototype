"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Map.css";
import { createModelLayer } from "./ThreeDModel";
import { loadTrips } from "@/lib/simulation";
import { motionAt, traveledPath, clockAt, type Trip, type TripState } from "@/lib/trip";
import { computeSnapshot, type FleetSnapshot } from "@/lib/snapshot";
import { DEFAULT_FUEL_THRESHOLDS, DEFAULT_ROUTE_OPTIONS, DEFAULT_STOP_OPTIONS } from "@/lib/analytics";
import { formatClock } from "@/lib/fleetData";
import { AVAILABILITY_TARGET_PCT } from "@/lib/alerts";

const FOLLOW_ZOOM = 17.2;
const FOLLOW_PITCH = 60;
const LERP_FACTOR = 0.08;
const SNAPSHOT_MS = 300;
const SPEEDS = [10, 30, 60] as const;

const STOP_COLORS = { terlayani: "#00a854", terlewat: "#e60000", tak_terverifikasi: "#ff8c00", menunggu: "#ffffff" } as const;
const STOP_LABEL = { terlayani: "SERVED", terlewat: "NOT SERVED", tak_terverifikasi: "UNVERIFIED", menunggu: "WAITING" } as const;

export const FUEL_LABEL = { wajar: "Wajar", perlu_cek: "Perlu Cek", anomali: "Anomali" } as const;
const FUEL_CHIP = { wajar: "chipOk", perlu_cek: "chipWarn", anomali: "chipBad" } as const;

interface TruckRuntime {
  setPosition: (lng: number, lat: number) => void;
  setBearing: (bearing: number) => void;
}

type Tab = "ringkasan" | "bbm" | "rute" | "peringatan";

interface MapProps {
  onSnapshot?: (s: FleetSnapshot) => void;
  /** Permintaan fokus dari luar (mis. klik peringatan). */
  focusRequest?: { vehicleId: string; nonce: number } | null;
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export default function Map({ onSnapshot, focusRequest }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastFrameRef = useRef<number | null>(null);
  const lastSnapshotRef = useRef(0);

  const tripsRef = useRef<Trip[]>([]);
  const runtimeRef = useRef<Record<string, TruckRuntime>>({});
  const simTRef = useRef(0);
  const speedRef = useRef<number>(SPEEDS[1]);

  const [isLoaded, setIsLoaded] = useState(false);
  const [tripsReady, setTripsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [speed, setSpeed] = useState<number>(SPEEDS[1]);
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);

  const [followId, setFollowId] = useState<string | null>(null);
  const followIdRef = useRef<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelOpenRef = useRef(false);
  const [activeTab, setActiveTab] = useState<Tab>("ringkasan");
  const camCenter = useRef<[number, number] | null>(null);
  const camBearing = useRef(0);

  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;

  // ─── Sinkronisasi analitik → peta & UI ───
  const publishSnapshot = useCallback(() => {
    const map = mapInstance.current;
    const trips = tripsRef.current;
    if (!map || trips.length === 0) return;
    const snap = computeSnapshot(trips, simTRef.current);

    const stopFeatures: GeoJSON.Feature[] = [];
    const devFeatures: GeoJSON.Feature[] = [];
    for (const { trip, state } of snap.items) {
      const pool = trip.stops.find((s) => !s.validated);
      if (pool) {
        stopFeatures.push({
          type: "Feature",
          properties: { name: pool.name, status: "pool", color: "#111111", vehicle: trip.vehicle.code },
          geometry: { type: "Point", coordinates: [pool.lng, pool.lat] },
        });
      }
      state.validatedStops.forEach((s, i) => {
        stopFeatures.push({
          type: "Feature",
          properties: {
            name: s.name,
            status: state.statuses[i],
            color: STOP_COLORS[state.statuses[i]],
            vehicle: trip.vehicle.code,
          },
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        });
      });
      const pings = trip.pings;
      for (const d of state.deviations) {
        devFeatures.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: pings.slice(d.startIndex, d.endIndex + 1).map((p) => [p.lng, p.lat]),
          },
        });
      }
    }
    (map.getSource("stops") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: stopFeatures,
    });
    (map.getSource("deviations") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: devFeatures,
    });

    setSnapshot(snap);
    onSnapshotRef.current?.(snap);
    if (typeof window !== "undefined") (window as unknown as { __fleet: FleetSnapshot }).__fleet = snap;
    return snap;
  }, []);

  const renderFrame = useCallback(() => {
    const map = mapInstance.current;
    if (!map) return;
    let followPos: { lng: number; lat: number } | null = null;
    let followBearing = 0;
    const vehicleFeatures: GeoJSON.Feature[] = [];

    for (const trip of tripsRef.current) {
      const rt = runtimeRef.current[trip.vehicle.id];
      if (!rt) continue;
      const tt = trip.startT + simTRef.current;
      const m = motionAt(trip, tt);
      rt.setPosition(m.position.lng, m.position.lat);
      rt.setBearing(m.bearing);
      vehicleFeatures.push({
        type: "Feature",
        properties: { code: trip.vehicle.code, color: trip.vehicle.color },
        geometry: { type: "Point", coordinates: [m.position.lng, m.position.lat] },
      });
      (map.getSource(`route-${trip.vehicle.id}`) as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: traveledPath(trip, tt) },
      });
      if (followIdRef.current === trip.vehicle.id) {
        followPos = m.position;
        followBearing = m.bearing;
      }
    }
    (map.getSource("vehicles") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: vehicleFeatures,
    });
    map.triggerRepaint();

    if (followPos) {
      const target: [number, number] = [followPos.lng, followPos.lat];
      if (!camCenter.current) {
        camCenter.current = target;
        camBearing.current = followBearing;
      }
      camCenter.current = [
        camCenter.current[0] + (target[0] - camCenter.current[0]) * LERP_FACTOR,
        camCenter.current[1] + (target[1] - camCenter.current[1]) * LERP_FACTOR,
      ];
      let bd = followBearing - camBearing.current;
      if (bd > 180) bd -= 360;
      if (bd < -180) bd += 360;
      camBearing.current += bd * LERP_FACTOR * 0.5;
      map.jumpTo({
        center: camCenter.current,
        bearing: camBearing.current,
        zoom: FOLLOW_ZOOM,
        pitch: FOLLOW_PITCH,
        padding: { top: 0, bottom: 0, left: 0, right: panelOpenRef.current ? 400 : 0 },
      });
    }
  }, []);

  const animate = useCallback(
    (now: number) => {
      if (!isPlayingRef.current) return;
      const last = lastFrameRef.current ?? now;
      const dt = Math.min(0.1, (now - last) / 1000);
      lastFrameRef.current = now;
      simTRef.current += dt * speedRef.current;

      renderFrame();

      if (now - lastSnapshotRef.current > SNAPSHOT_MS) {
        lastSnapshotRef.current = now;
        const snap = publishSnapshot();
        if (snap && snap.items.every((i) => i.state.done)) {
          setIsPlaying(false);
          return;
        }
      }
      animFrameRef.current = requestAnimationFrame(animate);
    },
    [publishSnapshot, renderFrame]
  );

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying && tripsReady) {
      lastFrameRef.current = null;
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, tripsReady, animate]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    followIdRef.current = followId;
    camCenter.current = null;
    if (!followId) setPanelOpen(false);
    // Saat simulasi dijeda, kamera tetap harus pindah ke kendaraan terpilih.
    else if (!isPlayingRef.current) requestAnimationFrame(() => renderFrame());
  }, [followId, renderFrame]);
  useEffect(() => {
    panelOpenRef.current = panelOpen;
    document.body.classList.toggle("panel-open", panelOpen && !!followId);
  }, [panelOpen, followId]);

  const fitAll = useCallback(() => {
    const map = mapInstance.current;
    if (!map || tripsRef.current.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const t of tripsRef.current) for (const p of t.plannedLine) bounds.extend([p.lng, p.lat]);
    map.fitBounds(bounds, { padding: { top: 140, bottom: 130, left: 420, right: 60 }, pitch: 45, bearing: -10, duration: 900 });
  }, []);

  const follow = useCallback((vehicleId: string) => {
    setFollowId(vehicleId);
    setPanelOpen(true);
    setActiveTab("ringkasan");
  }, []);
  const followRef = useRef(follow);
  followRef.current = follow;

  const stopFollow = useCallback(() => {
    setFollowId(null);
    fitAll();
  }, [fitAll]);

  useEffect(() => {
    if (focusRequest && tripsReady) follow(focusRequest.vehicleId);
  }, [focusRequest, tripsReady, follow]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    const onDrag = () => {
      if (followIdRef.current) setFollowId(null);
    };
    map.on("dragstart", onDrag);
    return () => {
      map.off("dragstart", onDrag);
    };
  }, [isLoaded]);

  const restart = useCallback(() => {
    simTRef.current = 0;
    renderFrame();
    publishSnapshot();
    setIsPlaying(true);
  }, [publishSnapshot, renderFrame]);

  // ─── Inisialisasi peta ───
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [107.615, -6.912],
      zoom: 13.6,
      pitch: 45,
      bearing: -10,
      maxPitch: 85,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    mapInstance.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 160 }), "bottom-right");

    map.on("style.load", () => {
      const layers = map.getStyle().layers ?? [];
      const labelLayerId = layers.find(
        (l) => l.type === "symbol" && (l.layout as Record<string, unknown>)?.["text-field"]
      )?.id;
      const sources = map.getStyle().sources;
      const src = Object.keys(sources).find((k) => ["openmaptiles", "protomaps", "maptiler"].includes(k));
      if (!src) return;
      for (const bl of layers.filter((l) => l.id.includes("building") && l.type === "fill")) {
        try {
          map.removeLayer(bl.id);
        } catch {
          /* abaikan */
        }
      }
      map.addLayer(
        {
          id: "3d-buildings",
          source: src,
          "source-layer": "building",
          type: "fill-extrusion",
          minzoom: 13,
          paint: {
            "fill-extrusion-color": "#dcd8d2",
            "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.05, ["coalesce", ["get", "render_height"], 0]],
            "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.05, ["coalesce", ["get", "render_min_height"], 0]],
            "fill-extrusion-opacity": 0.85,
          },
        },
        labelLayerId
      );
    });

    map.on("load", async () => {
      setIsLoaded(true);
      const trips = await loadTrips();
      tripsRef.current = trips;

      for (const trip of trips) {
        const id = trip.vehicle.id;
        map.addSource(`planned-${id}`, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: trip.plannedLine.map((p) => [p.lng, p.lat]) },
          },
        });
        map.addLayer({
          id: `planned-${id}`,
          type: "line",
          source: `planned-${id}`,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": trip.vehicle.color, "line-width": 4, "line-opacity": 0.35, "line-dasharray": [1.5, 1.5] },
        });
      }

      map.addSource("deviations", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "deviations",
        type: "line",
        source: "deviations",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#e60000", "line-width": 9, "line-opacity": 0.45 },
      });

      for (const trip of trips) {
        const id = trip.vehicle.id;
        map.addSource(`route-${id}`, { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
        map.addLayer({
          id: `route-${id}`,
          type: "line",
          source: `route-${id}`,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": trip.vehicle.color, "line-width": 4, "line-opacity": 0.95 },
        });
      }

      map.addSource("stops", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "stops-circle",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": ["case", ["==", ["get", "status"], "pool"], 6, 8],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#111111",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "stops-label",
        type: "symbol",
        source: "stops",
        minzoom: 13.5,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.3],
          "text-anchor": "top",
          "text-font": ["Noto Sans Bold"],
        },
        paint: { "text-color": "#111111", "text-halo-color": "#ffffff", "text-halo-width": 1.6 },
      });
      map.on("click", "stops-circle", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string>;
        const label = p.status === "pool" ? "Pool / titik berangkat" : `Status: ${p.status.replace("_", " ").toUpperCase()}`;
        new maplibregl.Popup({ offset: 10 })
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(`<strong>${p.name}</strong><br/>${p.vehicle} · ${label}`)
          .addTo(map);
      });
      map.on("mouseenter", "stops-circle", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "stops-circle", () => (map.getCanvas().style.cursor = ""));

      map.addSource("vehicles", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "vehicles",
        type: "circle",
        source: "vehicles",
        maxzoom: 16,
        paint: {
          "circle-radius": 9,
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });
      map.addLayer({
        id: "vehicles-label",
        type: "symbol",
        source: "vehicles",
        maxzoom: 16,
        layout: {
          "text-field": ["get", "code"],
          "text-size": 11,
          "text-offset": [0, -1.5],
          "text-anchor": "bottom",
          "text-font": ["Noto Sans Bold"],
          "text-allow-overlap": true,
        },
        paint: { "text-color": ["get", "color"], "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });

      for (const trip of trips) {
        const start = trip.path[0];
        const { layer, setPosition, setBearing } = createModelLayer(
          `model-${trip.vehicle.id}`,
          "/dump_truck.glb",
          start.lng,
          start.lat,
          3.0
        );
        runtimeRef.current[trip.vehicle.id] = { setPosition, setBearing };
        map.addLayer(layer);
      }

      map.on("click", (e) => {
        let closest: string | null = null;
        let best = 40;
        for (const trip of tripsRef.current) {
          const { position } = motionAt(trip, trip.startT + simTRef.current);
          const s = map.project([position.lng, position.lat]);
          const d = Math.hypot(s.x - e.point.x, s.y - e.point.y);
          if (d < best) {
            best = d;
            closest = trip.vehicle.id;
          }
        }
        if (closest) followRef.current(closest);
      });

      renderFrame();
      publishSnapshot();
      fitAll();
      setTripsReady(true);
      setIsPlaying(true);
    });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const followed = snapshot?.items.find((i) => i.trip.vehicle.id === followId) ?? null;
  const allDone = !!snapshot && snapshot.items.every((i) => i.state.done);

  return (
    <div className="mapWrapper">
      <div ref={mapContainer} className="mapContainer" />

      {/* Jam simulasi & kontrol */}
      {tripsReady && snapshot && (
        <div className="simBar">
          <div className="simClock">
            <span className="simClockLabel">Simulasi</span>
            <span className="simClockValue">{snapshot.clock}</span>
          </div>
          <button className="simBtn simBtnPrimary" onClick={() => (allDone ? restart() : setIsPlaying((p) => !p))}>
            {allDone ? "Ulangi" : isPlaying ? "Jeda" : "Lanjut"}
          </button>
          {SPEEDS.map((s) => (
            <button key={s} className={`simBtn ${speed === s ? "active" : ""}`} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
          <button className="simBtn" onClick={stopFollow}>
            Semua
          </button>
        </div>
      )}

      {/* Legenda */}
      {tripsReady && !(followId && panelOpen) && (
        <div className="mapLegend">
          <span><i className="lgLine dashed" /> Rute standar</span>
          <span><i className="lgLine" /> Lintasan GPS</span>
          <span><i className="lgLine dev" /> Keluar rute</span>
          <span><i className="lgDot" style={{ background: STOP_COLORS.terlayani }} /> SERVED</span>
          <span><i className="lgDot" style={{ background: STOP_COLORS.terlewat }} /> NOT SERVED</span>
          <span><i className="lgDot" style={{ background: STOP_COLORS.tak_terverifikasi }} /> UNVERIFIED</span>
          <span><i className="lgDot" style={{ background: STOP_COLORS.menunggu }} /> WAITING</span>
        </div>
      )}

      {/* Daftar armada */}
      {snapshot && !followId && (
        <div className="truckList">
          <h4 className="truckListTitle">
            Armada aktif ({snapshot.items.length}) <span className="truckListHint">klik untuk detail</span>
          </h4>
          {snapshot.items.map(({ trip, state }) => (
            <TruckRow key={trip.vehicle.id} trip={trip} state={state} onClick={() => follow(trip.vehicle.id)} />
          ))}
        </div>
      )}

      {/* Panel detail kendaraan */}
      {followed && (
        <>
          <div className="followBadge" style={{ background: followed.trip.vehicle.color }}>
            <span>
              {followed.trip.vehicle.code} · {followed.trip.vehicle.plate}
            </span>
            <button className="followExitBtn" onClick={stopFollow} aria-label="Keluar mode ikuti">
              ✕
            </button>
          </div>
          <button className={`panelToggle ${panelOpen ? "open" : ""}`} onClick={() => setPanelOpen((p) => !p)} aria-label="Panel">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" />
            </svg>
          </button>
          <div className={`sidePanel ${panelOpen ? "open" : ""}`}>
            <div className="panelHeader">
              <div>
                <h3>{followed.trip.vehicle.code}</h3>
                <span className="panelSub">
                  {followed.trip.vehicle.plate} · {followed.trip.vehicle.upt}
                </span>
              </div>
              <span className={`chip ${followed.state.done ? "chipMuted" : followed.state.speedKmh > 0 ? "chipOk" : "chipWarn"}`}>
                {followed.state.done ? "Selesai" : followed.state.speedKmh > 0 ? "Berjalan" : "Di TPS"}
              </span>
            </div>
            <div className="panelTabs">
              {(
                [
                  ["ringkasan", "Ringkasan"],
                  ["bbm", "BBM"],
                  ["rute", "Rute & TPS"],
                  ["peringatan", "Peringatan"],
                ] as const
              ).map(([key, label]) => (
                <button key={key} className={`panelTab ${activeTab === key ? "active" : ""}`} onClick={() => setActiveTab(key)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="panelBody">
              {activeTab === "ringkasan" && <SummaryTab trip={followed.trip} state={followed.state} />}
              {activeTab === "bbm" && <FuelTab trip={followed.trip} state={followed.state} />}
              {activeTab === "rute" && <RouteTab trip={followed.trip} state={followed.state} />}
              {activeTab === "peringatan" && (
                <div className="truckAlertsList">
                  {snapshot!.alerts.filter((a) => a.vehicleId === followed.trip.vehicle.id).length === 0 && (
                    <p className="muted">Tidak ada peringatan untuk kendaraan ini.</p>
                  )}
                  {snapshot!.alerts
                    .filter((a) => a.vehicleId === followed.trip.vehicle.id)
                    .map((a) => (
                      <div
                        key={a.id}
                        className={`truckAlertItem ${
                          a.severity === "kritis" ? "alert-danger" : a.severity === "peringatan" ? "alert-warning" : "alert-info"
                        }`}
                      >
                        <div className="truckAlertContent">
                          <span className="truckAlertText">{a.title}</span>
                          <span className="truckAlertMsg">{a.message}</span>
                          <span className="truckAlertTime">{a.clock}</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className={`mapLoading ${tripsReady ? "loaded" : ""}`}>
        <div className="loadingContent">
          <div className="loadingSpinner" />
          <span className="loadingText">{isLoaded ? "Menyiapkan rute & data GPS…" : "Memuat peta…"}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-komponen ─────────────────────────────────────────────

function TruckRow({ trip, state, onClick }: { trip: Trip; state: TripState; onClick: () => void }) {
  const total = state.validatedStops.length;
  const missed = state.statuses.filter((s) => s === "terlewat").length;
  const unverified = state.statuses.filter((s) => s === "tak_terverifikasi").length;
  const progress = Math.min(100, (state.t / trip.durationS) * 100);
  return (
    <button className="truckListItem" onClick={onClick}>
      <div className="truckDot" style={{ background: trip.vehicle.color }} />
      <div className="truckItemInfo">
        <div className="truckItemNameRow">
          <span className="truckItemName">{trip.vehicle.code}</span>
          <span className="truckItemPlate">{trip.vehicle.plate}</span>
        </div>
        <span className="truckItemRoute">
          {trip.assignment.routeName} · {trip.vehicle.type}
        </span>
        <div className="progressBar">
          <div className="progressFill" style={{ width: `${progress}%`, background: trip.vehicle.color }} />
        </div>
        <div className="truckItemChips">
          <span className={`chip ${state.deviations.length ? "chipBad" : "chipOk"}`}>
            {state.deviations.length ? "Keluar rute" : "Rute sesuai"}
          </span>
          <span className={`chip ${missed ? "chipBad" : unverified ? "chipWarn" : "chipMuted"}`}>
            TPS {state.servedCount}/{total}
          </span>
          <span className={`chip ${state.fuel ? FUEL_CHIP[state.fuel.status] : "chipMuted"}`}>
            BBM {state.fuel ? FUEL_LABEL[state.fuel.status] : "berjalan"}
          </span>
        </div>
      </div>
    </button>
  );
}

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="kvRow">
      <span className="kvKey">{k}</span>
      <span className={`kvVal ${tone ? `tone-${tone}` : ""}`}>{v}</span>
    </div>
  );
}

function SummaryTab({ trip, state }: { trip: Trip; state: TripState }) {
  const v = trip.vehicle;
  const departS = clockAt(trip, 0);
  return (
    <>
      <div className="panelSection">
        <span className="panelLabel">Penugasan</span>
        <Row k="Rute" v={trip.assignment.routeName} />
        <Row k="Kendaraan" v={`${v.model} (${v.type})`} />
        <Row k="Pengemudi" v={v.driver} />
        <Row k="Berangkat" v={formatClock(departS)} />
      </div>
      <div className="panelDivider" />
      <div className="statGrid">
        <div className="statTile">
          <span className="panelLabel">Jarak GPS</span>
          <span className="statTileValue">{state.gpsDistanceKm.toFixed(2)} km</span>
        </div>
        <div className="statTile">
          <span className="panelLabel">Kecepatan</span>
          <span className="statTileValue">{state.speedKmh} km/j</span>
        </div>
        <div className="statTile">
          <span className="panelLabel">TPS terlayani</span>
          <span className="statTileValue">
            {state.servedCount}/{state.validatedStops.length}
          </span>
        </div>
        <div className="statTile">
          <span className="panelLabel">Kepatuhan rute</span>
          <span className={`statTileValue ${state.compliancePct < 95 ? "tone-bad" : ""}`}>{state.compliancePct.toFixed(1)}%</span>
        </div>
        <div className="statTile" style={{ gridColumn: "1 / -1" }}>
          <span className="panelLabel">Anomaly Score (ML Pattern)</span>
          <span className={`statTileValue ${state.anomaly?.isAnomaly ? "tone-bad" : "tone-ok"}`}>
            {state.anomaly ? `${state.anomaly.score}%` : "Menunggu selesai"}
          </span>
        </div>
      </div>
      <div className="panelDivider" />
      <div className="panelSection">
        <span className="panelLabel">Kualitas data GPS</span>
        <Row k="Ping diterima" v={`${state.pingCount} (interval ${v.gpsIntervalS} dtk)`} />
        <Row
          k="Ketersediaan data"
          v={`${state.availabilityPct.toFixed(1)}%`}
          tone={state.availabilityPct >= AVAILABILITY_TARGET_PCT ? "ok" : "bad"}
        />
        <Row k="Celah sinyal" v={state.gaps.length ? `${state.gaps.length}×` : "Tidak ada"} />
      </div>
    </>
  );
}

function FuelTab({ trip, state }: { trip: Trip; state: TripState }) {
  const p = trip.vehicle.fuel;
  const est = state.fuel?.estimatedL ?? state.fuelEstimateL;
  const dev = state.fuel;
  return (
    <>
      <div className="panelSection">
        <span className="panelLabel">Parameter konsumsi kendaraan</span>
        <Row k="Rasio jalan" v={`${p.kmPerLiter} km/L`} />
        <Row k="Tambahan per TPS" v={`${p.literPerStop} L (hidrolik/PTO)`} />
      </div>
      <div className="formulaBox">
        Estimasi Prediksi ML (Fuel Consumption Anomaly Detection)
        <br />= Baseline + Penyesuaian Variabel ML (Jarak, Kecepatan, Idle, Muatan) ={" "}
        <strong>{state.fuelEstimateL.toFixed(2)} L</strong>
      </div>
      <div className="panelDivider" />
      <div className="panelSection">
        <span className="panelLabel">Rekonsiliasi dengan BBM administrasi</span>
        <div className="fuelCompare">
          <FuelBar label="Estimasi GPS" value={est} max={Math.max(est, trip.adminFuelL) * 1.1} color="#0044ff" />
          <FuelBar label="Administrasi" value={trip.adminFuelL} max={Math.max(est, trip.adminFuelL) * 1.1} color="#111111" />
        </div>
        {dev ? (
          <>
            <Row
              k="Selisih"
              v={`${dev.deviationL > 0 ? "+" : ""}${dev.deviationL.toFixed(2)} L (${dev.deviationPct > 0 ? "+" : ""}${dev.deviationPct.toFixed(1)}%)`}
              tone={dev.status === "wajar" ? "ok" : dev.status === "perlu_cek" ? "warn" : "bad"}
            />
            <div className={`verdict verdict-${dev.status}`}>{FUEL_LABEL[dev.status]}</div>
          </>
        ) : (
          <p className="muted">Rekonsiliasi final dihitung setelah ritase selesai. Estimasi di atas masih berjalan.</p>
        )}
        <p className="muted small">
          Ambang: ≤{DEFAULT_FUEL_THRESHOLDS.warnPct}% wajar · ≤{DEFAULT_FUEL_THRESHOLDS.anomalyPct}% perlu cek · &gt;
          {DEFAULT_FUEL_THRESHOLDS.anomalyPct}% anomali
        </p>
      </div>
    </>
  );
}

function FuelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="fuelCompareRow">
      <span className="fuelCompareLabel">{label}</span>
      <div className="fuelBar">
        <div className="fuelFill" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
      <span className="fuelCompareValue">{value.toFixed(1)} L</span>
    </div>
  );
}

function RouteTab({ trip, state }: { trip: Trip; state: TripState }) {
  return (
    <>
      <div className="panelSection">
        <span className="panelLabel">Validasi rute standar</span>
        <Row k="Panjang rute standar" v={`${(trip.plannedLengthM / 1000).toFixed(2)} km`} />
        <Row k="Kepatuhan" v={`${state.compliancePct.toFixed(1)}%`} tone={state.deviations.length ? "bad" : "ok"} />
        {state.deviations.map((d, i) => (
          <div key={i} className="devItem">
            Keluar rute {formatClock(clockAt(trip, d.startT))}
            {d.ongoing ? " – sekarang" : `–${formatClock(clockAt(trip, d.endT))}`}: {(d.lengthM / 1000).toFixed(2)} km, maks.{" "}
            {Math.round(d.maxDistanceM)} m
          </div>
        ))}
        <p className="muted small">
          Keluar rute bila ≥{DEFAULT_ROUTE_OPTIONS.minConsecutive} ping berurutan berjarak &gt;{DEFAULT_ROUTE_OPTIONS.thresholdM} m dari
          rute standar.
        </p>
      </div>
      <div className="panelDivider" />
      <div className="panelSection">
        <span className="panelLabel">Kunjungan titik pelayanan</span>
        <ol className="stopList">
          {state.validatedStops.map((s, i) => {
            const st = state.statuses[i];
            const v = state.visits[i];
            return (
              <li key={s.id} className={`stopItem stop-${st}`}>
                <span className="stopName">[{STOP_LABEL[st]}] {s.name}</span>
                <span className="stopMeta">
                  {st === "terlayani" && v.arrivedT !== null
                    ? `Tiba ${formatClock(clockAt(trip, v.arrivedT))} · berhenti ${Math.round(v.dwellS / 60)} mnt`
                    : st === "terlewat"
                      ? `Tidak berhenti (terdekat ${Math.round(v.minDistanceM)} m)`
                      : st === "tak_terverifikasi"
                        ? "UNVERIFIED: data GPS terputus di lokasi"
                        : "Menunggu"}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="muted small">
          Terlayani bila kendaraan berada ≤{DEFAULT_STOP_OPTIONS.radiusM} m dari TPS selama ≥{DEFAULT_STOP_OPTIONS.minDwellS} detik.
        </p>
      </div>
    </>
  );
}
