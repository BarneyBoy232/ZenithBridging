/**
 * Editing the curved path directly in the 3D view.
 *
 * Click empty space to drop a new point in, drag a point to bend the path
 * through it. Dragging moves a point across the flat plane it currently sits
 * on; holding shift moves it straight up and down instead. That split is
 * deliberate — a single drag cannot cover three directions at once, and
 * "along the ground, or up" is how people think about a bridge.
 *
 * Positions here are relative to the same origin the blocks use, so the
 * handles land exactly on the deck rather than drifting from it.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** How big a handle is, in blocks. */
const HANDLE_RADIUS = 1.6;

export default function SplineHandles3D({ points, origin, onPointsChange, adding }) {
  const { camera, gl, controls } = useThree();
  const [dragging, setDragging] = useState(null);
  const [hovered, setHovered] = useState(null);
  const planeRef = useRef(new THREE.Plane());
  const hitRef = useRef(new THREE.Vector3());
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);

  const toLocal = useCallback(
    (p) => [p.x - origin.x + 0.5, p.y - origin.y + 0.5, p.z - origin.z + 0.5],
    [origin]
  );

  /** Where the pointer meets the drag plane, back in world coordinates. */
  const intersect = useCallback(
    (event) => {
      const rect = gl.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(planeRef.current, hitRef.current)) return null;
      return {
        x: Math.round(hitRef.current.x + origin.x - 0.5),
        y: Math.round(hitRef.current.y + origin.y - 0.5),
        z: Math.round(hitRef.current.z + origin.z - 0.5),
      };
    },
    [camera, gl, origin, pointer, raycaster]
  );

  /**
   * Set the plane a drag runs across. Flat by default, upright and facing the
   * camera when shift is held, so up-and-down dragging works from any angle.
   */
  const armPlane = useCallback(
    (anchorLocal, vertical) => {
      const at = new THREE.Vector3(...anchorLocal);
      if (vertical) {
        const facing = camera.getWorldDirection(new THREE.Vector3());
        facing.y = 0;
        if (facing.lengthSq() < 1e-6) facing.set(0, 0, 1);
        planeRef.current.setFromNormalAndCoplanarPoint(facing.normalize(), at);
      } else {
        planeRef.current.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), at);
      }
    },
    [camera]
  );

  const beginDrag = (index, event) => {
    event.stopPropagation();
    armPlane(toLocal(points[index]), event.shiftKey);
    setDragging({ index, vertical: event.shiftKey });
    if (controls) controls.enabled = false;
    event.target.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    if (!dragging) return;
    event.stopPropagation();
    const hit = intersect(event);
    if (!hit) return;
    const current = points[dragging.index];
    const next = points.slice();
    // A flat drag leaves the height alone; an upright one leaves the ground
    // position alone. Either way two of the three numbers stay put.
    next[dragging.index] = dragging.vertical
      ? { ...current, y: hit.y }
      : { ...current, x: hit.x, z: hit.z };
    onPointsChange(next);
  };

  const endDrag = () => {
    if (!dragging) return;
    setDragging(null);
    if (controls) controls.enabled = true;
  };

  /**
   * Drop a new point wherever the click landed, into whichever stretch of the
   * path it sits nearest. Inserting into the nearest stretch is what makes the
   * path bend through the new point instead of doubling back to reach it.
   */
  const addPoint = (event) => {
    if (!adding || dragging) return;
    const mid = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    armPlane(toLocal({ x: points[0].x, y: mid, z: points[0].z }), false);
    const hit = intersect(event);
    if (!hit) return;

    let best = 1;
    let bestDistance = Infinity;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const along = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const lengthSq = along.x ** 2 + along.y ** 2 + along.z ** 2 || 1;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((hit.x - a.x) * along.x + (hit.y - a.y) * along.y + (hit.z - a.z) * along.z) / lengthSq
        )
      );
      const distance = Math.hypot(
        hit.x - (a.x + along.x * t),
        hit.y - (a.y + along.y * t),
        hit.z - (a.z + along.z * t)
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }

    const next = points.slice();
    next.splice(best, 0, hit);
    onPointsChange(next);
  };

  return (
    <>
      {/* A big invisible sheet to catch clicks in empty space. It sits at the
          path's own height rather than at zero, so a camera looking slightly
          upward still meets it and clicks land where you expect. */}
      {adding && (
        <mesh
          onPointerDown={addPoint}
          position={[0, points.reduce((sum, p) => sum + p.y, 0) / points.length - origin.y, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[100000, 100000]} />
          <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
        </mesh>
      )}

      {points.map((point, index) => {
        const held = dragging?.index === index;
        const lit = held || hovered === index;
        const isEnd = index === 0 || index === points.length - 1;
        return (
          <mesh
            key={index}
            position={toLocal(point)}
            onPointerDown={(e) => beginDrag(index, e)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerOut={() => setHovered((h) => (h === index ? null : h))}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(index);
            }}
          >
            <sphereGeometry args={[HANDLE_RADIUS * (lit ? 1.25 : 1), 20, 14]} />
            <meshBasicMaterial
              color={held ? '#ffffff' : lit ? '#8cc6ff' : isEnd ? '#e6edf3' : '#5ea9ff'}
              transparent
              opacity={0.95}
            />
          </mesh>
        );
      })}
    </>
  );
}
