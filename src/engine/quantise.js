/**
 * Turns the smooth curve into blocks you can actually place.
 *
 * Minecraft has no half-heights except slabs and no diagonals except stairs,
 * so the fractional heights coming out of curve.js have to be snapped onto
 * whatever the chosen blocks can express.
 *
 * A note on how heights are counted, because it is easy to get lost:
 * a "level" of N means a full block sitting in cell Y=N, whose walking
 * surface is therefore at N+1. A bottom slab sitting in cell Y has its
 * surface at Y+0.5, which is half a level lower than a full block there —
 * so a slab is how we express a level ending in .5.
 */

import { heightResolution, snapTo, directionFor, oppositeDirection } from './model.js';

/**
 * @param {number[]} levels   fractional deck heights, one per row
 * @param {{useSlabs:boolean, useStairs:boolean}} options
 * @param {string} majorAxis  'x' or 'z'
 * @param {number} stepMajor  +1 or -1, the direction of travel
 */
export function quantise(levels, options, majorAxis, stepMajor) {
  const { useSlabs = false, useStairs = false } = options || {};
  const resolution = heightResolution(useSlabs);
  const travel = directionFor(majorAxis, stepMajor);
  const snapped = levels.map((l) => snapTo(l, resolution));

  // First pass: every row becomes a full block or a slab.
  const rows = snapped.map((level) => {
    if (Number.isInteger(level)) return { y: level, kind: 'full', facing: null };
    // A .5 level is a bottom slab, and it lives in the cell above the block
    // that would hold the level below it.
    return { y: Math.ceil(level), kind: 'slab', facing: null };
  });

  // Second pass: soften whole-block steps into stairs.
  let unsmoothedSteps = 0;
  if (useStairs) {
    for (let i = 1; i < rows.length; i++) {
      const change = snapped[i] - snapped[i - 1];
      if (change === 0) continue;

      // A stair spans exactly one block of height, so it can only ramp a
      // whole-block step between two whole levels. Anything else is left as
      // it is rather than faked.
      const wholeStep =
        Math.abs(change) === 1 && Number.isInteger(snapped[i]) && Number.isInteger(snapped[i - 1]);
      if (!wholeStep) {
        if (Math.abs(change) > 1) unsmoothedSteps++;
        continue;
      }

      // The stair always occupies the higher of the two cells, and always sits
      // on the row belonging to that higher level. Climbing, that is the row
      // you are stepping onto; descending, it is the row you are stepping off.
      const rising = change > 0;
      const cell = Math.max(snapped[i], snapped[i - 1]);
      const facing = rising ? travel : oppositeDirection(travel);

      // A peak only one row wide would want to be both ramps at once. It can
      // only be one, so the climb keeps it and the descent shuffles forward.
      let target = rising ? i : i - 1;
      if (!rising && rows[target].kind === 'stair') target = i;

      rows[target] = { y: cell, kind: 'stair', facing };
    }
  }

  // Third pass: close any holes in the deck.
  //
  // Where the curve is steeper than the blocks can follow, two neighbouring
  // rows can end up two or more levels apart, leaving a gap you can see
  // through and fall between. Each column is extended downward just far
  // enough to meet its lower neighbour, and no further — a bridge with a
  // one-block step in it needs no filling at all.
  let filledBlocks = 0;
  for (let i = 0; i < rows.length; i++) {
    let bottom = rows[i].y;
    for (const j of [i - 1, i + 1]) {
      const neighbour = rows[j];
      if (!neighbour) continue;
      if (rows[i].y - neighbour.y >= 2) bottom = Math.min(bottom, neighbour.y + 1);
    }
    rows[i].bottom = bottom;
    filledBlocks += rows[i].y - bottom;
  }

  // How far apart neighbouring rows get. This is what decides whether the
  // chosen blocks were fine enough for the curve being asked for.
  let steepestStep = 0;
  for (let i = 1; i < snapped.length; i++) {
    steepestStep = Math.max(steepestStep, Math.abs(snapped[i] - snapped[i - 1]));
  }

  return { rows, snapped, unsmoothedSteps, filledBlocks, steepestStep, resolution, travel };
}

/** The height you would stand on, for a given row. Used for analysis only. */
export function surfaceTop(row) {
  if (row.kind === 'slab') return row.y + 0.5;
  return row.y + 1;
}
