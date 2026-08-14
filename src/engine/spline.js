/**
 * A smooth path through a list of points in three dimensions.
 *
 * This is the curve behind the curved-bridge tool. It is a centripetal
 * Catmull-Rom spline, which is worth explaining because the choice matters:
 *
 *  - Catmull-Rom passes exactly THROUGH every point you give it, rather than
 *    being pulled vaguely toward them. Type a coordinate, the track goes
 *    through that block.
 *  - The "centripetal" part is how the curve is paced between points. The
 *    naive pacing makes the curve loop back on itself and form little knots
 *    when two points are close together and a third is far away — which on a
 *    boat track means a section that doubles back through itself. Centripetal
 *    pacing is mathematically guaranteed never to do that.
 *
 * It can still bulge slightly outside the box of points on a sharp corner, so
 * the caller is told when that happens rather than being left to find out.
 */

const EPSILON = 1e-6;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Knot spacing: the square root of the gap is what makes it centripetal. */
const knotGap = (a, b) => Math.max(EPSILON, Math.sqrt(distance(a, b)));

/**
 * One point on the curve, using the Barry-Goldman form. Reads as three rounds
 * of straight-line blending between neighbours, which is all it really is.
 */
function evaluate(p0, p1, p2, p3, t0, t1, t2, t3, t) {
  const mix = (a, b, ta, tb) => {
    const span = tb - ta;
    if (Math.abs(span) < EPSILON) return { ...a };
    return add(scale(a, (tb - t) / span), scale(b, (t - ta) / span));
  };

  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/**
 * Walk the curve, producing points roughly `spacing` blocks apart.
 *
 * Sampling this finely is not decoration — it is what stops the track having
 * holes. Consecutive samples closer together than one block always land in the
 * same or a touching block, so the path cannot skip over a gap.
 *
 * @param {{x:number,y:number,z:number}[]} points  at least two
 * @param {number} spacing  target distance between samples, in blocks
 */
export function sampleSpline(points, spacing = 0.25) {
  if (points.length < 2) return [];

  // Phantom points beyond each end give the first and last real segments a
  // tangent to work with, so the curve leaves the start and arrives at the
  // finish pointing the way you would expect.
  const pts = [
    add(points[0], sub(points[0], points[1])),
    ...points,
    add(points.at(-1), sub(points.at(-1), points.at(-2))),
  ];

  const samples = [];
  for (let i = 0; i + 3 < pts.length; i++) {
    const [p0, p1, p2, p3] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
    const t0 = 0;
    const t1 = t0 + knotGap(p0, p1);
    const t2 = t1 + knotGap(p1, p2);
    const t3 = t2 + knotGap(p2, p3);

    // Enough steps that samples land about `spacing` apart. The straight-line
    // distance understates a curved segment, so allow generously for it.
    const steps = Math.max(2, Math.ceil((distance(p1, p2) * 1.6) / spacing));
    const isLast = i + 4 === pts.length;
    for (let s = 0; s < steps + (isLast ? 1 : 0); s++) {
      const t = t1 + ((t2 - t1) * s) / steps;
      samples.push(evaluate(p0, p1, p2, p3, t0, t1, t2, t3, t));
    }
  }

  // Direction of travel at each sample, used to lay the deck across the path.
  for (let i = 0; i < samples.length; i++) {
    const back = samples[Math.max(0, i - 1)];
    const forward = samples[Math.min(samples.length - 1, i + 1)];
    const dx = forward.x - back.x;
    const dz = forward.z - back.z;
    const flat = Math.hypot(dx, dz) || 1;
    // The deck stays level across its width, so the direction that matters is
    // the horizontal one — a track climbing steeply should not bank sideways.
    samples[i].tangent = { x: dx / flat, z: dz / flat };
  }

  return samples;
}

/** The total distance travelled along a sampled curve. */
export function splineLength(samples) {
  let total = 0;
  for (let i = 1; i < samples.length; i++) total += distance(samples[i - 1], samples[i]);
  return total;
}

/** Smallest box containing every point, as two opposite corners. */
export function boundingBox(points) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    for (const axis of ['x', 'y', 'z']) {
      if (p[axis] < min[axis]) min[axis] = p[axis];
      if (p[axis] > max[axis]) max[axis] = p[axis];
    }
  }
  return { min, max };
}

/** Hold a point inside the box. */
export function clampToBox(point, box) {
  return {
    x: Math.min(box.max.x, Math.max(box.min.x, point.x)),
    y: Math.min(box.max.y, Math.max(box.min.y, point.y)),
    z: Math.min(box.max.z, Math.max(box.min.z, point.z)),
  };
}

/** Is this point inside the box, allowing for the width of a block? */
export function insideBox(point, box, margin = 0) {
  return ['x', 'y', 'z'].every(
    (a) => point[a] >= box.min[a] - margin && point[a] <= box.max[a] + margin
  );
}
