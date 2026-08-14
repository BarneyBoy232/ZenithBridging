/**
 * Widens the one-block centreline into a deck.
 *
 * The deck spreads sideways along the minor axis. For even widths there is no
 * true centre, so we always put the extra block on the minor-positive side —
 * an arbitrary choice, but a consistent one, so the same inputs always give
 * the same bridge.
 */

/**
 * @param {ReturnType<import('./path.js').planPath>} path
 * @param {number} width  deck width in blocks
 * @param {boolean} compensateDiagonal
 *        A deck widened along an axis looks narrower on a diagonal, because
 *        you are measuring across the corner rather than straight across.
 *        With this on, the width is scaled up so the bridge *looks* the width
 *        you asked for. Off by default — most players want the literal count.
 */
export function applyWidth(path, width, compensateDiagonal = false) {
  let w = Math.max(1, Math.round(width));

  if (compensateDiagonal && path.minorLen > 0) {
    const diagonal = Math.hypot(path.majorLen, path.minorLen);
    w = Math.max(1, Math.round(w * (diagonal / path.majorLen)));
  }

  const leftOfCentre = Math.floor((w - 1) / 2);

  return {
    width: w,
    requestedWidth: Math.max(1, Math.round(width)),
    cells: path.cells.map((cell) => ({
      ...cell,
      minorStart: cell.minor - leftOfCentre,
      minorEnd: cell.minor - leftOfCentre + w - 1,
    })),
  };
}
