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

import {
  BridgeError,
  curveSettings,
  heightResolution,
  rowBlockCount,
  rowBlocks,
  rowWidth,
} from './model.js';
import { planPath } from './path.js';
import { applyWidth } from './width.js';
import { deckLevels, squareSagCeiling } from './curve.js';
import { quantise } from './quantise.js';
import { analyseSegments } from './segment.js';

export const DEFAULT_PARAMS = {
  start: { x: 0, y: 64, z: 0 },
  end: { x: 40, y: 64, z: 15 },
  width: 3,
  sag: -4,
  curve: 'catenary',
  useSlabs: true,
  useStairs: false,
  compensateDiagonal: false,
};

function validate(params) {
  for (const c of [params.start, params.end]) {
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

function normalise(userParams) {
  const params = { ...DEFAULT_PARAMS, ...userParams };
  params.start = { ...DEFAULT_PARAMS.start, ...userParams?.start };
  params.end = { ...DEFAULT_PARAMS.end, ...userParams?.end };
  return params;
}

/**
 * The steepest height change between neighbouring rows, measured on the
 * blocks rather than on the smooth curve.
 *
 * Measuring the curve instead would under-report: a curve dropping 1.2 blocks
 * per step still rounds to a tidy one-block staircase, so the deck is not
 * chunky yet. What matters is what actually gets built.
 */
function steepestStepFor(path, params, sag) {
  const levels = deckLevels(
    path.cells,
    params.start.y,
    params.end.y,
    sag,
    curveSettings(params.curve).shape,
    path.horizontalSpan,
    curveSettings(params.curve).perpendicular
  );
  return quantise(
    levels,
    { useSlabs: params.useSlabs, useStairs: params.useStairs },
    path.majorAxis,
    path.stepMajor
  ).steepestStep;
}

/**
 * The deepest sag this bridge can hold without any step being too big for the
 * blocks to express.
 *
 * Past this point the curve is dropping faster than half a block per step (or
 * a whole block, without slabs), so slabs stop helping and the deck goes
 * chunky. That is not a failure — a steep bridge genuinely is steppy — but it
 * is worth knowing where the line is, so the app draws it.
 *
 * Found by halving rather than by formula, because the answer depends on the
 * curve shape, the span and the height difference between the two ends all at
 * once.
 */
export function smoothSagLimit(userParams) {
  const params = normalise(userParams);
  validate(params);
  const path = planPath(params.start, params.end);
  const resolution = heightResolution(params.useSlabs);

  // Even with no sag at all, a steep climb between the two ends can already
  // out-run the blocks. Then there is no sag that stays smooth.
  if (steepestStepFor(path, params, 0) > resolution) return 0;

  let ok = 0;
  let tooMuch = Math.max(8, path.horizontalSpan);
  for (let i = 0; i < 40; i++) {
    const mid = (ok + tooMuch) / 2;
    if (steepestStepFor(path, params, mid) <= resolution) ok = mid;
    else tooMuch = mid;
  }
  // Round down, so the number shown is one you can actually dial in and still
  // be under the limit rather than a hair over it.
  return Math.floor(ok * 10) / 10;
}

export function buildBridge(userParams) {
  const params = normalise(userParams);
  validate(params);

  const path = planPath(params.start, params.end);
  const widened = applyWidth(path, params.width, params.compensateDiagonal);
  const curveReport = {};
  const levels = deckLevels(
    widened.cells,
    params.start.y,
    params.end.y,
    params.sag,
    curveSettings(params.curve).shape,
    path.horizontalSpan,
    curveSettings(params.curve).perpendicular,
    curveReport
  );
  const quantised = quantise(
    levels,
    { useSlabs: params.useSlabs, useStairs: params.useStairs },
    path.majorAxis,
    path.stepMajor
  );
  const heights = quantised.rows;

  // Merge the footprint and the height into the final rows.
  const rows = widened.cells.map((cell, i) => ({
    i: cell.i,
    t: cell.t,
    major: cell.major,
    minor: cell.minor,
    minorStart: cell.minorStart,
    minorEnd: cell.minorEnd,
    y: heights[i].y,
    bottom: heights[i].bottom,
    kind: heights[i].kind,
    half: heights[i].half,
    facing: heights[i].facing,
    exactLevel: levels[i],
    snappedLevel: quantised.snapped[i],
  }));

  const segments = analyseSegments(widened.cells, heights);

  // Counting is done from the rows, never by expanding blocks, so this stays
  // instant no matter how long the bridge is.
  const counts = { full: 0, slab: 0, stair: 0 };
  let blockCount = 0;
  let packingBlocks = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const row of rows) {
    const w = rowWidth(row);
    const total = rowBlockCount(row);
    counts[row.kind] += w; // the deck surface
    counts.full += total - w; // packing beneath it is always full blocks
    packingBlocks += total - w;
    blockCount += total;
    if (row.bottom < minY) minY = row.bottom;
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

  // What the sag actually came out as, measured square to the line between
  // the ends. That is the number the square-to-the-deck setting is holding to.
  const chordCos = path.horizontalSpan / Math.hypot(path.horizontalSpan, dy);
  const achievedSquare = Math.round(Math.abs(peakDeviation * chordCos) * 100) / 100;

  const warnings = [];
  if (curveReport.squareSagClamped) {
    warnings.push(
      `This span is too steep to tip a ${Math.abs(params.sag)} block sag onto it — past ` +
        `${Math.round(curveReport.squareSagLimit * 10) / 10} the curve would start travelling ` +
        `backwards, and a deck cannot double back on itself. It has been held at that ceiling. ` +
        `A longer span, a smaller height difference, or the plain hanging chain will all take more.`
    );
  }
  if (quantised.steepestStep > quantised.resolution) {
    warnings.push(
      `The curve drops faster than the blocks can follow — the steepest step is ` +
        `${quantised.steepestStep} blocks where ${quantised.resolution} is the finest available. ` +
        `The deck goes chunky through the steep parts, which is expected on a sag this deep.`
    );
  }
  if (packingBlocks > 0) {
    warnings.push(
      `${packingBlocks.toLocaleString()} extra block${packingBlocks === 1 ? '' : 's'} were added ` +
        `underneath to close gaps where the deck stepped down more than one block. Without them ` +
        `you could see straight through the bridge.`
    );
  }

  return {
    kind: 'bridge',
    params,
    majorAxis: path.majorAxis,
    minorAxis: path.minorAxis,
    stepMajor: path.stepMajor,
    stepMinor: path.stepMinor,
    travel: quantised.travel,
    width: widened.width,
    rows,
    segments,
    warnings,
    /**
     * Views walk the blocks through here, so the straight tool and the curved
     * one look identical to them. Rows are only expanded as they are visited,
     * which is what keeps a very long bridge cheap.
     */
    eachBlock(stride, fn) {
      let n = 0;
      for (const row of rows) {
        for (const block of rowBlocks({ majorAxis: path.majorAxis }, row)) {
          if (n++ % stride === 0) fn(block);
        }
      }
    },
    stats: {
      rowCount: rows.length,
      blockCount,
      counts,
      packingBlocks,
      width: widened.width,
      resolution: quantised.resolution,
      steepestStep: quantised.steepestStep,
      horizontalSpan: Math.round(path.horizontalSpan * 100) / 100,
      trueLength: Math.round(Math.hypot(path.horizontalSpan, dy) * 100) / 100,
      slopePercent: path.horizontalSpan ? Math.round((dy / path.horizontalSpan) * 1000) / 10 : 0,
      minY,
      maxY,
      heightRange: maxY - minY,
      peakDeviation: Math.round(peakDeviation * 100) / 100,
      peakDeviationAt: Math.round(peakDeviationAt * 1000) / 1000,
      /** Whether the sag was measured square to the slope rather than downward. */
      squareToDeck: curveSettings(params.curve).perpendicular,
      /**
       * The same bulge measured at right angles to the line between the ends.
       * On a sloped bridge this is the smaller of the two numbers, and it is
       * the one the square-to-the-deck setting is actually holding to.
       */
      perpendicularDeviation: achievedSquare,
      /** Deepest sag this slope can take square to the line, or null if unlimited. */
      squareSagCeiling: curveReport.squareSagLimit ?? null,
      lowestRow: rows.reduce((lowest, r) => (r.y < lowest.y ? r : lowest), rows[0]).i,
    },
  };
}
