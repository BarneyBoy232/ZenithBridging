/**
 * Turns a smooth curve into a buildable deck.
 *
 * The bridge tool stores rows, because a straight bridge advances one block
 * along one axis per row. A curved path cannot do that — it can head any
 * direction, double back, or cross over itself — so this stores blocks in a
 * map keyed by position instead. Same idea, different bookkeeping.
 *
 * The deck is laid across the path rather than along an axis: at every point
 * on the curve, the width is measured at right angles to the direction of
 * travel, so a corner keeps its full width instead of pinching.
 */

import { BridgeError, heightResolution, snapTo } from './model.js';
import { boundingBox, clampToBox, insideBox, sampleSpline, splineLength } from './spline.js';

export const DEFAULT_TRACK_PARAMS = {
  points: [
    { x: 0, y: 64, z: 0 },
    { x: 30, y: 64, z: 18 },
    { x: 64, y: 64, z: 0 },
  ],
  width: 4,
  useSlabs: true,
  box: null, // null means "work it out from the points"
  boxPadding: 12,
};

/** The box the whole track has to stay inside. */
export function resolveBox(params) {
  if (params.box) return params.box;
  const bounds = boundingBox(params.points);
  const pad = Math.max(0, Math.round(params.boxPadding ?? 12));
  return {
    min: { x: bounds.min.x - pad, y: bounds.min.y - pad, z: bounds.min.z - pad },
    max: { x: bounds.max.x + pad, y: bounds.max.y + pad, z: bounds.max.z + pad },
  };
}

function validate(params) {
  if (!Array.isArray(params.points) || params.points.length < 2) {
    throw new BridgeError('A curved path needs at least a start and a finish.');
  }
  for (const p of params.points) {
    for (const axis of ['x', 'y', 'z']) {
      if (!Number.isFinite(p[axis])) throw new BridgeError('Every point needs three numbers.');
    }
  }
  if (!Number.isFinite(params.width) || params.width < 1) {
    throw new BridgeError('Width has to be at least 1 block.');
  }
  const first = params.points[0];
  const last = params.points.at(-1);
  if (params.points.length === 2 && first.x === last.x && first.z === last.z) {
    throw new BridgeError(
      'Start and finish sit on the same spot horizontally. Move one of them, or add a point in ' +
        'between to curve around.'
    );
  }
}

export function buildTrack(userParams) {
  const params = { ...DEFAULT_TRACK_PARAMS, ...userParams };
  validate(params);

  const box = resolveBox(params);
  const resolution = heightResolution(params.useSlabs);

  // Control points are held inside the box. The curve between them can still
  // bulge past a tight corner, which is reported rather than silently bent.
  const points = params.points.map((p) => clampToBox(p, box));
  const samples = sampleSpline(points, 0.25);
  if (!samples.length) throw new BridgeError('That path is too short to build.');

  let escaped = 0;
  const cells = new Map(); // "x,y,z" -> block
  const columns = new Map(); // "x,z" -> lowest deck level seen, for packing

  const halfWidth = (Math.max(1, Math.round(params.width)) - 1) / 2;
  // Step across the deck in half blocks. Whole-block steps leave diagonal
  // pinholes on a curve, because the deck is at an angle to the block grid.
  const offsets = [];
  for (let o = -halfWidth; o <= halfWidth + 1e-9; o += 0.5) offsets.push(o);

  for (const sample of samples) {
    if (!insideBox(sample, box, 0.5)) escaped++;

    // Left-hand normal of the direction of travel, on the flat.
    const nx = -sample.tangent.z;
    const nz = sample.tangent.x;
    const level = snapTo(sample.y, resolution);

    for (const o of offsets) {
      const wx = Math.round(sample.x + nx * o);
      const wz = Math.round(sample.z + nz * o);

      const isSlab = !Number.isInteger(level);
      const y = isSlab ? Math.ceil(level) : level;
      const key = `${wx},${y},${wz}`;

      if (!cells.has(key)) {
        cells.set(key, { x: wx, y, z: wz, kind: isSlab ? 'slab' : 'full', facing: null });
      }

      const colKey = `${wx},${wz}`;
      const column = columns.get(colKey);
      if (!column) columns.set(colKey, { top: y, bottom: y });
      else {
        if (y > column.top) column.top = y;
        if (y < column.bottom) column.bottom = y;
      }
    }
  }

  // Close holes the same way the straight tool does: where neighbouring
  // columns end up more than one block apart, pack the higher one down to
  // meet the lower. On a curve the neighbours are the eight around each
  // column, because the deck can run at any angle across the grid.
  let packingBlocks = 0;
  const packed = [];
  for (const [key, column] of columns) {
    const [cx, cz] = key.split(',').map(Number);
    let target = column.bottom;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const other = columns.get(`${cx + dx},${cz + dz}`);
        if (!other) continue;
        if (column.bottom - other.top >= 2) target = Math.min(target, other.top + 1);
      }
    }
    for (let y = target; y < column.bottom; y++) {
      packed.push({ x: cx, y, z: cz, kind: 'full', facing: null });
      packingBlocks++;
    }
  }
  for (const block of packed) {
    const key = `${block.x},${block.y},${block.z}`;
    if (!cells.has(key)) cells.set(key, block);
  }

  const counts = { full: 0, slab: 0, stair: 0 };
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of cells.values()) {
    counts[cell.kind]++;
    if (cell.y < minY) minY = cell.y;
    if (cell.y > maxY) maxY = cell.y;
  }

  const warnings = [];
  if (escaped > 0) {
    warnings.push(
      `The curve bulges outside the box on ${escaped === 1 ? 'one corner' : 'some corners'}. ` +
        `Corners swing wide — move a point inward, or grow the box, if it has to stay inside.`
    );
  }
  if (packingBlocks > 0) {
    warnings.push(
      `${packingBlocks.toLocaleString()} extra block${packingBlocks === 1 ? '' : 's'} were added ` +
        `underneath to close gaps where the path dropped faster than the deck could follow.`
    );
  }

  const blocks = [...cells.values()];
  const length = splineLength(samples);

  return {
    kind: 'track',
    params: { ...params, points },
    box,
    samples,
    blocks,
    warnings,
    /** Views walk the blocks through here, so both tools look the same to them. */
    eachBlock(stride, fn) {
      for (let i = 0; i < blocks.length; i += stride) fn(blocks[i]);
    },
    stats: {
      pointCount: points.length,
      blockCount: blocks.length,
      counts,
      packingBlocks,
      width: Math.max(1, Math.round(params.width)),
      resolution,
      trueLength: Math.round(length * 10) / 10,
      minY,
      maxY,
      heightRange: maxY - minY,
      boxSize: {
        x: box.max.x - box.min.x,
        y: box.max.y - box.min.y,
        z: box.max.z - box.min.z,
      },
    },
  };
}
