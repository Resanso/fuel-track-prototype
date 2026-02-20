"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Map.css";
import {
  fetchRoute,
  routeToGeoJSON,
  interpolateRoute,
  type RoutePoint,
} from "./carAnimation";
import { createModelLayer } from "./ThreeDModel";

// ─── Truck fleet data (Cartrack-enhanced) ─────────────────────
interface DriverBehavior {
  safetyScore: number; // 0-100
  speedingEvents: number;
  harshBraking: number;
  sharpTurns: number;
}

interface TruckInfo {
  id: string;
  name: string;
  driver: string;
  plate: string;
  carType: string;
  fuelCapacity: number;
  initialFuel: number;
  fuelPercent: number; // For mini-list use only
  speed: number;
  routeLabel: string;
  start: [number, number];
  end: [number, number];
  color: string;
  startOffset: number;
  // Cartrack-enhanced fields
  status: "active" | "idle" | "stopped" | "maintenance";
  temperature: number; // cargo temp °C
  driverIdTag: string;
  engineHours: number;
  odometer: number;
  geofenceZone: string;
  driverBehavior: DriverBehavior;
  deliveryStatus: string;
  lastAlert: string;
  fuelConsumption: number; // L/100km
}

const TRUCKS: TruckInfo[] = [
  {
    id: "truck-1",
    name: "Dump Truck #01",
    driver: "Ahmad Suryadi",
    plate: "D 1234 ABC",
    carType: "Hino 500 Dump",
    fuelCapacity: 300,
    initialFuel: 204,
    fuelPercent: 68,
    speed: 42,
    routeLabel: "Gedung Sate → Alun-Alun",
    start: [107.6186, -6.9025],
    end: [107.6098, -6.9218],
    color: "#6366f1",
    startOffset: 0,
    status: "active",
    temperature: 4.2,
    driverIdTag: "DRV-001",
    engineHours: 1245,
    odometer: 87432,
    geofenceZone: "Bandung CBD",
    driverBehavior: { safetyScore: 92, speedingEvents: 1, harshBraking: 0, sharpTurns: 2 },
    deliveryStatus: "In Transit — ETA 15 min",
    lastAlert: "Geofence entered",
    fuelConsumption: 18.5,
  },
  {
    id: "truck-2",
    name: "Dump Truck #02",
    driver: "Budi Santoso",
    plate: "D 5678 DEF",
    carType: "Mitsubishi Fuso",
    fuelCapacity: 250,
    initialFuel: 112,
    fuelPercent: 45,
    speed: 38,
    routeLabel: "Pasteur → Dago",
    start: [107.5940, -6.8930],
    end: [107.6170, -6.8850],
    color: "#10b981",
    startOffset: 0.2,
    status: "active",
    temperature: 5.1,
    driverIdTag: "DRV-002",
    engineHours: 980,
    odometer: 65210,
    geofenceZone: "Pasteur District",
    driverBehavior: { safetyScore: 74, speedingEvents: 5, harshBraking: 3, sharpTurns: 4 },
    deliveryStatus: "Delivering — Stop 2/4",
    lastAlert: "Speeding: 85 km/h",
    fuelConsumption: 22.1,
  },
  {
    id: "truck-3",
    name: "Dump Truck #03",
    driver: "Cahya Pratama",
    plate: "D 9012 GHI",
    carType: "Hino 500 Dump",
    fuelCapacity: 300,
    initialFuel: 246,
    fuelPercent: 82,
    speed: 35,
    routeLabel: "Cihampelas → Setiabudi",
    start: [107.6030, -6.8940],
    end: [107.6170, -6.8730],
    color: "#f59e0b",
    startOffset: 0.4,
    status: "active",
    temperature: 3.8,
    driverIdTag: "DRV-003",
    engineHours: 1580,
    odometer: 112850,
    geofenceZone: "North Bandung",
    driverBehavior: { safetyScore: 88, speedingEvents: 2, harshBraking: 1, sharpTurns: 1 },
    deliveryStatus: "Loading",
    lastAlert: "Temp warning: 8.1°C",
    fuelConsumption: 19.8,
  },
  {
    id: "truck-4",
    name: "Dump Truck #04",
    driver: "Deni Firmansyah",
    plate: "D 3456 JKL",
    carType: "Volvo FMX",
    fuelCapacity: 400,
    initialFuel: 124,
    fuelPercent: 31,
    speed: 40,
    routeLabel: "Buah Batu → Kopo",
    start: [107.6340, -6.9400],
    end: [107.5890, -6.9370],
    color: "#ef4444",
    startOffset: 0.6,
    status: "active",
    temperature: 6.5,
    driverIdTag: "DRV-004",
    engineHours: 2100,
    odometer: 142300,
    geofenceZone: "South Bandung",
    driverBehavior: { safetyScore: 65, speedingEvents: 8, harshBraking: 5, sharpTurns: 6 },
    deliveryStatus: "In Transit — ETA 25 min",
    lastAlert: "Fuel anomaly: -15L",
    fuelConsumption: 25.3,
  },
  {
    id: "truck-5",
    name: "Dump Truck #05",
    driver: "Eko Wibowo",
    plate: "D 7890 MNO",
    carType: "Mitsubishi Fuso",
    fuelCapacity: 250,
    initialFuel: 137,
    fuelPercent: 55,
    speed: 0,
    routeLabel: "Bandung Station → Braga",
    start: [107.6030, -6.9125],
    end: [107.6095, -6.9190],
    color: "#8b5cf6",
    startOffset: 0.8,
    status: "idle",
    temperature: 5.0,
    driverIdTag: "DRV-005",
    engineHours: 760,
    odometer: 45600,
    geofenceZone: "Station Area",
    driverBehavior: { safetyScore: 95, speedingEvents: 0, harshBraking: 0, sharpTurns: 1 },
    deliveryStatus: "Completed",
    lastAlert: "Delivery completed",
    fuelConsumption: 16.2,
  },
];

