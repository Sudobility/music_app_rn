/**
 * SPIKE: music_spatial_rn's `SpatialCanvas`, drawn by three.js's
 * WebGPURenderer on react-native-webgpu (Dawn on Metal) instead of a CPU
 * projection into Skia. Same props, same picture, so `SpatialView` — the map
 * overlay, drag-to-walk, the arrow keys, Wander, facing-track follow — runs
 * over it unchanged; Metro swaps it in for the library's own on macOS
 * (`metro.config.js`).
 *
 * Kept from the Skia canvas, deliberately:
 * - **The camera.** A 70° *vertical* field of view, near 0.05, from
 *   `buildScene`'s camera — exactly `project.ts`'s projector, so resizing
 *   the window changes how much of the stage is in view, never how big an
 *   instrument is drawn.
 * - **The stage.** The 40 m grid with its centre lines, the default
 *   half-circle ring, and the fog from `FOG_NEAR` to `FOG_FAR`, in
 *   `STAGE_PALETTE`'s colours.
 * - **When it draws.** On a prop or size change only, never on a frame
 *   loop, so an idle stage costs nothing.
 * - **`onSize`**, which the stage drag measures pixels against.
 *
 * One known difference: a GPU line is one pixel wide, so a sounding
 * instrument is told apart by its lit colour alone, not also by the Skia
 * canvas's thicker stroke.
 */
import { useEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { Canvas, useCanvasRef, useDevice } from 'react-native-webgpu';
import type { RNCanvasContext } from 'react-native-webgpu';
import * as THREE from 'three/webgpu';
import {
  buildScene,
  DEFAULT_FOV_DEG,
  FOG_FAR,
  FOG_NEAR,
  STAGE_PALETTE,
  UNPLUGGED_RADIUS,
} from '@sudobility/music_spatial_core';
import type { Score } from '@sudobility/music_types';

export interface SpatialCanvasProps {
  readonly score: Pick<Score, 'tracks' | 'unplugged'>;
  readonly soundingTrackIds: ReadonlySet<string>;
  readonly background?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly onSize?: (width: number, height: number) => void;
}

/** `project.ts`'s near plane, so clipping matches too. */
const NEAR_PLANE = 0.05;
const RING_SEGMENTS = 48;
const RING_Y = 0.005;

type Stage = {
  renderer: THREE.WebGPURenderer;
  context: RNCanvasContext;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  instruments: THREE.Group;
};

function buildStage(background: string): Omit<Stage, 'renderer' | 'context'> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.fog = new THREE.Fog(background, FOG_NEAR, FOG_FAR);

  scene.add(
    new THREE.GridHelper(
      40,
      40,
      STAGE_PALETTE.gridMajor,
      STAGE_PALETTE.gridMinor,
    ),
  );

  const ring: THREE.Vector3[] = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const angle = (Math.PI * i) / RING_SEGMENTS;
    ring.push(
      new THREE.Vector3(
        Math.cos(angle) * UNPLUGGED_RADIUS,
        RING_Y,
        Math.sin(angle) * UNPLUGGED_RADIUS,
      ),
    );
  }
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ring),
      new THREE.LineBasicMaterial({ color: STAGE_PALETTE.ring }),
    ),
  );

  const instruments = new THREE.Group();
  scene.add(instruments);
  const camera = new THREE.PerspectiveCamera(
    DEFAULT_FOV_DEG,
    1,
    NEAR_PLANE,
    100,
  );
  return { scene, camera, instruments };
}

export function SpatialCanvas({
  score,
  soundingTrackIds,
  background = STAGE_PALETTE.background,
  style,
  onSize,
}: SpatialCanvasProps) {
  const ref = useCanvasRef();
  const { device } = useDevice();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef<Stage | null>(null);
  const [ready, setReady] = useState(false);

  const draw = () => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.renderer.render(stage.scene, stage.camera);
    stage.context.present();
  };

  // The renderer, once per device.
  useEffect(() => {
    if (!device) return;
    const context = ref.current?.getContext('webgpu');
    if (!context) return;
    const renderer = new THREE.WebGPURenderer({
      antialias: true,
      // react-native-webgpu's canvas and context stand in for the DOM's.
      canvas: context.canvas as unknown as HTMLCanvasElement,
      context: context as unknown as GPUCanvasContext,
      device,
    });
    let disposed = false;
    void renderer.init().then(() => {
      if (disposed) return;
      stageRef.current = { renderer, context, ...buildStage(background) };
      setReady(true);
    });
    return () => {
      disposed = true;
      stageRef.current = null;
      setReady(false);
      renderer.dispose();
    };
    // `background` is applied by the scene effect below.
  }, [device, ref]);

  // The viewport: the same vertical field of view at any size.
  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage || size.width === 0 || size.height === 0) return;
    stage.renderer.setPixelRatio(PixelRatio.get());
    stage.renderer.setSize(size.width, size.height, false);
    stage.camera.aspect = size.width / size.height;
    stage.camera.updateProjectionMatrix();
    draw();
  }, [ready, size]);

  // The instruments and the listener's camera, from the same `buildScene`.
  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    const built = buildScene(score, soundingTrackIds);
    for (const child of stage.instruments.children) {
      ((child as THREE.LineSegments).material as THREE.Material).dispose();
    }
    stage.instruments.clear();
    for (const instrument of built.instruments) {
      const line = new THREE.LineSegments(
        instrument.geometry,
        new THREE.LineBasicMaterial({
          color: instrument.lit ? instrument.litColor : instrument.color,
        }),
      );
      line.position.set(...instrument.position);
      line.rotation.set(...instrument.rotation);
      line.scale.setScalar(instrument.scale);
      stage.instruments.add(line);
    }
    stage.camera.position.set(...built.camera.position);
    stage.camera.rotation.set(...built.camera.rotation);
    const color = new THREE.Color(background);
    stage.scene.background = color;
    (stage.scene.fog as THREE.Fog).color = color;
    if (size.width > 0 && size.height > 0) draw();
  }, [ready, score, soundingTrackIds, background, size]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(prev =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
    onSize?.(width, height);
  };

  return (
    <View
      style={[styles.root, { backgroundColor: background }, style]}
      onLayout={onLayout}
    >
      <Canvas ref={ref} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
