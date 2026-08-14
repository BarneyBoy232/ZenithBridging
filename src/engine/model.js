/**
 * Shared types, constants and small helpers for the bridge engine.
 *
 * The single most important idea in this whole app:
 * a bridge is stored as ROWS, not blocks.
 *
 * One row = one step along the longer horizontal axis. It knows its height,
 * its block type, and the span of cells it covers sideways. A 10,000-block
 * bridge is 10,000 small objects instead of 10,000 x width blocks, which is
 * what lets the app handle bridges of any length without falling over.
 * Individual blocks only ever get created at export time.
 */

/** Thrown for inputs we cannot build a bridge from. Message is user-facing. */
export class BridgeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BridgeError';
  }
}

/**
 * How much vertical detail each block mode can represent.
 *
 * `step` is the smallest height change the mode can express. Slabs halve it,
 * which is why they read as twice as smooth. Stairs do not add height detail —
 * they only smooth a whole-block step into a ramp — so stair mode stays on
 * whole levels. Mixing the two does not line up: a stair spans exactly one
 * block of height, so it cannot bridge a half-block change.
 */
export const BLOCK_MODES = {
  full: {
    id: 'full',
    label: 'Full blocks only',
    hint: 'Chunky, stepped. Buildable with one material.',
    step: 1,
    stairs: false,
  },
  slabs: {
    id: 'slabs',
    label: 'Blocks + slabs',
    hint: 'Half-block height detail. Twice as smooth a curve.',
    step: 0.5,
    stairs: false,
  },
  stairs: {
    id: 'stairs',
    label: 'Blocks + stairs',
    hint: 'Whole-block heights, but every step ramped. Smoothest to walk and look at.',
    step: 1,
    stairs: true,
  },
};

/**
 * The shape of the curve the deck follows between its two ends.
 * All three measure sag straight down, the way a rope hangs.
 */
export const CURVE_TYPES = {
  catenary: {
    id: 'catenary',
    label: 'Hanging chain',
    hint: 'What a real rope does. Flat through the middle, steep at the ends. On an uneven span the low point drifts toward the lower side, as it should.',
  },
  parabola: {
    id: 'parabola',
    label: 'Parabola',
    hint: 'What a rope does once a deck is hung off it. Very close to a chain, and perfectly even end to end.',
  },
  arc: {
    id: 'arc',
    label: 'Circular arc',
    hint: 'A slice of a circle. Climbs hard off the ends and flattens across the middle — the stone bridge look.',
  },
};

/**
 * Stair direction is stored as a compass direction meaning "the way the deck
 * rises". Turning that into an actual blockstate string is the job of the
 * dialect layer, so if a game version words it differently we change one file.
 */
export const DIRECTIONS = {
  east: { id: 'east', dx: 1, dz: 0 },
  west: { id: 'west', dx: -1, dz: 0 },
  south: { id: 'south', dx: 0, dz: 1 },
  north: { id: 'north', dx: 0, dz: -1 },
};

/** Compass direction for a step along an axis. */
export function directionFor(axis, step) {
  if (axis === 'x') return step >= 0 ? 'east' : 'west';
  return step >= 0 ? 'south' : 'north';
}

/** The opposite compass direction. */
export function oppositeDirection(dir) {
  return { east: 'west', west: 'east', north: 'south', south: 'north' }[dir];
}

/** Snap a value to the nearest multiple of `step` (e.g. 0.5 for slabs). */
export function snapTo(value, step) {
  return Math.round(value / step) * step;
}

/** Greatest common divisor, used when hunting for a repeating segment. */
export function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Turn one row into the real world blocks it represents.
 * This is the only place rows get expanded, and it happens on demand.
 */
export function rowBlocks(model, row) {
  const blocks = [];
  const majorIsX = model.majorAxis === 'x';
  for (let m = row.minorStart; m <= row.minorEnd; m++) {
    blocks.push({
      x: majorIsX ? row.major : m,
      y: row.y,
      z: majorIsX ? m : row.major,
      kind: row.kind,
      facing: row.facing || null,
    });
  }
  return blocks;
}

/** How many blocks a row contains. */
export function rowWidth(row) {
  return row.minorEnd - row.minorStart + 1;
}