// Geofence zones
interface GeofenceZone {
  id: string;
  name: string;
  type: "depot" | "delivery" | "restricted";
  center: [number, number];
  radiusKm: number;
  color: string;
}

const GEOFENCES: GeofenceZone[] = [
  {
    id: "gf-depot",
    name: "Depot Utama",
    type: "depot",
    center: [107.6030, -6.9125],
    radiusKm: 0.4,
    color: "#6366f1",
  },
  {
    id: "gf-delivery-1",
    name: "Zona Pengiriman Alun-Alun",
    type: "delivery",
    center: [107.6098, -6.9218],
    radiusKm: 0.35,
    color: "#10b981",
  },
  {
    id: "gf-restricted",
    name: "Zona Terbatas",
    type: "restricted",
    center: [107.6200, -6.9050],
    radiusKm: 0.3,
    color: "#ef4444",
  },
];

// Generate circle polygon from center + radius
function createCircleGeoJSON(
  center: [number, number],
  radiusKm: number,
  points = 64
): GeoJSON.Feature {
  const coords: [number, number][] = [];
  const distanceX =
    radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = radiusKm / 110.574;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([center[0] + x, center[1] + y]);
  }
  coords.push(coords[0]);
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

// Follow cam settings
const FOLLOW_ZOOM = 19;
const FOLLOW_PITCH = 70;
const FOLLOW_BEARING_OFFSET = 30;
const LERP_FACTOR = 0.08;
const SPEED = 0.0001;

// Per-truck runtime state
interface TruckRuntime {
  route: RoutePoint[];
  progress: number;
  setPosition: (lng: number, lat: number) => void;
  setBearing: (bearing: number) => void;
}

const STATUS_CONFIGS: Record<string, { label: string; color: string; icon: string }> = {
  active: { label: "Active", color: "#22c55e", icon: "•" },
  idle: { label: "Idle", color: "#f59e0b", icon: "•" },
  stopped: { label: "Stopped", color: "#ef4444", icon: "•" },
  maintenance: { label: "Maintenance", color: "#0ea5e9", icon: "•" },
};

