import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Map as MaplibreMap, CustomLayerInterface } from "maplibre-gl";
import maplibregl from "maplibre-gl";

export interface ModelTransform {
  translateX: number;
  translateY: number;
  translateZ: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  scale: number;
}

/**
 * Convert lng/lat to Mercator coordinates used by MapLibre
 */
function lngLatToMercator(lng: number, lat: number): [number, number] {
  const mercatorCoord = maplibregl.MercatorCoordinate.fromLngLat(
    [lng, lat],
    0
  );
  return [mercatorCoord.x, mercatorCoord.y];
}

/**
 * Creates a MapLibre custom layer that renders a GLB model using Three.js
 */
export function createModelLayer(
  layerId: string,
  modelUrl: string,
  initialLng: number,
  initialLat: number,
  modelScale: number = 1
): {
  layer: CustomLayerInterface;
  setPosition: (lng: number, lat: number) => void;
  setBearing: (bearing: number) => void;
  getModel: () => THREE.Group | null;
} {
  let camera: THREE.Camera;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let model: THREE.Group | null = null;
  let mapRef: MaplibreMap;

  // Current state
  let currentLng = initialLng;
  let currentLat = initialLat;
  let currentBearing = 0;

  const setPosition = (lng: number, lat: number) => {
    currentLng = lng;
    currentLat = lat;
  };

  const setBearing = (bearing: number) => {
    currentBearing = bearing;
  };

  const getModel = () => model;

  const layer: CustomLayerInterface = {
    id: layerId,
    type: "custom",
    renderingMode: "3d",

    onAdd(map: MaplibreMap, gl: WebGLRenderingContext) {
      mapRef = map;

      // Three.js setup
      camera = new THREE.Camera();
      scene = new THREE.Scene();

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
      scene.add(ambientLight);

      const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
      directionalLight1.position.set(0, 70, 100).normalize();
      scene.add(directionalLight1);

      const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
      directionalLight2.position.set(0, -70, 100).normalize();
      scene.add(directionalLight2);

      // Load GLB model
      const loader = new GLTFLoader();
      loader.load(modelUrl, (gltf) => {
        model = gltf.scene;
        scene.add(model);
      });

      // Reuse MapLibre's WebGL context
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGL2RenderingContext,
        antialias: true,
      });
      renderer.autoClear = false;
    },

    render(_gl: WebGLRenderingContext, args: unknown) {
      if (!model) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projectionMatrix = (args as any).defaultProjectionData.mainMatrix;
      const mercatorCoord = maplibregl.MercatorCoordinate.fromLngLat(
        [currentLng, currentLat],
        0
      );

      // Scale factor: meters per mercator unit at this latitude
      const meterScale = mercatorCoord.meterInMercatorCoordinateUnits();

      // Build the model's transformation matrix
      const modelMatrix = new THREE.Matrix4();

      // 1. Translate to mercator position
      modelMatrix.makeTranslation(mercatorCoord.x, mercatorCoord.y, 0);

      // 2. Scale: convert model units (meters) to mercator units
      const s = meterScale * modelScale;
      const scaleMatrix = new THREE.Matrix4().makeScale(s, -s, s);
      modelMatrix.multiply(scaleMatrix);

      // 3. Rotate model to lay flat (GLB is Y-up, map is Z-up)
      const rotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
      modelMatrix.multiply(rotX);

      // 4. Rotate for bearing (around Y axis in model space, since we rotated X)
      const bearingRad = ((-currentBearing + 180) * Math.PI) / 180;
      const rotationMatrix = new THREE.Matrix4().makeRotationY(bearingRad);
      modelMatrix.multiply(rotationMatrix);

      // Get MapLibre's projection matrix
      const projMatrix = new THREE.Matrix4().fromArray(
        projectionMatrix
      );

      // Combine: projection * model
      camera.projectionMatrix = projMatrix.multiply(modelMatrix);

      renderer.resetState();
      renderer.render(scene, camera);

      mapRef.triggerRepaint();
    },
  };

  return { layer, setPosition, setBearing, getModel };
}
