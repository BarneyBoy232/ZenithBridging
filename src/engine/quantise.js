/**
 * Turns the smooth curve into blocks you can actually place.
 *
 * Minecraft has no half-heights except slabs and no diagonals except stairs,
 * so the fractional heights coming out of curve.js have to be snapped onto
 * whatever the chosen block mode can express.
 *
 * A note on how heights are counted, because it is easy to get lost:
 * a "level" of N means a full block sitting in cell Y=N, whose walking
 * surface is therefore at N+1. A bottom slab sitting in cell Y has its
 * surface at Y+0.5, which is half a level lower than a full block there —
 * so a slab is how we express a level ending in .5.
 */

import { BLOCK_MODES, BridgeError, snapTo, directionFor, oppositeDirection } from './model.js';

/**
 * @param {number[]} levels   fractional deck heights, one per row
 * @param {string} modeId     key of BLOCK_MODES
 * @param {string} majorAxis  'x' or 'z'
 * @param {number} stepMajor  +1 or -1, the direction of travel
 */
export function quantise(levels, modeId, majorAxis, stepMajor) {
  const mode = BLOCK_MODES[modeId];
  if (!mode) throw new BridgeError(`Unknown block mode "${modeId}".`);

  const travel = directionFor(majorAxis, stepMajor);
  const snapped = levels.map((l) => snapTo(l, mode.step));

  // First pass: every row becomes a full block or a slab.
  const rows = snapped.map((level) => {
    if (Number.isInteger(level)) return { y: level, kind: 'full', facing: null };
    // A .5 level is a bottom slab, and it lives in the cell above the block
    // that would hold the level below it.
    return { y: Math.ceil(level), kind: 'slab', facing: null };
  });

  // Second pass: soften whole-block steps into stairs.
  let unsmoothedSteps = 0;
  if (mode.stairs) {
    for (let i = 1; i < rows.length; i++) {
      const change = snapped[i] - snapped[i - 1];
      if (change === 0) continue;

      if (Math.abs(change) !== 1) {
        // Steeper than one block per step — a single stair cannot bridge it,
        // so the row stays a full block and we tell the user about it.
        unsmoothedSteps++;
        continue;
      }

      // The stair always occupies the higher of the two cells, and always sits
      // on the row belonging to that higher level. Climbing, that is the row
      // you are stepping onto; descending, it is the row you are stepping off.
      // Getting that second case wrong is subtle but visible: put the stair on
      // the lower row instead and the ramps stop lining up when you walk the
      // bridge backwards, so an arch comes out lopsided.
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

  return { rows, snapped, unsmoothedSteps, travel };
}

/** The height you would stand on, for a given row. Used for analysis only. */
export function surfaceTop(row) {
  if (row.kind === 'slab') return row.y + 0.5;
  return row.y + 1;
}
