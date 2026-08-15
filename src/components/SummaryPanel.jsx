/** The numbers, the materials, and whatever shortcut the build offers. */

const MATERIALS = [
  { key: 'full', label: 'Full blocks' },
  { key: 'slab', label: 'Slabs' },
  { key: 'stair', label: 'Stairs' },
];

function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

/** Blocks expressed the way you actually gather them. */
function stacks(count) {
  const full = Math.floor(count / 64);
  const rest = count % 64;
  if (!full) return `${count}`;
  return `${full} stack${full === 1 ? '' : 's'}${rest ? ` + ${rest}` : ''}`;
}

function Shortcut({ model }) {
  const { tile, symmetry, runs, best } = model.segments;

  if (best === 'tile') {
    return (
      <>
        <p className="callout good">
          This bridge repeats exactly. Build <strong>{tile.length} row{tile.length === 1 ? '' : 's'}</strong>{' '}
          and copy it <strong>{tile.repeats} times</strong>, then add the final closing row.
        </p>
        <p className="hint">
          Each copy sits {Math.abs(tile.shiftMinor)} block{Math.abs(tile.shiftMinor) === 1 ? '' : 's'} sideways
          {tile.shiftY ? ` and ${Math.abs(tile.shiftY)} up` : ''} from the last.
        </p>
      </>
    );
  }

  return (
    <>
      {symmetry.heights ? (
        <p className="callout good">
          The second half is the first half reversed, so you only have to work out{' '}
          <strong>{Math.ceil(model.stats.rowCount / 2)} rows</strong> and mirror them.
        </p>
      ) : (
        <p className="callout">
          No exact repeat and no mirror on this one — the two ends sit at different heights, so every row
          is its own. The run list below is the shortcut.
        </p>
      )}
      <p className="hint">
        Grouped into <strong>{runs.length}</strong> runs of identical rows, down from {model.stats.rowCount}.
      </p>
    </>
  );
}

export default function SummaryPanel({ model, highlight, setHighlight }) {
  const { stats } = model;
  const isBridge = model.kind === 'bridge';

  return (
    <div className="panel summary">
      <section>
        <h2>{isBridge ? 'The bridge' : 'The path'}</h2>
        <div className="stat-grid">
          {isBridge ? (
            <>
              <Stat label="Rows" value={stats.rowCount} note={`${stats.width} wide`} />
              <Stat label="Blocks" value={stats.blockCount.toLocaleString()} note={stacks(stats.blockCount)} />
              <Stat label="Span" value={`${stats.horizontalSpan} blocks`} note="across the ground" />
              <Stat label="Slope" value={`${stats.slopePercent}%`} note={`${stats.minY} to ${stats.maxY} y`} />
            </>
          ) : (
            <>
              <Stat label="Points" value={stats.pointCount} note={`${stats.width} wide`} />
              <Stat label="Blocks" value={stats.blockCount.toLocaleString()} note={stacks(stats.blockCount)} />
              <Stat label="Length" value={`${stats.trueLength} blocks`} note="along the curve" />
              <Stat label="Height" value={`${stats.heightRange} blocks`} note={`${stats.minY} to ${stats.maxY} y`} />
            </>
          )}
        </div>

        {isBridge && stats.peakDeviation !== 0 && (
          <p className="hint">
            {stats.peakDeviation < 0 ? 'Hangs' : 'Arches'}{' '}
            <strong>{Math.abs(stats.peakDeviation)} blocks</strong>{' '}
            {stats.peakDeviation < 0 ? 'below' : 'above'} the straight line between your two points,{' '}
            {stats.peakDeviation < 0 ? 'deepest' : 'highest'}{' '}
            {Math.round(stats.peakDeviationAt * 100)}% of the way along.
            {stats.squareToDeck && (
              <>
                {' '}
                That is measured straight down; square to the slope, which is what you asked for, it is{' '}
                <strong>{Math.abs(stats.perpendicularDeviation)}</strong>.
              </>
            )}
          </p>
        )}

        {!isBridge && (
          <p className="hint">
            Box is <strong>{stats.boxSize.x} × {stats.boxSize.y} × {stats.boxSize.z}</strong> blocks.
          </p>
        )}
      </section>

      {isBridge && (
        <section>
          <h2>Shortcut</h2>
          <Shortcut model={model} />
        </section>
      )}

      <section>
        <h2>Materials</h2>
        <ul className="materials">
          {MATERIALS.filter((m) => stats.counts[m.key] > 0).map((m) => (
            <li key={m.key}>
              <button
                type="button"
                className={highlight === m.key ? 'material picked' : 'material'}
                onClick={() => setHighlight(highlight === m.key ? null : m.key)}
                aria-pressed={highlight === m.key}
                title="Pick this out in the views"
              >
                <code>{m.label}</code>
                <span>{stats.counts[m.key].toLocaleString()}</span>
                <em>{stacks(stats.counts[m.key])}</em>
              </button>
            </li>
          ))}
        </ul>
        <p className="hint">
          {highlight
            ? 'Everything else is greyed out in the views. Click again to show it all.'
            : 'Click a material to pick it out in the views and grey the rest, so you can see exactly where each one goes.'}
        </p>
      </section>

      {model.warnings.length > 0 && (
        <section>
          <h2>Worth knowing</h2>
          {model.warnings.map((w) => (
            <p key={w} className="callout warn">
              {w}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
