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

// ─── Truck fleet data ───────────────────────────────────────────
interface TruckInfo {
  id: string;
  name: string;
  driver: string;
  plate: string;
  fuelPercent: number;
  speed: number;
  routeLabel: string;
  start: [number, number];
  end: [number, number];
  color: string;
  startOffset: number; // 0-1, stagger start positions
}

const TRUCKS: TruckInfo[] = [
  {
    id: "truck-1",
    name: "Dump Truck #01",
    driver: "Ahmad Suryadi",
    plate: "D 1234 ABC",
    fuelPercent: 68,
    speed: 42,
    routeLabel: "Gedung Sate → Alun-Alun",
    start: [107.6186, -6.9025],
    end: [107.6098, -6.9218],
    color: "#6366f1",
    startOffset: 0,
  },
  {
    id: "truck-2",
    name: "Dump Truck #02",
    driver: "Budi Santoso",
    plate: "D 5678 DEF",
    fuelPercent: 45,
    speed: 38,
    routeLabel: "Pasteur → Dago",
    start: [107.5940, -6.8930],
    end: [107.6170, -6.8850],
    color: "#10b981",
    startOffset: 0.2,
  },
  {
    id: "truck-3",
    name: "Dump Truck #03",
    driver: "Cahya Pratama",
    plate: "D 9012 GHI",
    fuelPercent: 82,
    speed: 35,
    routeLabel: "Cihampelas → Setiabudi",
    start: [107.6030, -6.8940],
    end: [107.6170, -6.8730],
    color: "#f59e0b",
    startOffset: 0.4,
  },
  {
    id: "truck-4",
    name: "Dump Truck #04",
    driver: "Deni Firmansyah",
    plate: "D 3456 JKL",
    fuelPercent: 31,
    speed: 40,
    routeLabel: "Buah Batu → Kopo",
    start: [107.6340, -6.9400],
    end: [107.5890, -6.9370],
    color: "#ef4444",
    startOffset: 0.6,
  },
  {
    id: "truck-5",
    name: "Dump Truck #05",
    driver: "Eko Wibowo",
    plate: "D 7890 MNO",
    fuelPercent: 55,
    speed: 44,
    routeLabel: "Bandung Station → Braga",
    start: [107.6030, -6.9125],
    end: [107.6095, -6.9190],
    color: "#8b5cf6",
    startOffset: 0.8,
  },
];

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

      const { position, bearing } = interpolateRoute(rt.route, rt.progress);
      rt.setPosition(position.lng, position.lat);
      rt.setBearing(bearing);

      // Track the followed truck
      if (followTruckIdRef.current === truck.id) {
        followPos = position;
        followBearing = bearing;
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

      // Load all truck routes in parallel
      const routePromises = TRUCKS.map(async (truck) => {
        const route = await fetchRoute(truck.start, truck.end);
        return { truck, route };
      });

      Promise.all(routePromises)
        .then((results) => {
          for (const { truck, route } of results) {
            // Add route line
            map.addSource(`route-${truck.id}`, {
              type: "geojson",
              data: routeToGeoJSON(route) as GeoJSON.Feature,
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

            // Start/End markers
            new maplibregl.Marker({ color: "#22c55e", scale: 0.7 })
              .setLngLat(truck.start)
              .setPopup(new maplibregl.Popup().setHTML(
                `<strong>${truck.name}</strong><br/>Start`
              ))
              .addTo(map);

            new maplibregl.Marker({ color: "#ef4444", scale: 0.7 })
              .setLngLat(truck.end)
              .setPopup(new maplibregl.Popup().setHTML(
                `<strong>${truck.name}</strong><br/>End`
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

  return (
    <div className="mapWrapper">
      <div ref={mapContainer} className="mapContainer" />

      {isFollowing && followedTruck && (
        <div className="followBadge" style={{ background: `${followedTruck.color}dd` }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
          </svg>
          <span>{followedTruck.name}</span>
          <button className="followExitBtn" onClick={() => setIsFollowing(false)}>✕</button>
        </div>
      )}

      {/* Side panel in follow mode */}
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
              <h3>🚛 {followedTruck.name}</h3>
            </div>
            <div className="panelBody">
              <div className="panelSection">
                <span className="panelLabel">Route</span>
                <span className="panelValue">{followedTruck.routeLabel}</span>
              </div>
              <div className="panelSection">
                <span className="panelLabel">Status</span>
                <span className="panelValue statusActive">● In Transit</span>
              </div>
              <div className="panelDivider" />
              <div className="panelSection">
                <span className="panelLabel">Speed</span>
                <span className="panelValue">{followedTruck.speed} km/h</span>
              </div>
              <div className="panelSection">
                <span className="panelLabel">Fuel Level</span>
                <div className="fuelBar">
                  <div
                    className="fuelFill"
                    style={{
                      width: `${followedTruck.fuelPercent}%`,
                      background: followedTruck.fuelPercent < 40
                        ? "linear-gradient(90deg, #ef4444, #f97316)"
                        : "linear-gradient(90deg, #6366f1, #8b5cf6)",
                    }}
                  />
                </div>
                <span className="panelValue">{followedTruck.fuelPercent}%</span>
              </div>
              <div className="panelDivider" />
              <div className="panelSection">
                <span className="panelLabel">Driver</span>
                <span className="panelValue">{followedTruck.driver}</span>
              </div>
              <div className="panelSection">
                <span className="panelLabel">License Plate</span>
                <span className="panelValue">{followedTruck.plate}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Truck list (when not following) */}
      {routeLoaded && !isFollowing && (
        <div className="truckList">
          <h4 className="truckListTitle">🚛 Fleet ({TRUCKS.length})</h4>
          {TRUCKS.map((truck) => (
            <button
              key={truck.id}
              className="truckListItem"
              onClick={() => enterFollowModeRef.current(truck.id)}
            >
              <div className="truckDot" style={{ background: truck.color }} />
              <div className="truckItemInfo">
                <span className="truckItemName">{truck.name}</span>
                <span className="truckItemRoute">{truck.routeLabel}</span>
              </div>
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
          <span className="loadingText">Loading map...</span>
        </div>
      </div>
    </div>
  );
}
