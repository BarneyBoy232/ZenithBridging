/**
 * Turns a build into the boxes the 3D preview draws.
 *
 * Kept apart from the preview component so it can be checked without a browser
 * or a graphics card — the shapes and their positions are geometry, and
 * geometry is testable.
 *
 * Every block becomes either one full box, or a half-height base box. A stair
 * is a base box plus a raised quarter on the side the deck climbs toward,
 * which is what gives it its shape.
 *
 * Positions come out RELATIVE to an origin near the build, not as raw world
 * coordinates. Minecraft worlds run to thirty million blocks out, and graphics
 * cards work in a number format that starts losing whole blocks of precision
 * long before that. Drawing near zero and remembering the offset keeps a
 * bridge at the edge of the world as crisp as one at spawn.
 */

import { levelColour } from '../components/colour.js';

/** Above this many boxes, blocks get skipped rather than the browser choking. */
export const INSTANCE_BUDGET = 150000;

/**
 * Where the raised part of a stair sits within its block, as a fraction across
 * the cell. A stair rising east has its tall side to the east.
 */
export const STEP_OFFSET = {
  east: [0.75, 0.5],
  west: [0.25, 0.5],
  south: [0.5, 0.75],
  north: [0.5, 0.25],
};

export function buildInstances(model, budget = INSTANCE_BUDGET) {
  const { minY, maxY } = model.stats;

  // Thin it out rather than trying to draw a million boxes.
  const stride = Math.max(1, Math.ceil(model.stats.blockCount / budget));

  const full = [];
  const slab = [];
  const stepX = [];
  const stepZ = [];
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };

  // Draw around a point near the build rather than around the world origin.
  let origin = null;

  const track = (x, y, z) => {
    if (x < bounds.minX) bounds.minX = x;
    if (x > bounds.maxX) bounds.maxX = x;
    if (y < bounds.minY) bounds.minY = y;
    if (y > bounds.maxY) bounds.maxY = y;
    if (z < bounds.minZ) bounds.minZ = z;
    if (z > bounds.maxZ) bounds.maxZ = z;
  };

  model.eachBlock(stride, (block) => {
    if (!origin) origin = { x: block.x, y: minY, z: block.z };

    const x = block.x - origin.x + 0.5;
    const z = block.z - origin.z + 0.5;
    const y = block.y - origin.y;
    const colour = levelColour(block.y, minY, maxY);

    if (block.kind === 'full') {
      full.push({ x, y: y + 0.5, z, colour });
      track(x, y + 0.5, z);
      return;
    }

    // Both slabs and stairs stand on a half-height base.
    slab.push({ x, y: y + 0.25, z, colour });
    track(x, y + 0.25, z);

    if (block.kind === 'stair') {
      const [ox, oz] = STEP_OFFSET[block.facing] || [0.5, 0.5];
      // A step offset sideways splits the cell along x, one offset
      // front-to-back splits it along z. They need different box shapes.
      const target = ox === 0.5 ? stepZ : stepX;
      const sx = x - 0.5 + ox;
      const sy = y + 0.75;
      const sz = z - 0.5 + oz;
      target.push({ x: sx, y: sy, z: sz, colour });
      track(sx, sy, sz);
    }
  });

  origin = origin || { x: 0, y: minY, z: 0 };

  // The straight, no-sag route between the two ends, for comparison. Only the
  // straight tool has one — a curved path has no "straight version" to show.
  let chord = null;
  if (model.kind === 'bridge') {
    const rows = model.rows;
    const majorIsX = model.majorAxis === 'x';
    const at = (row, worldY) => [
      (majorIsX ? row.major : row.minor) - origin.x + 0.5,
      worldY - origin.y + 1,
      (majorIsX ? row.minor : row.major) - origin.z + 0.5,
    ];
    chord = [at(rows[0], model.params.start.y), at(rows.at(-1), model.params.end.y)];
    for (const [cx, cy, cz] of chord) track(cx, cy, cz);
  }

  return { full, slab, stepX, stepZ, stride, origin, bounds, chord };
}