export default function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const animFrameRef = useRef<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [routeLoaded, setRouteLoaded] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const isFollowingRef = useRef(false);
  const [followTruckId, setFollowTruckId] = useState<string | null>(null);
  const followTruckIdRef = useRef<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelOpenRef = useRef(false);
  const camCenter = useRef<[number, number] | null>(null);
  const camBearing = useRef(0);
  const [activeTab, setActiveTab] = useState<"overview" | "monitoring" | "alerts">("overview");
  
  const [realtimeStats, setRealtimeStats] = useState({ distance: 0, fuel: 0, fuelPct: 0 });
  const lastUpdateRef = useRef(0);

  // All trucks runtime data
  const trucksRuntime = useRef<Record<string, TruckRuntime>>({});
  const loadedCount = useRef(0);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const animate = useCallback(() => {
    const map = mapInstance.current;
    if (!map) return;
    if (!isPlayingRef.current) return;

    const runtime = trucksRuntime.current;
    let followPos: { lng: number; lat: number } | null = null;
    let followBearing = 0;

    // Update all trucks
    for (const truck of TRUCKS) {
      const rt = runtime[truck.id];
      if (!rt || rt.route.length < 2) continue;

      rt.progress += SPEED;
      if (rt.progress >= 1) rt.progress = 0;

      const { position, bearing, traveledMeters, segmentIndex } = interpolateRoute(rt.route, rt.progress);
      
      // Update mapped route to only show the path that has been passed
      const passedRoute = rt.route.slice(0, segmentIndex + 1).map(p => [p.lng, p.lat]);
      passedRoute.push([position.lng, position.lat]);
      const source = map.getSource(`route-${truck.id}`) as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: passedRoute }
        });
      }

      rt.setPosition(position.lng, position.lat);
      rt.setBearing(bearing);

      // Track the followed truck
      if (followTruckIdRef.current === truck.id) {
        followPos = position;
        followBearing = bearing;

        const now = performance.now();
        if (now - lastUpdateRef.current > 200) {
          const fuelConsumed = traveledMeters * (truck.fuelConsumption / 100000);
          const fuel = Math.max(0, truck.initialFuel - fuelConsumed);
          const fuelPct = Math.max(0, (fuel / truck.fuelCapacity) * 100);
          setRealtimeStats({ distance: traveledMeters / 1000, fuel, fuelPct });
          lastUpdateRef.current = now;
        }
      }
    }

    map.triggerRepaint();

    // Follow camera
    if (isFollowingRef.current && followPos) {
      const targetCenter: [number, number] = [followPos.lng, followPos.lat];
      const targetBearing = followBearing + FOLLOW_BEARING_OFFSET;

      if (!camCenter.current) {
        camCenter.current = targetCenter;
        camBearing.current = targetBearing;
      }

      camCenter.current = [
        lerp(camCenter.current[0], targetCenter[0], LERP_FACTOR),
        lerp(camCenter.current[1], targetCenter[1], LERP_FACTOR),
      ];

      let bd = targetBearing - camBearing.current;
      if (bd > 180) bd -= 360;
      if (bd < -180) bd += 360;
      camBearing.current += bd * LERP_FACTOR;

      const rightPadding = panelOpenRef.current ? 340 : 0;

      map.jumpTo({
        center: camCenter.current,
        bearing: camBearing.current,
        zoom: FOLLOW_ZOOM,
        pitch: FOLLOW_PITCH,
        padding: { top: 0, bottom: 0, left: 0, right: rightPadding },
      });
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    isFollowingRef.current = isFollowing;
    if (!isFollowing) {
      camCenter.current = null;
      setPanelOpen(false);
      setFollowTruckId(null);
      setActiveTab("overview");
    }
  }, [isFollowing]);

  useEffect(() => {
    followTruckIdRef.current = followTruckId;
  }, [followTruckId]);

  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying && routeLoaded) {
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, routeLoaded, animate]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    const handleDragStart = () => {
      if (isFollowingRef.current) setIsFollowing(false);
    };
    map.on("dragstart", handleDragStart);
    return () => { map.off("dragstart", handleDragStart); };
  }, [isLoaded]);

  const enterFollowMode = useCallback((truckId: string) => {
    setFollowTruckId(truckId);
    setIsFollowing(true);
    setIsPlaying(true);
    camCenter.current = null;
  }, []);

  const enterFollowModeRef = useRef(enterFollowMode);
  enterFollowModeRef.current = enterFollowMode;

  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [107.6100, -6.9100],
      zoom: 14,
      pitch: 55,
      bearing: -17.6,
      maxPitch: 85,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 200 }), "bottom-left");

    map.on("style.load", () => {
      const layers = map.getStyle().layers;
      if (!layers) return;

      let labelLayerId: string | undefined;
      for (const layer of layers) {
        if (layer.type === "symbol" && (layer.layout as Record<string, unknown>)?.["text-field"]) {
          labelLayerId = layer.id;
          break;
        }
      }

      const sources = map.getStyle().sources;
      const hasBuildings = Object.keys(sources).some(
        (key) => key === "openmaptiles" || key === "protomaps" || key === "maptiler"
      );

      if (hasBuildings) {
        const existingBuildingLayers = layers.filter((l) => l.id.includes("building") && l.type === "fill");
        for (const bl of existingBuildingLayers) {
          try { map.removeLayer(bl.id); } catch { /* ignore */ }
        }

        const sourceName = Object.keys(sources).find(
          (key) => key === "openmaptiles" || key === "protomaps" || key === "maptiler"
        ) || "openmaptiles";

        map.addLayer({
          id: "3d-buildings",
          source: sourceName,
          "source-layer": "building",
          type: "fill-extrusion",
          minzoom: 13,
          paint: {
            "fill-extrusion-color": [
              "interpolate", ["linear"], ["get", "render_height"],
              0, "#e8e4df", 10, "#d9d5cf", 25, "#cec9c2",
              50, "#c4bfb8", 100, "#b8b3ab", 150, "#aca7a0",
            ],
            "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.05, ["get", "render_height"]],
            "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.05, ["get", "render_min_height"]],
            "fill-extrusion-opacity": 0.95,
          },
        }, labelLayerId);
      }
    });

    map.on("load", () => {
      setIsLoaded(true);

      // Add geofence zones
      for (const gf of GEOFENCES) {
        const circleGeoJSON = createCircleGeoJSON(gf.center, gf.radiusKm);
        map.addSource(`geofence-${gf.id}`, {
          type: "geojson",
          data: circleGeoJSON as GeoJSON.Feature,
        });

        map.addLayer({
          id: `geofence-fill-${gf.id}`,
          type: "fill",
          source: `geofence-${gf.id}`,
          paint: {
            "fill-color": gf.color,
            "fill-opacity": 0.1,
          },
        });

        map.addLayer({
          id: `geofence-border-${gf.id}`,
          type: "line",
          source: `geofence-${gf.id}`,
          paint: {
            "line-color": gf.color,
            "line-width": 2,
            "line-opacity": 0.5,
            "line-dasharray": [4, 4],
          },
        });

        // Geofence label
        map.addSource(`geofence-label-${gf.id}`, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { name: gf.name, type: gf.type },
            geometry: { type: "Point", coordinates: gf.center },
          } as GeoJSON.Feature,
        });

        map.addLayer({
          id: `geofence-label-${gf.id}`,
          type: "symbol",
          source: `geofence-label-${gf.id}`,
          layout: {
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-anchor": "center",
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": gf.color,
            "text-halo-color": "rgba(0,0,0,0.7)",
            "text-halo-width": 1.5,
          },
        });
      }

      // Load all truck routes in parallel
      const routePromises = TRUCKS.map(async (truck) => {
        const route = await fetchRoute(truck.start, truck.end);
        return { truck, route };
      });

      Promise.all(routePromises)
        .then((results) => {
          for (const { truck, route } of results) {
            // Add route line (initially empty or at start, drawn dynamically in animate)
            map.addSource(`route-${truck.id}`, {
              type: "geojson",
              data: routeToGeoJSON([route[0], route[0]]) as GeoJSON.Feature,
            });

            map.addLayer({
              id: `route-glow-${truck.id}`,
              type: "line",
              source: `route-${truck.id}`,
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": truck.color,
                "line-width": 8,
                "line-opacity": 0.2,
                "line-blur": 5,
              },
            });

            map.addLayer({
              id: `route-line-${truck.id}`,
              type: "line",
              source: `route-${truck.id}`,
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": truck.color,
                "line-width": 3,
                "line-opacity": 0.8,
              },
            });

            // Start Marker over location
            new maplibregl.Marker({ color: "#22c55e", scale: 0.7 })
              .setLngLat(truck.start)
              .setPopup(new maplibregl.Popup().setHTML(
                `<strong>${truck.name}</strong><br/>Start — ${truck.routeLabel.split("→")[0].trim()}`
              ))
              .addTo(map);

            // 3D model layer
            const { layer, setPosition, setBearing } = createModelLayer(
              `model-${truck.id}`,
              "/dump_truck.glb",
              route[0].lng,
              route[0].lat,
              3.0
            );

            trucksRuntime.current[truck.id] = {
              route,
              progress: truck.startOffset,
              setPosition,
              setBearing,
            };

            map.addLayer(layer);
          }

          // Click detection for all trucks
          map.on("click", (e) => {
            let closestId: string | null = null;
            let closestDist = Infinity;

            for (const truck of TRUCKS) {
              const rt = trucksRuntime.current[truck.id];
              if (!rt || rt.route.length < 2) continue;
              const { position } = interpolateRoute(rt.route, rt.progress);
              const screen = map.project([position.lng, position.lat]);
              const dist = Math.sqrt(
                (screen.x - e.point.x) ** 2 + (screen.y - e.point.y) ** 2
              );
              if (dist < 50 && dist < closestDist) {
                closestDist = dist;
                closestId = truck.id;
              }
            }

            if (closestId) {
              enterFollowModeRef.current(closestId);
            }
          });

          setRouteLoaded(true);
          setIsPlaying(true);
        })
        .catch((err) => console.error("Route fetch error:", err));
    });

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const followedTruck = TRUCKS.find((t) => t.id === followTruckId) || null;

  // Safety score color
  const getSafetyColor = (score: number) => {
    if (score >= 85) return "#22c55e";
    if (score >= 70) return "#f59e0b";
    return "#ef4444";
  };

  // Mini fuel bar chart data
  const fuelChartData = [65, 72, 68, 58, 62, 55, followedTruck?.fuelPercent ?? 50];
  const fuelChartDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Truck-specific alerts
  const truckAlerts = [
    { type: "warning", text: "Speeding: 85 km/h in 60 zone", time: "5m" },
    { type: "success", text: "Geofence entered: Delivery zone", time: "12m" },
    { type: "info", text: "Driver ID authenticated", time: "18m" },
    { type: "danger", text: "Harsh braking detected", time: "25m" },
  ];

  return (
    <div className="mapWrapper">
      <div ref={mapContainer} className="mapContainer" />

      {isFollowing && followedTruck && (
        <div className="followBadge" style={{ background: `${followedTruck.color}dd` }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
          </svg>
          <span className="followBadgeStatus" style={{ background: STATUS_CONFIGS[followedTruck.status].color }}>{STATUS_CONFIGS[followedTruck.status].icon}</span>
          <span>{followedTruck.name}</span>
          <button className="followExitBtn" onClick={() => setIsFollowing(false)}>X</button>
        </div>
      )}

      {/* Enhanced Side panel in follow mode */}
      {isFollowing && followedTruck && (
        <>
          <button
            className={`panelToggle ${panelOpen ? "open" : ""}`}
            onClick={() => setPanelOpen((p) => !p)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
              <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" />
            </svg>
          </button>
          <div className={`sidePanel ${panelOpen ? "open" : ""}`}>
            <div className="panelHeader">
              <h3>{followedTruck.name}</h3>
              <div className="panelStatusBadge" style={{ background: STATUS_CONFIGS[followedTruck.status].color }}>
                {STATUS_CONFIGS[followedTruck.status].label}
              </div>
            </div>

            {/* Tabs */}
            <div className="panelTabs">
              {(["overview", "monitoring", "alerts"] as const).map((tab) => (
                <button
                  key={tab}
                  className={`panelTab ${activeTab === tab ? "active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === "overview" && "OVERVIEW"}
                  {tab === "monitoring" && "MONITORING"}
                  {tab === "alerts" && "ALERTS"}
                </button>
              ))}
            </div>

            <div className="panelBody">
              {/* OVERVIEW TAB */}
              {activeTab === "overview" && (
                <>
                  <div className="panelSection">
                    <span className="panelLabel">Route Path</span>
                    <span className="panelValue">{followedTruck.routeLabel}</span>
                  </div>
                  <div className="panelSection">
                    <span className="panelLabel">Delivery Status</span>
                    <span className="panelValue deliveryStatus">{followedTruck.deliveryStatus}</span>
                  </div>
                  <div className="panelDivider" />
                  <div className="panelSection">
                    <span className="panelLabel">Vehicle Type</span>
                    <span className="panelValue">{followedTruck.carType}</span>
                  </div>
                  <div className="panelGrid" style={{ marginBottom: "1rem" }}>
                    <div className="panelGridItem">
                      <span className="panelLabel">Distance Traveled</span>
                      <span className="panelValue">{realtimeStats.distance.toFixed(2)} km</span>
                    </div>
                    <div className="panelGridItem">
                      <span className="panelLabel">Speed</span>
                      <span className="panelValue">{followedTruck.speed} km/h</span>
                    </div>
                  </div>
                  <div className="panelSection">
                    <span className="panelLabel">Live Fuel Level</span>
                    <div className="fuelBar">
                      <div
                        className="fuelFill"
                        style={{
                          width: `${realtimeStats.fuelPct}%`,
                          background: realtimeStats.fuelPct < 20
                            ? "var(--danger)"
                            : "var(--accent)",
                        }}
                      />
                    </div>
                    <span className="panelValue" style={{ marginTop: 4 }}>
                      {realtimeStats.fuel.toFixed(1)} L / {followedTruck.fuelCapacity} L ({realtimeStats.fuelPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="panelDivider" />
                  <div className="panelSection">
                    <span className="panelLabel">Driver</span>
                    <span className="panelValue">{followedTruck.driver}</span>
                  </div>
                  <div className="panelGrid">
                    <div className="panelGridItem">
                      <span className="panelLabel">License Plate</span>
                      <span className="panelValue">{followedTruck.plate}</span>
                    </div>
                    <div className="panelGridItem">
                      <span className="panelLabel">Driver ID Tag</span>
                      <span className="panelValue">{followedTruck.driverIdTag}</span>
                    </div>
                  </div>
                  <div className="panelSection">
                    <span className="panelLabel">Geofence Zone</span>
                    <span className="panelValue geofenceTag">{followedTruck.geofenceZone}</span>
                  </div>
                </>
              )}

              {/* MONITORING TAB */}
              {activeTab === "monitoring" && (
                <>
                  {/* Safety Score Ring */}
                  <div className="safetyScoreWidget">
                    <div className="safetyRing" style={{ borderColor: getSafetyColor(followedTruck.driverBehavior.safetyScore) }}>
                      <span className="safetyScoreValue">{followedTruck.driverBehavior.safetyScore}</span>
                      <span className="safetyScoreLabel">Safety</span>
                    </div>
                    <div className="safetyDetails">
                      <div className="safetyDetailItem">
                        <span className="safetyDetailIcon" style={{ color: "#ef4444", fontWeight: 900 }}>!</span>
                        <span className="safetyDetailText">Speeding: {followedTruck.driverBehavior.speedingEvents}</span>
                      </div>
                      <div className="safetyDetailItem">
                        <span className="safetyDetailIcon" style={{ color: "#f59e0b" }}>⏹</span>
                        <span className="safetyDetailText">Hard Braking: {followedTruck.driverBehavior.harshBraking}</span>
                      </div>
                      <div className="safetyDetailItem">
                        <span className="safetyDetailIcon" style={{ color: "#8b5cf6" }}>↩</span>
                        <span className="safetyDetailText">Sharp Turns: {followedTruck.driverBehavior.sharpTurns}</span>
                      </div>
                    </div>
                  </div>
                  <div className="panelDivider" />

                  {/* Fuel Consumption Chart */}
                  <div className="panelSection">
                    <span className="panelLabel">Fuel Consumption (7 days)</span>
                    <div className="miniChart">
                      {fuelChartData.map((val, i) => (
                        <div key={i} className="miniChartCol">
                          <div className="miniChartBar" style={{ height: `${val}%`, background: val < 40 ? "#ef4444" : `${followedTruck.color}cc` }} />
                          <span className="miniChartLabel">{fuelChartDays[i]}</span>
                        </div>
                      ))}
                    </div>
                    <div className="panelValue" style={{ fontSize: 13, marginTop: 4 }}>
                      Avg: {followedTruck.fuelConsumption} L/100km
                    </div>
                  </div>
                  <div className="panelDivider" />

                  {/* Monitoring data grid */}
                  <div className="panelGrid">
                    <div className="panelGridItem">
                      <span className="panelLabel">Temperature</span>
                      <span className="panelValue" style={{ color: followedTruck.temperature > 7 ? "#ef4444" : "#22c55e" }}>
                        {followedTruck.temperature}°C
                      </span>
                    </div>
                    <div className="panelGridItem">
                      <span className="panelLabel">Engine Hours</span>
                      <span className="panelValue">{followedTruck.engineHours.toLocaleString()} h</span>
                    </div>
                    <div className="panelGridItem">
                      <span className="panelLabel">Odometer</span>
                      <span className="panelValue">{followedTruck.odometer.toLocaleString()} km</span>
                    </div>
                    <div className="panelGridItem">
                      <span className="panelLabel">Avg Consumption</span>
                      <span className="panelValue">{followedTruck.fuelConsumption} L/100km</span>
                    </div>
                  </div>
                </>
              )}

              {/* ALERTS TAB */}
              {activeTab === "alerts" && (
                <>
                  <div className="panelSection">
                    <span className="panelLabel">Recent Alerts for {followedTruck.name}</span>
                  </div>
                  <div className="truckAlertsList">
                    {truckAlerts.map((alert, i) => (
                      <div key={i} className={`truckAlertItem alert-${alert.type}`}>
                        <span className="truckAlertDot">
                          {alert.type === "danger" ? "•" : alert.type === "warning" ? "•" : alert.type === "success" ? "•" : "•"}
                        </span>
                        <div className="truckAlertContent">
                          <span className="truckAlertText">{alert.text}</span>
                          <span className="truckAlertTime">{alert.time} ago</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Truck list (when not following) */}
      {routeLoaded && !isFollowing && (
        <div className="truckList">
          <h4 className="truckListTitle">FLEET ({TRUCKS.length})</h4>
          {TRUCKS.map((truck) => (
            <button
              key={truck.id}
              className="truckListItem"
              onClick={() => enterFollowModeRef.current(truck.id)}
            >
              <div className="truckDot" style={{ background: truck.color }} />
              <div className="truckItemInfo">
                <div className="truckItemNameRow">
                  <span className="truckItemName">{truck.name}</span>
                  <span className="truckItemStatusDot" style={{ background: STATUS_CONFIGS[truck.status].color }}>
                    {STATUS_CONFIGS[truck.status].icon}
                  </span>
                </div>
                <span className="truckItemRoute">{truck.routeLabel}</span>
                <span className="truckItemDriver">{truck.driver}</span>
              </div>
              <div className="truckItemRight">
                <div className="truckItemFuel">
                  <div className="fuelBarSmall">
                    <div
                      className="fuelFill"
                      style={{
                        width: `${truck.fuelPercent}%`,
                        background: truck.fuelPercent < 40
                          ? "#ef4444"
                          : truck.color,
                      }}
                    />
                  </div>
                  <span className="fuelText">{truck.fuelPercent}%</span>
                </div>
                {truck.lastAlert && (
                  <span className="truckAlertTag">{truck.lastAlert}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="mapControls">
        {routeLoaded && (
          <button
            className="controlBtn playPauseBtn"
            onClick={() => setIsPlaying((p) => !p)}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        )}
      </div>

      <div className={`mapLoading ${isLoaded ? "loaded" : ""}`}>
        <div className="loadingContent">
          <div className="loadingSpinner" />
          <span className="loadingText">Loading Cartrack Fleet...</span>
        </div>
      </div>
    </div>
  );
}
