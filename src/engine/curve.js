/**
 * The height of the deck along the bridge.
 *
 * Sag is measured straight down, the way gravity pulls — exactly like holding
 * a rope at two points and letting it hang. It is NOT measured at right angles
 * to the line between the two ends. That distinction only matters when the two
 * ends sit at different heights, and it matters a lot: a real rope's lowest
 * point drifts toward the LOWER anchor, it does not sit at the halfway mark.
 *
 * So the deck height is built as:
 *   1. the straight line between the two ends (the "chord")
 *   2. minus a vertical drop below that line, deepest somewhere in the middle
 *
 * A negative sag drops below the chord like a rope. A positive sag lifts above
 * it into an arch, which is the same shape turned upside down — which is
 * precisely why real stone arches are built to that curve.
 */

import { BridgeError } from './model.js';

/**
 * The vertical drop below the chord, at position t along the bridge, for a
 * cable carrying a load spread evenly along its horizontal length. The drop is
 * a symmetric parabola no matter how much the two ends differ in height, which
 * is a genuinely useful property: it is exact, and needs no solving.
 */
function parabolaProfile(sag) {
  return (t) => sag * 4 * t * (1 - t);
}

/** A slice of a circle. Rises fast off the ends, flat across the middle. */
function arcProfile(sag) {
  return (t) => sag * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
}

/** sinh(u)/u, written so it stays accurate as u approaches zero. */
const sinhc = (u) => (Math.abs(u) < 1e-8 ? 1 : Math.sinh(u) / u);

/**
 * A true hanging chain, solved for the span, the height difference between the
 * ends, and how deep you want it to hang.
 *
 * The chain is y(x) = a·cosh((x - p)/a) + q, with two things to pin down:
 * `a` is how taut it is (bigger = tighter = shallower), and `p` is where its
 * lowest point sits, which slides sideways so the chain reaches both anchors.
 *
 * `p` has an exact answer, which is worth using rather than searching for:
 * rewriting the two-anchor condition with the identity
 *   cosh A − cosh B = 2·sinh((A+B)/2)·sinh((A−B)/2)
 * turns it into something asinh solves outright. That matters — on a steep
 * span the low point can sit an enormous distance off to one side, far beyond
 * where any sensible search would think to look.
 *
 * `a` has no exact answer, so it is found by halving between "nearly a
 * straight line" and "extremely slack" until the drop matches. Once per
 * bridge, so the cost is irrelevant.
 */
function catenaryProfile(span, rise, sag) {
  if (sag === 0 || span === 0) return () => 0;

  // The exact horizontal position of the chain's lowest point, for a given
  // tautness. 2a·sinh(span/2a) is written as span·sinhc(...) so it stays
  // well behaved when the chain is nearly straight.
  const lowPointFor = (a) => (span - 2 * a * Math.asinh(rise / (span * sinhc(span / (2 * a))))) / 2;

  // How far below the straight chord the chain hangs, at position x.
  // Written as a product rather than a difference of two coshes, because for
  // a slack chain those two are enormous and nearly equal, and subtracting
  // them throws away most of the precision.
  const dropAt = (a, p) => (x) =>
    (rise * x) / span - 2 * a * Math.sinh(x / (2 * a)) * Math.sinh((x - 2 * p) / (2 * a));

  const deepestDropFor = (a) => {
    const p = lowPointFor(a);
    const at = dropAt(a, p);
    // The furthest point from the chord is where the chain's slope matches
    // the chord's slope.
    const x = Math.min(span, Math.max(0, p + a * Math.asinh(rise / span)));
    return { drop: at(x), at };
  };

  // Tauter chain, shallower drop — so a plain halving search converges.
  let tight = span * 1e6; // effectively a straight line
  let slack = span / 100; // deeper than any sane bridge
  for (let i = 0; i < 200; i++) {
    const mid = (tight + slack) / 2;
    if (deepestDropFor(mid).drop > sag) slack = mid;
    else tight = mid;
  }

  const solved = deepestDropFor((tight + slack) / 2);
  // Scale the last sliver of numerical error away so the deepest point lands
  // exactly on the sag that was asked for.
  const correction = solved.drop === 0 ? 0 : sag / solved.drop;
  return (t) => solved.at(t * span) * correction;
}

const PROFILES = {
  parabola: (span, rise, sag) => parabolaProfile(sag),
  arc: (span, rise, sag) => arcProfile(sag),
  catenary: catenaryProfile,
};

/**
 * The exact, unrounded height of the deck at every step. Still fractional at
 * this stage — turning these into real blocks happens in quantise.js.
 *
 * @param {number} span  horizontal distance between the two ends, in blocks
 * @returns {number[]} one height per row, in block levels
 */
export function deckLevels(cells, startY, endY, sag, curveType, span, perpendicular = false) {
  const make = PROFILES[curveType];
  if (!make) throw new BridgeError(`Unknown curve type "${curveType}".`);

  const rise = endY - startY;
  const direction = Math.sign(sag);
  const depth = Math.abs(sag);

  if (!perpendicular) {
    // Gravity's answer: solved for this actual sloped span, and measured
    // straight down. On an uneven span the low point drifts toward the lower
    // end, exactly as a real rope does.
    const profile = make(span, rise, depth);
    return cells.map((cell) => startY + rise * cell.t + direction * profile(cell.t));
  }

  // Square to the deck instead. The curve is solved as though the two ends
  // were level — so it comes out symmetric, deepest at the halfway mark — and
  // then tilted along with the bridge. Think of sagging a flat bridge and
  // then lifting one end: the sag tilts with it rather than staying upright.
  //
  // The requested depth is the distance measured at right angles to the line
  // between the ends. Turning that into a straight-down offset means dividing
  // by the cosine of the slope, which is span over the true diagonal length.
  const diagonal = Math.hypot(span, rise);
  const stretch = span === 0 ? 1 : diagonal / span;
  const profile = make(span, 0, depth * stretch);

  return cells.map((cell) => startY + rise * cell.t + direction * profile(cell.t));
}
