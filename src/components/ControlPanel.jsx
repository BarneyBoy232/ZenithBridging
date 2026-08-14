/** Everything you can change about the bridge. */

import { BLOCK_MODES, CURVE_TYPES } from '../engine/model.js';

function CoordRow({ label, value, onChange }) {
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
    </div>
  );
}

export default function ControlPanel({ params, setParams }) {
  const set = (patch) => setParams({ ...params, ...patch });

  return (
    <div className="panel controls">
      <section>
        <h2>Coordinates</h2>
        <p className="help">
          Press F3 in game to read your position. Stand where you want each end and note the numbers.
        </p>
        <CoordRow label="From" value={params.start} onChange={(start) => set({ start })} />
        <CoordRow label="To" value={params.end} onChange={(end) => set({ end })} />
        <button
          type="button"
          className="link-button"
          onClick={() => set({ start: params.end, end: params.start })}
        >
          Swap ends
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

        <label className="checkbox">
          <input
            type="checkbox"
            checked={params.compensateDiagonal}
            onChange={(e) => set({ compensateDiagonal: e.target.checked })}
          />
          <span>
            Keep width constant on diagonals
            <em>A diagonal deck measures narrower across the corner. This widens it to compensate.</em>
          </span>
        </label>
      </section>

      <section>
        <h2>Sag</h2>
        <p className="help">
          Measured straight down, like a rope held at both ends. Negative droops, positive arches.
        </p>
        <label className="field">
          <span>
            Amount{' '}
            <em>
              {params.sag > 0 ? '+' : ''}
              {params.sag} blocks
            </em>
          </span>
          <input
            type="range"
            min="-40"
            max="40"
            step="1"
            value={params.sag}
            onChange={(e) => set({ sag: Number(e.target.value) })}
          />
        </label>
        <div className="button-row">
          {[-8, -4, 0, 4, 8].map((v) => (
            <button
              key={v}
              type="button"
              className={params.sag === v ? 'chip active' : 'chip'}
              onClick={() => set({ sag: v })}
            >
              {v > 0 ? `+${v}` : v}
            </button>
          ))}
        </div>

        <label className="field">
          <span>Curve</span>
          <select value={params.curve} onChange={(e) => set({ curve: e.target.value })}>
            {Object.values(CURVE_TYPES).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">{CURVE_TYPES[params.curve]?.hint}</p>
      </section>

      <section>
        <h2>Blocks</h2>
        <label className="field">
          <span>Build with</span>
          <select value={params.blockMode} onChange={(e) => set({ blockMode: e.target.value })}>
            {Object.values(BLOCK_MODES).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">{BLOCK_MODES[params.blockMode]?.hint}</p>

        <label className="field">
          <span>Block</span>
          <input
            type="text"
            value={params.block}
            spellCheck={false}
            onChange={(e) => set({ block: e.target.value })}
            placeholder="stone_bricks"
          />
        </label>
        <p className="hint">
          Slab and stair names are worked out from this, so <code>stone_bricks</code> gives{' '}
          <code>stone_brick_slab</code> and <code>stone_brick_stairs</code>.
        </p>
      </section>
    </div>
  );
}
