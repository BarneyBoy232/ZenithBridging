/**
 * Turns the smooth curve into blocks you can actually place.
 *
 * Heights are counted as "levels", where a level of N means a deck whose
 * walking surface is at N+1. Which block delivers that surface depends on what
 * you allow:
 *
 *   full block in cell N    surface N+1, fills the whole cell
 *   top slab in cell N      surface N+1, fills only the upper half
 *   bottom slab in cell N   surface N+0.5, fills only the lower half
 *
 * That third one is why slabs give half-height steps. And the second is why,
 * on a gentle stretch, EVERY block can be a slab: alternating top and bottom
 * slabs walks up in half blocks without a full block anywhere. Where the curve
 * gets too steep for that, slabs stop being able to help and the deck falls
 * back to whole blocks — which is correct, not a failure.
 */

import { heightResolution, snapTo, directionFor, oppositeDirection } from './model.js';

/** The vertical space a row's own block occupies, as [bottom, top]. */
function occupancy(row) {
  if (row.kind === 'slab' && row.half === 'bottom') return [row.y, row.y + 0.5];
  if (row.kind === 'slab' && row.half === 'top') return [row.y + 0.5, row.y + 1];
  return [row.y, row.y + 1];
}

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

  // Is this stretch gentle enough for half-block steps to actually work?
  // Slabs can only ever express a half-block change, so where the deck moves
  // faster than that they have nothing to offer.
  const gentle = snapped.map((level, i) => {
    const back = i > 0 ? Math.abs(level - snapped[i - 1]) : 0;
    const forward = i < snapped.length - 1 ? Math.abs(snapped[i + 1] - level) : 0;
    return Math.max(back, forward) <= 0.5;
  });

  // First pass: choose the block that gives each row its surface.
  const rows = snapped.map((level, i) => {
    if (!Number.isInteger(level)) {
      // A half level can only be a bottom slab, whatever else is going on.
      return { y: Math.ceil(level), kind: 'slab', half: 'bottom', facing: null };
    }
    if (useSlabs && gentle[i]) {
      // A whole level on a gentle stretch becomes a TOP slab rather than a
      // full block. Same surface, but it keeps the deck entirely slabs.
      return { y: level, kind: 'slab', half: 'top', facing: null };
    }
    return { y: level, kind: 'full', half: null, facing: null };
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

      rows[target] = { y: cell, kind: 'stair', half: null, facing };
    }
  }

  // Third pass: close every hole in the deck.
  //
  // The subtle case, and the one that made a steep arch look like a comb:
  // two columns can END and BEGIN on consecutive levels and still not be
  // solid. A block at y=68 and a block at y=69 in the next column touch only
  // at their corner, and you can see daylight straight through that corner.
  // So neighbouring columns are not merely made to meet — they are made to
  // OVERLAP, sharing at least one level.
  //
  // Slabs are the exception: a top slab and the bottom slab above it are two
  // halves of the same boundary and genuinely do seal, which is what lets a
  // gentle bridge stay one block thick.
  let filledBlocks = 0;
  const spans = rows.map(occupancy);

  for (let i = 0; i < rows.length; i++) {
    const [low] = spans[i];
    let target = null;

    for (const j of [i - 1, i + 1]) {
      if (!rows[j]) continue;
      const [, neighbourTop] = spans[j];
      // Only worry about neighbours this column sits above.
      if (neighbourTop >= low) continue;
      target = target === null ? neighbourTop : Math.max(target, neighbourTop);
    }

    if (target === null) {
      rows[i].bottom = rows[i].y;
      continue;
    }

    // Packing is solid, so a top slab has to become a full block first —
    // otherwise the bottom half of its own cell is left hollow. This is why
    // slabs disappear on the steep flanks even when they are ticked on.
    if (rows[i].kind === 'slab' && rows[i].half === 'top') {
      rows[i] = { ...rows[i], kind: 'full', half: null };
    }

    rows[i].bottom = Math.min(rows[i].y, Math.floor(target));
    filledBlocks += rows[i].y - rows[i].bottom;
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
  if (row.kind === 'slab' && row.half === 'bottom') return row.y + 0.5;
  return row.y + 1;
}

/** Vertical extent of a whole column, packing included. */
export function columnSpan(row) {
  const [low, high] = occupancy(row);
  return [Math.min(low, row.bottom ?? low), high];
}
