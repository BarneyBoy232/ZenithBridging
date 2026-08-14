/**
 * The flat views of the bridge — the output that works in every edition and
 * every version, because you just read it and copy it.
 *
 * Three of them, one down each axis:
 *   top    looking straight down. Shows the footprint and the diagonal.
 *   front  looking along Z. Shows the sag as a height profile.
 *   side   looking along X. Same, from the other side.
 *
 * Drawn on a canvas rather than as page elements: a long bridge is tens of
 * thousands of squares, and the browser will not lay that out as HTML without
 * grinding to a halt.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { levelColour } from './colour.js';
import { rowBlocks } from '../engine/model.js';

export const PLANES = {
  top: { id: 'top', label: 'Top', across: 'X', down: 'Z' },
  front: { id: 'front', label: 'Front', across: 'X', down: 'Y' },
  side: { id: 'side', label: 'Side', across: 'Z', down: 'Y' },
};

/** Beyond this many blocks the flat views start skipping rows. */
const CELL_BUDGET = 200000;

/**
 * Flatten the bridge onto one plane.
 *
 * Where several blocks land on the same spot on screen, only the one nearest
 * the viewer is kept — looking down at a bridge you see its deck, not the
 * packing underneath it.
 */
function project(model, plane) {
  const stride = Math.max(1, Math.ceil(model.stats.blockCount / CELL_BUDGET));
  const cells = new Map();
  const { minY, maxY } = model.stats;

  let minH = Infinity;
  let maxH = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (let i = 0; i < model.rows.length; i += stride) {
    const row = model.rows[i];
    for (const block of rowBlocks(model, row)) {
      let h;
      let v;
      let nearness;
      if (plane === 'top') {
        h = block.x;
        v = block.z;
        nearness = block.y; // looking down: the highest block wins
      } else if (plane === 'front') {
        h = block.x;
        v = -block.y; // screens count downward, worlds count upward
        nearness = -block.z;
      } else {
        h = block.z;
        v = -block.y;
        nearness = block.x;
      }

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
          colour: levelColour(block.y, minY, maxY),
          kind: block.kind,
          facing: block.facing,
          y: block.y,
          x: block.x,
          z: block.z,
          row: row.i,
        });
      }
    }
  }

  return {
    cells,
    stride,
    minH,
    maxH,
    minV,
    maxV,
    w: maxH - minH + 1,
    h: maxV - minV + 1,
  };
}

export default function PlanView({ model, plane = 'top' }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState(null); // { scale, x, y } in screen pixels
  const [hover, setHover] = useState(null);
  const dragRef = useRef(null);

  const projection = useMemo(() => project(model, plane), [model, plane]);

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
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width, entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit only when the bridge changes shape or the view axis changes.
  // Changing the sag or the block options must NOT throw away the pan and
  // zoom you set up — you are usually adjusting those to watch one spot.
  const fitKey = `${plane}|${projection.w}x${projection.h}`;
  const lastFitKey = useRef(null);
  useEffect(() => {
    if (lastFitKey.current === fitKey && view) return;
    lastFitKey.current = fitKey;
    fit();
  }, [fitKey, fit, view]);

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

      if (!decorate) continue;

      if (c.kind === 'slab') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(sx, sy + cell / 2, cell, cell / 2);
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
  }, [projection, view, size, plane]);

  const onPointerMove = (e) => {
    if (!view) return;

    // The pan is worked out from where the drag STARTED, not from the last
    // event. Chaining deltas through a ref looks equivalent but is not: React
    // can run a state updater more than once, and each extra run would apply
    // the same movement again, flinging the bridge off screen.
    const drag = dragRef.current;
    if (drag) {
      setView((v) => ({
        ...v,
        x: drag.viewX + (e.clientX - drag.clientX),
        y: drag.viewY + (e.clientY - drag.clientY),
      }));
      return;
    }

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

  const axes = PLANES[plane];

  return (
    <div className="plan-view" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h }}
        onPointerDown={(e) => {
          if (!view) return;
          dragRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            viewX: view.x,
            viewY: view.y,
          };
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
        onPointerLeave={() => setHover(null)}
      />

      <div className="plan-overlay">
        <button type="button" className="chip" onClick={fit}>
          Fit
        </button>
        <span className="scale-readout">
          {axes.across} across, {axes.down} down
          {projection.stride > 1 ? ` · every ${projection.stride}th row` : ''}
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
                  ? 'bottom slab'
                  : 'full block'}{' '}
              · row {hover.row + 1}
            </span>
          </>
        ) : (
          <span>Hover a block for its exact coordinates · scroll to zoom · drag to pan</span>
        )}
      </div>
    </div>
  );
}
