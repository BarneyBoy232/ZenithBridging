/**
 * The bridge in three dimensions.
 *
 * Blocks are drawn as instanced boxes — one draw call per block shape, however
 * many blocks there are. Drawing them individually would fall over long before
 * a real bridge does.
 *
 * The white line running between the two ends is the straight route you would
 * get with no sag at all, so you can see at a glance exactly how far the deck
 * hangs below it, or arches above it.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { buildInstances } from '../engine/instances.js';

function Boxes({ items, size }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || !items.length) return;

    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    items.forEach((item, i) => {
      matrix.makeTranslation(item.x, item.y, item.z);
      mesh.setMatrixAt(i, matrix);
      colour.set(item.colour);
      mesh.setColorAt(i, colour);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);

  if (!items.length) return null;

  return (
    // The instance count is fixed when the mesh is created, so a change in the
    // number of blocks has to build a fresh one.
    <instancedMesh key={items.length} ref={ref} args={[undefined, undefined, items.length]}>
      <boxGeometry args={size} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

/** The straight no-sag route, as a plain line. */
function Chord({ points }) {
  const object = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(...p))
    );
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
    });
    return new THREE.Line(geometry, material);
  }, [points]);

  useEffect(() => {
    return () => {
      object.geometry.dispose();
      object.material.dispose();
    };
  }, [object]);

  return <primitive object={object} />;
}

/**
 * Points the camera at the bridge and pulls back far enough to see all of it.
 *
 * This waits for the orbit controls to exist before framing. Setting up the
 * camera first and the controls second means the controls would immediately
 * swing the view back to the world origin, and the bridge would vanish off
 * screen — which looks exactly like nothing having rendered at all.
 */
function FrameBridge({ bounds, frameKey }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const size = useThree((s) => s.size);
  const lastKey = useRef(null);

  useEffect(() => {
    if (!controls || !size.width) return;

    // Only re-aim the camera when the bridge genuinely moves — new endpoints,
    // a new width. Changing the curve, the sag or the block options must leave
    // the view exactly where it was dragged to, because that is the whole
    // point of adjusting them: you are watching one spot while you do it.
    if (lastKey.current === frameKey) return;
    lastKey.current = frameKey;

    const centre = new THREE.Vector3(
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      (bounds.minZ + bounds.maxZ) / 2
    );

    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    const spanZ = bounds.maxZ - bounds.minZ;
    const radius = Math.max(Math.hypot(spanX, spanZ), spanY, 4) / 2 + 3;

    // Pull back far enough that the bridge fits both the height and the width
    // of the window, whichever is the tighter squeeze.
    const halfFov = (camera.fov * Math.PI) / 360;
    const fitVertically = radius / Math.tan(halfFov);
    const fitHorizontally = radius / Math.tan(halfFov) / Math.max(0.2, camera.aspect);
    const distance = Math.max(fitVertically, fitHorizontally) * 1.1;

    // Off to one side and above: the angle that shows the sag most clearly.
    const direction = new THREE.Vector3(0.5, 0.45, 0.74).normalize();
    camera.position.copy(centre).addScaledVector(direction, distance);
    camera.near = Math.max(0.05, distance / 5000);
    camera.far = distance * 20;
    camera.updateProjectionMatrix();

    controls.target.copy(centre);
    controls.update();
  }, [bounds, frameKey, camera, controls, size.width, size.height]);

  return null;
}

function Scene({ instances, frameKey }) {
  const { full, slab, stepX, stepZ, bounds, chord } = instances;

  return (
    <>
      <color attach="background" args={['#0a0d12']} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[60, 100, 40]} intensity={2.2} />
      <directionalLight position={[-50, 30, -60]} intensity={0.9} />

      <Boxes items={full} size={[1, 1, 1]} />
      <Boxes items={slab} size={[1, 0.5, 1]} />
      <Boxes items={stepX} size={[0.5, 0.5, 1]} />
      <Boxes items={stepZ} size={[1, 0.5, 0.5]} />

      {chord && <Chord points={chord} />}

      <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
      <FrameBridge bounds={bounds} frameKey={frameKey} />
    </>
  );
}

export default function Preview3D({ model, highlight = null }) {
  const wrapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [stalled, setStalled] = useState(false);
  const instances = useMemo(() => buildInstances(model, undefined, highlight), [model, highlight]);

  // What counts as "a different build" for the purpose of re-aiming the
  // camera: where it runs and how wide it is. Not how it curves.
  const frameKey =
    model.kind === 'bridge'
      ? `${JSON.stringify(model.params.start)}|${JSON.stringify(model.params.end)}|${model.width}`
      : `${model.params.points.map((p) => `${p.x},${p.y},${p.z}`).join(';')}|${model.stats.width}`;

  // The 3D canvas only starts up once its container has a real size. If the
  // tab is in the background when this mounts, that can take a moment — so we
  // wait for a measurable size rather than mounting into nothing.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const check = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setReady(true);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const onVisible = () => check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('resize', onVisible);
    return () => {
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('resize', onVisible);
    };
  }, []);

  // A 3D view that quietly shows nothing is worse than one that says why.
  // If the graphics context has not started shortly after mounting, say so.
  useEffect(() => {
    if (started) return undefined;
    const timer = setTimeout(() => setStalled(true), 4000);
    return () => clearTimeout(timer);
  }, [started]);

  const skipped = instances.stride;

  return (
    <div className="preview-3d" ref={wrapRef}>
      {ready && (
        <Canvas
          camera={{ fov: 45, near: 0.1, far: 20000, position: [30, 30, 30] }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          dpr={[1, 2]}
          onCreated={() => setStarted(true)}
        >
          <Scene instances={instances} frameKey={frameKey} />
        </Canvas>
      )}

      {stalled && !started && (
        <div className="empty-state">
          <h2>The 3D view could not start</h2>
          <p>
            Your browser did not give the page a 3D graphics context. This usually means hardware
            acceleration is switched off, or the tab was in the background when it loaded. Switch to
            this tab and reload, or use the Plan view — it shows the same bridge, block for block.
          </p>
        </div>
      )}

      <div className="plan-readout visible">
        <span>Drag to orbit · scroll to zoom · right-drag to pan</span>
        <span>The white line is the straight route, with no sag.</span>
      </div>

      {skipped > 1 && (
        <div className="plan-overlay">
          <span className="scale-readout">
            Too many blocks to draw at once — showing every {skipped}
            {skipped === 2 ? 'nd' : skipped === 3 ? 'rd' : 'th'} row. The plan view and every export
            still cover all of them.
          </span>
        </div>
      )}
    </div>
  );
}
