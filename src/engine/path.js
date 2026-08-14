/**
 * Works out the centreline of the bridge across the ground plane.
 *
 * This is the bit that is genuinely painful by hand. Unless your two points
 * line up on an axis, the deck has to be a staircase of blocks, and picking
 * where each sideways step happens by eye is guesswork. Bresenham's line
 * algorithm — the same maths that draws a diagonal line out of square screen
 * pixels — gives the exact, evenly spread answer.
 */

import { BridgeError } from './model.js';

/**
 * @param {{x:number,y:number,z:number}} start
 * @param {{x:number,y:number,z:number}} end
 */
export function planPath(start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const a = Math.abs(dx);
  const b = Math.abs(dz);

  if (a === 0 && b === 0) {
    throw new BridgeError(
      'Start and end sit on the same spot horizontally. A bridge needs to travel ' +
        'across the ground, so the X or Z coordinates have to differ.'
    );
  }

  // The "major" axis is whichever the bridge travels further along. We take one
  // step per block on that axis, and drift sideways on the "minor" axis.
  const majorIsX = a >= b;
  const majorAxis = majorIsX ? 'x' : 'z';
  const minorAxis = majorIsX ? 'z' : 'x';
  const majorLen = majorIsX ? a : b;
  const minorLen = majorIsX ? b : a;

  const stepMajor = Math.sign(majorIsX ? dx : dz);
  const stepMinor = Math.sign(majorIsX ? dz : dx) || 1;
  const originMajor = majorIsX ? start.x : start.z;
  const originMinor = majorIsX ? start.z : start.x;

  // How far sideways we should have drifted by step i: rounded Bresenham.
  //
  // Worth knowing: a diagonal line cannot always be both evenly repeating and
  // mirror-symmetric at the same time. Where the drift lands exactly halfway
  // between two blocks, one property has to give. We keep the repeating one,
  // because an exact repeating tile is the strongest shortcut this app can
  // offer, and because the useful half of symmetry on a sagged bridge is the
  // height profile, which mirrors regardless of how the footprint drifts.
  const count = majorLen + 1;
  const cells = new Array(count);
  for (let i = 0; i < count; i++) {
    const drift = Math.round((i * minorLen) / majorLen);
    cells[i] = {
      i,
      t: i / majorLen, // 0 at the start of the bridge, 1 at the end
      major: originMajor + i * stepMajor,
      minor: originMinor + stepMinor * drift,
    };
  }

  return {
    majorAxis,
    minorAxis,
    majorLen,
    minorLen,
    stepMajor,
    stepMinor,
    cells,
    /** Straight-line distance across the ground, ignoring height. */
    horizontalSpan: Math.hypot(a, b),
  };
}
