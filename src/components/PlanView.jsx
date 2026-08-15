/**
 * The flat views — the output that works in every edition and every version,
 * because you just read it and copy it.
 *
 * Three of them, one down each axis:
 *   top    looking straight down. Shows the footprint and the diagonal.
 *   front  looking along Z. Shows the height profile.
 *   side   looking along X. Same, from the other side.
 *
 * For the curved tool these double as the sketch plane: control points are
 * draggable handles, and which two coordinates you are editing depends on
 * which view you are in — exactly like a sketch in CAD.
 *
 * Drawn on a canvas rather than as page elements: a long bridge is tens of
 * thousands of squares, and the browser will not lay that out as HTML without
 * grinding to a halt.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { levelColour } from './colour.js';

export const PLANES = {
  top: { id: 'top', label: 'Top', across: 'X', down: 'Z' },
  front: { id: 'front', label: 'Front', across: 'X', down: 'Y' },
  side: { id: 'side', label: 'Side', across: 'Z', down: 'Y' },
};

/**
 * Which two coordinates each view shows, and which way up.
 * Screens count downward and worlds count upward, hence the flipped sign on Y.
 */
const AXES = {
  top: { h: 'x', v: 'z', vSign: 1 },
  front: { h: 'x', v: 'y', vSign: -1 },
  side: { h: 'z', v: 'y', vSign: -1 },
};

/** Beyond this many blocks the flat views start skipping blocks. */
const CELL_BUDGET = 200000;

/** What everything fades to when one material is picked out. */
const MUTED = 'hsl(215, 12%, 26%)';

/** How close the pointer has to be to grab a control point, in pixels. */
const GRAB_RADIUS = 11;

/**
 * Flatten the build onto one plane.
 *
 * Where several blocks land on the same spot on screen, only the one nearest
 * the viewer is kept — looking down at a bridge you see its deck, not the
 * packing underneath it.
 */
function project(model, plane, highlight) {
  const stride = Math.max(1, Math.ceil(model.stats.blockCount / CELL_BUDGET));
  const cells = new Map();
  const { minY, maxY } = model.stats;
  const axes = AXES[plane];

  let minH = Infinity;
  let maxH = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  model.eachBlock(stride, (block) => {
    const h = block[axes.h];
    const v = axes.vSign * block[axes.v];
    // Whichever axis we are looking along decides what counts as nearer.
    const nearness =
      plane === 'top' ? block.y : plane === 'front' ? -block.z : block.x;

    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;

    const key = `${h},${v}`;
    const existing = cells.get(key);
    if (!existing || nearness > existing.nearness) {
      cells.set(key, {
        h,
        v,
        nearness,
        colour:
          highlight && block.kind !== highlight ? MUTED : levelColour(block.y, minY, maxY),
        dimmed: !!highlight && block.kind !== highlight,
        kind: block.kind,
        half: block.half,
        facing: block.facing,
        y: block.y,
        x: block.x,
        z: block.z,
      });
    }
  });

  return { cells, stride, minH, maxH, minV, maxV, w: maxH - minH + 1, h: maxV - minV + 1 };
}

