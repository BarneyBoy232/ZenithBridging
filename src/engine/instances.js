/**
 * Turns bridge rows into the boxes the 3D preview draws.
 *
 * Kept apart from the preview component so it can be checked without a browser
 * or a graphics card — the shapes and their positions are geometry, and
 * geometry is testable.
 *
 * Every deck block becomes either one full box, or a half-height base box. A
 * stair is a base box plus a raised quarter on the side the deck climbs
 * toward, which is what gives it its shape.
 *
 * Positions come out RELATIVE to an origin near the bridge itself, not as raw
 * world coordinates. Minecraft worlds run to thirty million blocks out, and
 * graphics cards work in a number format that starts losing whole blocks of
 * precision long before that. Drawing near zero and remembering the offset
 * keeps a bridge at the edge of the world as crisp as one at spawn.
 */

import { levelColour } from '../components/colour.js';

/** Above this many boxes, rows get skipped rather than the browser choking. */
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
  const majorIsX = model.majorAxis === 'x';
  const rows = model.rows;

  const worldX = (row, m) => (majorIsX ? row.major : m);
  const worldZ = (row, m) => (majorIsX ? m : row.major);

  // Draw around a point near the bridge rather than around the world origin.
  const first = rows[0];
  const origin = {
    x: worldX(first, first.minor),
    y: minY,
    z: worldZ(first, first.minor),
  };

  // Thin the bridge out rather than trying to draw a million boxes. Counted
  // from the real block total, so a bridge with deep packing thins out sooner.
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

  const track = (x, y, z) => {
    if (x < bounds.minX) bounds.minX = x;
    if (x > bounds.maxX) bounds.maxX = x;
    if (y < bounds.minY) bounds.minY = y;
    if (y > bounds.maxY) bounds.maxY = y;
    if (z < bounds.minZ) bounds.minZ = z;
    if (z > bounds.maxZ) bounds.maxZ = z;
  };

  for (let i = 0; i < rows.length; i += stride) {
    const row = rows[i];
    const colour = levelColour(row.y, minY, maxY);

    for (let m = row.minorStart; m <= row.minorEnd; m++) {
      // Block centres, shifted so the bridge sits near zero.
      const x = worldX(row, m) - origin.x + 0.5;
      const z = worldZ(row, m) - origin.z + 0.5;
      const y = row.y - origin.y;

      // Packing beneath the deck, where a hole would otherwise show through.
      // Always whole blocks, so it goes in with the full boxes.
      for (let fill = row.bottom ?? row.y; fill < row.y; fill++) {
        const fy = fill - origin.y + 0.5;
        full.push({ x, y: fy, z, colour });
        track(x, fy, z);
      }

      if (row.kind === 'full') {
        full.push({ x, y: y + 0.5, z, colour });
        track(x, y + 0.5, z);
        continue;
      }

      // Both slabs and stairs stand on a half-height base.
      slab.push({ x, y: y + 0.25, z, colour });
      track(x, y + 0.25, z);

      if (row.kind === 'stair') {
        const [ox, oz] = STEP_OFFSET[row.facing] || [0.5, 0.5];
        // A step offset sideways splits the cell along x, one offset
        // front-to-back splits it along z. They need different box shapes.
        const target = ox === 0.5 ? stepZ : stepX;
        const sx = x - 0.5 + ox;
        const sy = y + 0.75;
        const sz = z - 0.5 + oz;
        target.push({ x: sx, y: sy, z: sz, colour });
        track(sx, sy, sz);
      }
    }
  }

  // The straight, no-sag route between the two ends, for comparison. Drawn one
  // block above the deck blocks so it sits at walking height.
  const last = rows[rows.length - 1];
  const chord = [
    [
      worldX(first, first.minor) - origin.x + 0.5,
      model.params.start.y - origin.y + 1,
      worldZ(first, first.minor) - origin.z + 0.5,
    ],
    [
      worldX(last, last.minor) - origin.x + 0.5,
      model.params.end.y - origin.y + 1,
      worldZ(last, last.minor) - origin.z + 0.5,
    ],
  ];

  for (const [cx, cy, cz] of chord) track(cx, cy, cz);

  return { full, slab, stepX, stepZ, stride, origin, bounds, chord, worldMinY: minY, worldMaxY: maxY };
}
