/**
 * Puts the whole engine together: coordinates in, buildable bridge out.
 *
 * Order of operations:
 *   path      where the deck goes across the ground (the staircase problem)
 *   width     how wide that deck is
 *   curve     how high it is at each step, as a smooth number
 *   quantise  that height snapped onto real blocks, slabs and stairs
 *   segment   which parts of it repeat, mirror, or run on unchanged
 */

import { BridgeError, rowWidth } from './model.js';
import { planPath } from './path.js';
import { applyWidth } from './width.js';
import { deckLevels } from './curve.js';
import { quantise } from './quantise.js';
import { analyseSegments } from './segment.js';

export const DEFAULT_PARAMS = {
  start: { x: 0, y: 64, z: 0 },
  end: { x: 40, y: 64, z: 15 },
  width: 3,
  sag: -4,
  curve: 'catenary',
  blockMode: 'slabs',
  compensateDiagonal: false,
  block: 'stone_bricks',
};

function validate(params) {
  const coords = [params.start, params.end];
  for (const c of coords) {
    for (const axis of ['x', 'y', 'z']) {
      if (!Number.isFinite(c[axis])) {
        throw new BridgeError('All six coordinates need to be numbers.');
      }
    }
  }
  if (!Number.isFinite(params.width) || params.width < 1) {
    throw new BridgeError('Width has to be at least 1 block.');
  }
  if (!Number.isFinite(params.sag)) {
    throw new BridgeError('Sag has to be a number. Use a negative value to droop, positive to arch.');
  }
}

export function buildBridge(userParams) {
  const params = { ...DEFAULT_PARAMS, ...userParams };
  params.start = { ...DEFAULT_PARAMS.start, ...userParams?.start };
  params.end = { ...DEFAULT_PARAMS.end, ...userParams?.end };
  validate(params);

  const path = planPath(params.start, params.end);
  const widened = applyWidth(path, params.width, params.compensateDiagonal);
  const levels = deckLevels(
    widened.cells,
    params.start.y,
    params.end.y,
    params.sag,
    params.curve,
    path.horizontalSpan
  );
  const { rows: heights, snapped, unsmoothedSteps, travel } = quantise(
    levels,
    params.blockMode,
    path.majorAxis,
    path.stepMajor
  );

  // Merge the footprint and the height into the final rows.
  const rows = widened.cells.map((cell, i) => ({
    i: cell.i,
    t: cell.t,
    major: cell.major,
    minor: cell.minor,
    minorStart: cell.minorStart,
    minorEnd: cell.minorEnd,
    y: heights[i].y,
    kind: heights[i].kind,
    facing: heights[i].facing,
    exactLevel: levels[i],
    snappedLevel: snapped[i],
  }));

  const segments = analyseSegments(widened.cells, heights);

  // Counting is done from the rows, never by expanding blocks, so this stays
  // instant no matter how long the bridge is.
  const counts = { full: 0, slab: 0, stair: 0 };
  let blockCount = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const row of rows) {
    const w = rowWidth(row);
    counts[row.kind] += w;
    blockCount += w;
    if (row.y < minY) minY = row.y;
    if (row.y > maxY) maxY = row.y;
  }

  const dy = params.end.y - params.start.y;

  // How far the curve actually pulls away from the straight line between the
  // two ends, and where. Measured on the unrounded curve so it reflects what
  // was asked for rather than what the blocks could manage.
  let peakDeviation = 0;
  let peakDeviationAt = 0;
  for (const row of rows) {
    const chord = params.start.y + dy * row.t;
    const deviation = row.exactLevel - chord;
    if (Math.abs(deviation) > Math.abs(peakDeviation)) {
      peakDeviation = deviation;
      peakDeviationAt = row.t;
    }
  }

  return {
    params,
    majorAxis: path.majorAxis,
    minorAxis: path.minorAxis,
    stepMajor: path.stepMajor,
    stepMinor: path.stepMinor,
    travel,
    width: widened.width,
    rows,
    segments,
    warnings: unsmoothedSteps
      ? [
          `${unsmoothedSteps} step${unsmoothedSteps === 1 ? '' : 's'} rise more than one block at ` +
            `once, which a single stair cannot ramp. Those rows stay full blocks. ` +
            `A longer bridge or a smaller sag will smooth them out.`,
        ]
      : [],
    stats: {
      rowCount: rows.length,
      blockCount,
      counts,
      width: widened.width,
      horizontalSpan: Math.round(path.horizontalSpan * 100) / 100,
      trueLength: Math.round(Math.hypot(path.horizontalSpan, dy) * 100) / 100,
      slopePercent: path.horizontalSpan ? Math.round((dy / path.horizontalSpan) * 1000) / 10 : 0,
      minY,
      maxY,
      heightRange: maxY - minY,
      /** Vertical distance from the straight line to the curve, at its worst. */
      peakDeviation: Math.round(peakDeviation * 100) / 100,
      /** Where along the bridge that happens, 0 at the start and 1 at the end. */
      peakDeviationAt: Math.round(peakDeviationAt * 1000) / 1000,
      /** The lowest deck block on the whole bridge, and where it sits. */
      lowestRow: rows.reduce((lowest, r) => (r.y < lowest.y ? r : lowest), rows[0]).i,
    },
  };
}
