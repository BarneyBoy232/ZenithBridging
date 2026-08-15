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
 * The two extras you can allow on top of full blocks. Both are independent
 * tick boxes, because they do different jobs:
 *
 *  - Slabs halve the height of a step, so the curve can be twice as fine.
 *  - Stairs ramp a whole-block step, so it is smooth to walk and to look at.
 *
 * Neither changes what the bridge *is*, only how finely it can follow the
 * curve. Allowing slabs does not force half steps — where the curve is too
 * steep for a half step, a whole block is used and the deck simply gets
 * chunkier, which is the correct outcome rather than an error.
 */
export const BLOCK_OPTIONS = {
  slabs: {
    id: 'useSlabs',
    label: 'Allow slabs',
    hint: 'Half-height steps, so the curve is twice as smooth.',
  },
  stairs: {
    id: 'useStairs',
    label: 'Allow stairs',
    hint: 'Ramps whole-block steps instead of leaving them square.',
  },
};

/** The smallest height change the chosen blocks can express. */
export function heightResolution(useSlabs) {
  return useSlabs ? 0.5 : 1;
}

/**
 * The shape of the curve the deck follows between its two ends.
 *
 * `shape` is the maths; `perpendicular` is what the sag is measured against.
 * Off, it hangs straight down and gravity decides — on an uneven span the low
 * point drifts toward the lower end. On, the sag is measured at right angles
 * to the line between the ends, as though the ground ran parallel to the
 * bridge, so the bulge lies along the slope instead of hanging beneath it.
 *
 * On a level span the two are identical, because there the line between the
 * ends already is horizontal.
 */
export const CURVE_TYPES = {
  catenary: {
    id: 'catenary',
    shape: 'catenary',
    perpendicular: false,
    label: 'Hanging chain',
    hint: 'What a real rope does. Flat through the middle, steep at the ends, and on an uneven span the low point drifts toward the lower side.',
  },
  hanging: {
    id: 'hanging',
    shape: 'catenary',
    perpendicular: true,
    label: 'Hanging chain, square to the deck',
    hint: 'The same chain, but measured square to the slope rather than straight down — as if the ground ran parallel to the bridge. Symmetric, and the bulge follows the line rather than pooling at the bottom.',
  },
  parabola: {
    id: 'parabola',
    shape: 'parabola',
    perpendicular: false,
    label: 'Parabola',
    hint: 'What a rope does once a deck is hung off it. Very close to a chain, and perfectly even end to end.',
  },
  arc: {
    id: 'arc',
    shape: 'arc',
    perpendicular: false,
    label: 'Circular arc',
    hint: 'A slice of a circle. Climbs hard off the ends and flattens across the middle — the stone bridge look.',
  },
};

/** Curve settings, tolerating an unknown or missing id. */
export function curveSettings(id) {
  return CURVE_TYPES[id] || CURVE_TYPES.catenary;
}

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
 *
 * A row is a column, not a single block: the top of it is the deck, and
 * anything below is packing added to close a hole where the curve dropped
 * faster than the blocks could follow. Packing is always full blocks — it is
 * structure, not surface.
 */
export function rowBlocks(model, row) {
  const blocks = [];
  const majorIsX = model.majorAxis === 'x';
  const bottom = row.bottom ?? row.y;
  for (let m = row.minorStart; m <= row.minorEnd; m++) {
    for (let y = bottom; y <= row.y; y++) {
      const isDeck = y === row.y;
      blocks.push({
        x: majorIsX ? row.major : m,
        y,
        z: majorIsX ? m : row.major,
        kind: isDeck ? row.kind : 'full',
        half: isDeck ? row.half || null : null,
        facing: isDeck ? row.facing || null : null,
      });
    }
  }
  return blocks;
}

/** How wide a row is, across the deck. */
export function rowWidth(row) {
  return row.minorEnd - row.minorStart + 1;
}

/** How tall a row's column is, including any packing beneath the deck. */
export function rowDepth(row) {
  return row.y - (row.bottom ?? row.y) + 1;
}

/** How many blocks a row contains in total. */
export function rowBlockCount(row) {
  return rowWidth(row) * rowDepth(row);
}
