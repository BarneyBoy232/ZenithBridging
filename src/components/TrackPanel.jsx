/** Controls for the curved path: the points it goes through, and its box. */

import { BLOCK_OPTIONS } from '../engine/model.js';
import { boundingBox } from '../engine/spline.js';

function PointFields({ label, value, onChange, onRemove }) {
  return (
    <div className="coord-row">
      <span className="coord-label">{label}</span>
      {['x', 'y', 'z'].map((axis) => (
        <label key={axis} className="coord-field">
          <span>{axis.toUpperCase()}</span>
          <input
            type="number"
            value={value[axis]}
            onChange={(e) => onChange({ ...value, [axis]: Math.round(Number(e.target.value) || 0) })}
          />
        </label>
      ))}
      <button
        type="button"
        className="row-remove"
        onClick={onRemove}
        disabled={!onRemove}
        aria-label={`Remove ${label}`}
        title={onRemove ? 'Remove this point' : 'The start and finish cannot be removed'}
      >
        ×
      </button>
    </div>
  );
}

export default function TrackPanel({ params, setParams, box }) {
  const set = (patch) => setParams({ ...params, ...patch });
  const points = params.points;

  const setPoint = (index, point) => {
    const next = points.slice();
    next[index] = point;
    set({ points: next });
  };

  /** New points go in the middle of the longest stretch, where they help most. */
  const addPoint = () => {
    let longest = 0;
    let at = 1;
    for (let i = 1; i < points.length; i++) {
      const d = Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].y - points[i - 1].y,
        points[i].z - points[i - 1].z
      );
      if (d > longest) {
        longest = d;
        at = i;
      }
    }
    const a = points[at - 1];
    const b = points[at];
    const next = points.slice();
    next.splice(at, 0, {
      x: Math.round((a.x + b.x) / 2),
      y: Math.round((a.y + b.y) / 2),
      z: Math.round((a.z + b.z) / 2),
    });
    set({ points: next });
  };

  const setCorner = (corner, axis, value) =>
    set({
      box: {
        min: { ...box.min, ...(corner === 'min' ? { [axis]: value } : {}) },
        max: { ...box.max, ...(corner === 'max' ? { [axis]: value } : {}) },
      },
    });

  const fitBox = () => {
    const b = boundingBox(points);
    const pad = Math.max(0, Math.round(params.boxPadding ?? 12));
    set({
      box: {
        min: { x: b.min.x - pad, y: b.min.y - pad, z: b.min.z - pad },
        max: { x: b.max.x + pad, y: b.max.y + pad, z: b.max.z + pad },
      },
    });
  };

  return (
    <div className="panel controls">
      <section>
        <h2>Points</h2>
        <p className="help">
          The path runs exactly through every point, in order. Two points give a straight run; add
          more to bend it.
        </p>
        {points.map((p, i) => (
          <PointFields
            key={i}
            label={i === 0 ? 'Start' : i === points.length - 1 ? 'End' : `${i}`}
            value={p}
            onChange={(next) => setPoint(i, next)}
            onRemove={
              i === 0 || i === points.length - 1
                ? null
                : () => set({ points: points.filter((_, n) => n !== i) })
            }
          />
        ))}
        <button type="button" className="link-button" onClick={addPoint}>
          Add a point
        </button>
      </section>

      <section>
        <h2>Box</h2>
        <p className="help">
          The volume the path has to stay inside. Points are held within it. Corners still swing
          wide, so the app tells you if the curve bulges out.
        </p>
        {['min', 'max'].map((corner) => (
          <div className="coord-row" key={corner}>
            <span className="coord-label">{corner === 'min' ? 'From' : 'To'}</span>
            {['x', 'y', 'z'].map((axis) => (
              <label key={axis} className="coord-field">
                <span>{axis.toUpperCase()}</span>
                <input
                  type="number"
                  value={box[corner][axis]}
                  onChange={(e) => setCorner(corner, axis, Math.round(Number(e.target.value) || 0))}
                />
              </label>
            ))}
            <span className="row-remove" aria-hidden="true" />
          </div>
        ))}
        <button type="button" className="link-button" onClick={fitBox}>
          Fit the box around the path
        </button>
      </section>

      <section>
        <h2>Deck</h2>
        <label className="field">
          <span>
            Width <em>{params.width} blocks</em>
          </span>
          <input
            type="range"
            min="1"
            max="24"
            value={params.width}
            onChange={(e) => set({ width: Number(e.target.value) })}
          />
        </label>
        <p className="hint">
          Measured across the path, not across an axis — so a corner keeps its full width instead of
          pinching in.
        </p>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={params.useSlabs}
            onChange={(e) => set({ useSlabs: e.target.checked })}
          />
          <span>
            {BLOCK_OPTIONS.slabs.label}
            <em>{BLOCK_OPTIONS.slabs.hint}</em>
          </span>
        </label>
      </section>
    </div>
  );
}