export default function PlanView({
  model,
  plane = 'top',
  highlight = null,
  points = null,
  onPointsChange = null,
  box = null,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState(null); // { scale, x, y } in screen pixels
  const [hover, setHover] = useState(null);
  const [grabbed, setGrabbed] = useState(null);
  const dragRef = useRef(null);

  const axes = AXES[plane];
  const projection = useMemo(() => project(model, plane, highlight), [model, plane, highlight]);
  const editable = !!points && !!onPointsChange;

  const fit = useCallback(() => {
    const scale = Math.min(size.w / projection.w, size.h / projection.h) * 0.9;
    setView({
      scale,
      x: (size.w - projection.w * scale) / 2,
      y: (size.h - projection.h * scale) / 2,
    });
  }, [size, projection]);

  // Track the size of the area we have to draw into. Measured directly on
  // mount as well as watched, because a tab that starts out hidden may not
  // deliver a resize callback until it is shown.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const measure = (width, height) => {
      if (width < 1 || height < 1) return;
      setSize((s) => {
        const w = Math.round(width);
        const h = Math.round(height);
        return s.w === w && s.h === h ? s : { w, h };
      });
    };

    const rect = el.getBoundingClientRect();
    measure(rect.width, rect.height);
    const ro = new ResizeObserver(([entry]) =>
      measure(entry.contentRect.width, entry.contentRect.height)
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit only when the build changes shape or the view axis changes.
  // Changing the sag or the block options must NOT throw away the pan and
  // zoom you set up — you are usually adjusting those to watch one spot.
  const fitKey = `${plane}|${projection.w}x${projection.h}`;
  const lastFitKey = useRef(null);
  useEffect(() => {
    if (lastFitKey.current === fitKey && view) return;
    lastFitKey.current = fitKey;
    fit();
  }, [fitKey, fit, view]);

  /** World position of a point, in this plane's two screen axes. */
  const toScreen = useCallback(
    (p) => {
      if (!view) return null;
      const h = p[axes.h];
      const v = axes.vSign * p[axes.v];
      return {
        x: view.x + (h - projection.minH + 0.5) * view.scale,
        y: view.y + (v - projection.minV + 0.5) * view.scale,
      };
    },
    [view, axes, projection]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !view) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const { scale, x: ox, y: oy } = view;
    const { minH, minV } = projection;
    const px = (h) => ox + (h - minH) * scale;
    const py = (v) => oy + (v - minV) * scale;

    // The box the curved path has to stay inside.
    if (box) {
      const bx1 = px(box.min[axes.h]);
      const bx2 = px(box.max[axes.h] + 1);
      const by1 = py(axes.vSign > 0 ? box.min[axes.v] : -box.max[axes.v]);
      const by2 = py((axes.vSign > 0 ? box.max[axes.v] : -box.min[axes.v]) + 1);
      ctx.strokeStyle = 'rgba(94,169,255,0.4)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);
      ctx.setLineDash([]);
    }

    // Chunk boundaries, genuinely useful when lining a build up in game.
    if (scale >= 3) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      const firstH = Math.ceil(minH / 16) * 16;
      for (let h = firstH; h <= projection.maxH + 1; h += 16) {
        ctx.beginPath();
        ctx.moveTo(px(h), 0);
        ctx.lineTo(px(h), size.h);
        ctx.stroke();
      }
      if (plane === 'top') {
        const firstV = Math.ceil(minV / 16) * 16;
        for (let v = firstV; v <= projection.maxV + 1; v += 16) {
          ctx.beginPath();
          ctx.moveTo(0, py(v));
          ctx.lineTo(size.w, py(v));
          ctx.stroke();
        }
      }
    }

    const inset = scale >= 5 ? 0.5 : 0;
    const cell = Math.max(1, scale - inset * 2);
    const decorate = scale >= 7;

    for (const c of projection.cells.values()) {
      const sx = px(c.h) + inset;
      const sy = py(c.v) + inset;
      if (sx > size.w || sy > size.h || sx + cell < 0 || sy + cell < 0) continue;

      ctx.fillStyle = c.colour;
      ctx.fillRect(sx, sy, cell, cell);

      if (!decorate || c.dimmed) continue;

      if (c.kind === 'slab') {
        // Marked on the half the slab actually fills, so the drawing tells
        // you which way up to place it.
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(sx, c.half === 'top' ? sy : sy + cell / 2, cell, cell / 2);
      } else if (c.kind === 'stair') {
        const cx = sx + cell / 2;
        const cy = sy + cell / 2;
        const r = cell * 0.3;
        const angle = { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2 }[c.facing];
        if (angle !== undefined) {
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
          ctx.lineTo(cx + Math.cos(angle + 2.4) * r, cy + Math.sin(angle + 2.4) * r);
          ctx.lineTo(cx + Math.cos(angle - 2.4) * r, cy + Math.sin(angle - 2.4) * r);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // The smooth curve itself, over the top of the blocks it produced.
    if (model.samples?.length) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      model.samples.forEach((s, i) => {
        const sx = px(s[axes.h] + 0.5);
        const sy = py(axes.vSign * s[axes.v] + 0.5);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }

    // Control point handles.
    if (editable) {
      points.forEach((p, i) => {
        const at = toScreen(p);
        if (!at) return;
        const isEnd = i === 0 || i === points.length - 1;
        const held = grabbed === i;
        ctx.beginPath();
        ctx.arc(at.x, at.y, held ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = held ? '#5ea9ff' : isEnd ? '#e6edf3' : '#1c232c';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = held ? '#ffffff' : '#5ea9ff';
        ctx.stroke();
      });
    }
  }, [projection, view, size, plane, box, axes, model, editable, points, grabbed, toScreen]);

  /** Which control point, if any, is under this pixel. */
  const pointAt = (clientX, clientY) => {
    if (!editable || !view) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    for (let i = points.length - 1; i >= 0; i--) {
      const at = toScreen(points[i]);
      if (at && Math.hypot(at.x - mx, at.y - my) <= GRAB_RADIUS) return i;
    }
    return null;
  };

  const onPointerMove = (e) => {
    if (!view) return;
    const drag = dragRef.current;

    // Moving a control point: the two coordinates you are editing are the two
    // this view shows. The third is left exactly as it was, which is what
    // makes switching views the way to move a point in the third direction.
    if (drag?.type === 'point') {
      const rect = canvasRef.current.getBoundingClientRect();
      const h = Math.round((e.clientX - rect.left - view.x) / view.scale - 0.5) + projection.minH;
      const v = Math.round((e.clientY - rect.top - view.y) / view.scale - 0.5) + projection.minV;
      const next = points.slice();
      next[drag.index] = {
        ...points[drag.index],
        [axes.h]: h,
        [axes.v]: axes.vSign * v,
      };
      onPointsChange(next);
      return;
    }

    // The pan is worked out from where the drag STARTED, not from the last
    // event. Chaining deltas through a ref looks equivalent but is not: React
    // can run a state updater more than once, and each extra run would apply
    // the same movement again, flinging the build off screen.
    if (drag?.type === 'pan') {
      setView((v) => ({
        ...v,
        x: drag.viewX + (e.clientX - drag.clientX),
        y: drag.viewY + (e.clientY - drag.clientY),
      }));
      return;
    }

    const near = pointAt(e.clientX, e.clientY);
    setGrabbed(near);

    const rect = canvasRef.current.getBoundingClientRect();
    const h = Math.floor((e.clientX - rect.left - view.x) / view.scale) + projection.minH;
    const v = Math.floor((e.clientY - rect.top - view.y) / view.scale) + projection.minV;
    setHover(projection.cells.get(`${h},${v}`) || null);
  };

  // Wheel has to be bound by hand so the page underneath does not scroll.
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!viewRef.current) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setView((v) => {
        const scale = Math.min(80, Math.max(0.02, v.scale * factor));
        const k = scale / v.scale;
        return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const planeAxes = PLANES[plane];

  return (
    <div className="plan-view" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={grabbed !== null ? 'grabbing-point' : ''}
        style={{ width: size.w, height: size.h }}
        onPointerDown={(e) => {
          if (!view) return;
          const index = pointAt(e.clientX, e.clientY);
          dragRef.current =
            index !== null
              ? { type: 'point', index }
              : { type: 'pan', clientX: e.clientX, clientY: e.clientY, viewX: view.x, viewY: view.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          dragRef.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          setHover(null);
          setGrabbed(null);
        }}
      />

      <div className="plan-overlay">
        <button type="button" className="chip" onClick={fit}>
          Fit
        </button>
        <span className="scale-readout">
          {planeAxes.across} across, {planeAxes.down} down
          {projection.stride > 1 ? ` · every ${projection.stride}th block` : ''}
        </span>
      </div>

      <div className="plan-legend">
        <span>y {model.stats.minY}</span>
        <div className="ramp" />
        <span>y {model.stats.maxY}</span>
      </div>

      <div className={hover ? 'plan-readout visible' : 'plan-readout'}>
        {hover ? (
          <>
            <strong>
              X {hover.x} &nbsp; Y {hover.y} &nbsp; Z {hover.z}
            </strong>
            <span>
              {hover.kind === 'stair'
                ? `stair, rising ${hover.facing}`
                : hover.kind === 'slab'
                  ? `${hover.half === 'top' ? 'top' : 'bottom'} slab`
                  : 'full block'}
            </span>
          </>
        ) : (
          <span>
            {editable
              ? `Drag a point to move it in ${planeAxes.across} and ${planeAxes.down} · switch view to move it the other way`
              : 'Hover a block for its exact coordinates · scroll to zoom · drag to pan'}
          </span>
        )}
      </div>
    </div>
  );
}
