/**
 * The top-down plan of the bridge — the output that works in every edition and
 * every version, because you just read it and copy it.
 *
 * Drawn on a canvas rather than as page elements: a long bridge is tens of
 * thousands of squares, and the browser will not lay that out as HTML without
 * grinding to a halt.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { levelColour } from './colour.js';

export default function PlanView({ model }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState(null); // { scale, x, y } in screen pixels
  const [hover, setHover] = useState(null);
  const dragRef = useRef(null);

  const majorIsX = model.majorAxis === 'x';

  // How much ground the bridge covers, so we know what we are fitting.
  const bounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const r of model.rows) {
      const acrossLow = r.minorStart;
      const acrossHigh = r.minorEnd;
      if (majorIsX) {
        minX = Math.min(minX, r.major);
        maxX = Math.max(maxX, r.major);
        minZ = Math.min(minZ, acrossLow);
        maxZ = Math.max(maxZ, acrossHigh);
      } else {
        minZ = Math.min(minZ, r.major);
        maxZ = Math.max(maxZ, r.major);
        minX = Math.min(minX, acrossLow);
        maxX = Math.max(maxX, acrossHigh);
      }
    }
    return { minX, maxX, minZ, maxZ, w: maxX - minX + 1, h: maxZ - minZ + 1 };
  }, [model, majorIsX]);

  // Fast lookup for the hover readout: which row sits at this position.
  const rowByMajor = useMemo(() => {
    const map = new Map();
    for (const r of model.rows) map.set(r.major, r);
    return map;
  }, [model]);

  const fit = useMemo(
    () => () => {
      const scale = Math.min(size.w / bounds.w, size.h / bounds.h) * 0.92;
      setView({
        scale,
        x: (size.w - bounds.w * scale) / 2,
        y: (size.h - bounds.h * scale) / 2,
      });
    },
    [size, bounds]
  );

  // Track the size of the area we have to draw into. Measured directly on
  // mount as well as watched, because a tab that starts out hidden may not
  // deliver a resize callback until it is shown — and a canvas sized to a
  // stale guess is a canvas that does not line up with the page.
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

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      measure(width, height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit whenever the bridge changes shape.
  useEffect(() => {
    fit();
  }, [fit]);

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
    const { minX, minZ } = bounds;
    const { minY, maxY } = model.stats;

    // Screen position of a world block.
    const px = (worldX) => ox + (worldX - minX) * scale;
    const pz = (worldZ) => oy + (worldZ - minZ) * scale;

    // Chunk boundaries: genuinely useful when you are lining a build up in game.
    if (scale >= 3) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      const firstChunkX = Math.ceil(minX / 16) * 16;
      for (let wx = firstChunkX; wx <= bounds.maxX + 1; wx += 16) {
        ctx.beginPath();
        ctx.moveTo(px(wx), 0);
        ctx.lineTo(px(wx), size.h);
        ctx.stroke();
      }
      const firstChunkZ = Math.ceil(minZ / 16) * 16;
      for (let wz = firstChunkZ; wz <= bounds.maxZ + 1; wz += 16) {
        ctx.beginPath();
        ctx.moveTo(0, pz(wz));
        ctx.lineTo(size.w, pz(wz));
        ctx.stroke();
      }
    }

    const inset = scale >= 5 ? 0.5 : 0;
    const cell = Math.max(1, scale - inset * 2);
    const decorate = scale >= 7;

    for (const row of model.rows) {
      const colour = levelColour(row.y, minY, maxY);
      for (let m = row.minorStart; m <= row.minorEnd; m++) {
        const wx = majorIsX ? row.major : m;
        const wz = majorIsX ? m : row.major;
        const sx = px(wx) + inset;
        const sy = pz(wz) + inset;

        // Cheap cull so a huge bridge zoomed in stays instant.
        if (sx > size.w || sy > size.h || sx + cell < 0 || sy + cell < 0) continue;

        ctx.fillStyle = colour;
        ctx.fillRect(sx, sy, cell, cell);

        if (!decorate) continue;

        if (row.kind === 'slab') {
          // Half-height block: shown as a bar across the lower half.
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(sx, sy + cell / 2, cell, cell / 2);
        } else if (row.kind === 'stair') {
          // Arrow points the way the deck rises.
          const cx = sx + cell / 2;
          const cy = sy + cell / 2;
          const r = cell * 0.3;
          const angle = { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2 }[row.facing];
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

    // Where the bridge starts and finishes.
    const marker = (row, label) => {
      const wx = majorIsX ? row.major : row.minor;
      const wz = majorIsX ? row.minor : row.major;
      const cx = px(wx) + scale / 2;
      const cy = pz(wz) + scale / 2;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(6, scale * 0.7), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, cy - Math.max(10, scale * 0.7) - 4);
    };
    marker(model.rows[0], 'START');
    marker(model.rows[model.rows.length - 1], 'END');
  }, [model, view, size, bounds, majorIsX]);

  const toWorld = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return {
      x: Math.floor((sx - view.x) / view.scale) + bounds.minX,
      z: Math.floor((sy - view.y) / view.scale) + bounds.minZ,
    };
  };

  const onPointerMove = (e) => {
    if (!view) return;

    if (dragRef.current) {
      setView((v) => ({
        ...v,
        x: v.x + (e.clientX - dragRef.current.x),
        y: v.y + (e.clientY - dragRef.current.y),
      }));
      dragRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, z } = toWorld(e);
    const row = rowByMajor.get(majorIsX ? x : z);
    const across = majorIsX ? z : x;
    if (row && across >= row.minorStart && across <= row.minorEnd) {
      setHover({ x, z, y: row.y, kind: row.kind, facing: row.facing, i: row.i });
    } else {
      setHover(null);
    }
  };

  const onWheel = (e) => {
    if (!view) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => {
      const scale = Math.min(80, Math.max(0.05, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
    });
  };

  // Canvas wheel handling has to be registered manually to be able to stop the
  // page scrolling underneath it.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e) => onWheel(e);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  });

  return (
    <div className="plan-view" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h }}
        onPointerDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          dragRef.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      />

      <div className="plan-overlay">
        <button type="button" className="chip" onClick={fit}>
          Fit
        </button>
        <span className="scale-readout">{view ? `${view.scale.toFixed(1)} px / block` : ''}</span>
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
              · row {hover.i + 1}
            </span>
          </>
        ) : (
          <span>Hover a block for its exact coordinates · scroll to zoom · drag to pan</span>
        )}
      </div>
    </div>
  );
}
