/**
 * Finds the shortcuts — the parts of the bridge you do not have to work out
 * twice.
 *
 * There are three, and which ones exist depends entirely on the bridge:
 *
 *  1. An exact repeating tile. Only possible on a bridge with no sag, because
 *     a curve is not periodic — nothing about it repeats. When it exists it is
 *     the best possible answer: build once, copy N times.
 *  2. Mirror symmetry. Any curve with level ends is the same forwards and
 *     backwards, so the second half is the first half in reverse. Available on
 *     far more bridges than an exact tile, and still halves the work.
 *  3. Run-length rows. "Rows 1-7 are identical, then it steps up." Always
 *     available, and in practice the most useful thing to read mid-build.
 *
 * Where none apply, we say so rather than inventing a pattern.
 */

/**
 * Look for the shortest chunk of bridge that, repeated, reproduces the whole
 * thing. Checked by brute force rather than by formula, so the answer is
 * proven rather than assumed.
 */
export function findExactTile(cells, rows) {
  const n = cells.length;
  const span = n - 1; // number of steps taken, one fewer than the row count
  if (span < 2) return null;

  for (let p = 1; p < span; p++) {
    if (span % p !== 0) continue;

    const shiftMinor = cells[p].minor - cells[0].minor;
    const shiftY = rows[p].y - rows[0].y;

    let matches = true;
    for (let i = 0; i + p < n; i++) {
      if (
        cells[i + p].minor - cells[i].minor !== shiftMinor ||
        rows[i + p].y - rows[i].y !== shiftY ||
        rows[i + p].bottom - rows[i].bottom !== shiftY ||
        rows[i + p].kind !== rows[i].kind ||
        rows[i + p].facing !== rows[i].facing
      ) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return {
        length: p, // rows in one tile
        repeats: span / p, // how many times it is laid down
        shiftMinor, // sideways drift added by each tile
        shiftY, // height added by each tile
        rowIndices: [0, p - 1], // which rows make up the tile
      };
    }
  }

  return null;
}

/**
 * Is the bridge the same read backwards?
 *
 * Two separate questions, because they do not always agree:
 *
 *  - heights:   does the height profile mirror? True for any curve whose two
 *               ends sit at the same height. This is the useful one — it means
 *               you can read the second half's heights off the first half.
 *  - footprint: does the sideways drift mirror too? Often false on diagonals,
 *               because where the drift lands exactly halfway between two
 *               blocks it has to commit to one, and that choice cannot be
 *               symmetric and evenly repeating at once.
 */
export function findSymmetry(cells, rows) {
  const n = cells.length;
  if (n < 3) return { heights: false, footprint: false };

  const totalDrift = cells[n - 1].minor - cells[0].minor;
  let heights = true;
  let footprint = true;

  for (let i = 0; i < n; i++) {
    const j = n - 1 - i;

    if (rows[i].y !== rows[j].y || rows[i].kind !== rows[j].kind) heights = false;

    // The exact middle row is its own mirror, so there is nothing to compare
    // its sideways position against. On a bridge that drifts an odd number of
    // blocks over an even number of steps, that one row can never sit
    // symmetrically — half a block does not exist. Skipping it is correct.
    if (i === j) continue;

    const fromStart = cells[i].minor - cells[0].minor;
    const fromEnd = totalDrift - (cells[j].minor - cells[0].minor);
    if (fromStart !== fromEnd) footprint = false;
  }

  return { heights, footprint };
}

/**
 * Collapse runs of identical rows. This is the build guide most people
 * actually follow: "eight the same, then step up".
 */
export function runLengthRows(rows) {
  const runs = [];
  let current = null;

  rows.forEach((row, i) => {
    const same =
      current &&
      current.y === row.y &&
      current.bottom === row.bottom &&
      current.kind === row.kind &&
      current.facing === row.facing;

    if (same) {
      current.end = i;
      current.count++;
    } else {
      current = {
        start: i,
        end: i,
        count: 1,
        y: row.y,
        bottom: row.bottom,
        kind: row.kind,
        facing: row.facing,
      };
      runs.push(current);
    }
  });

  return runs;
}

/** Everything the UI needs to describe the bridge's structure in one object. */
export function analyseSegments(cells, rows) {
  const tile = findExactTile(cells, rows);
  const symmetry = findSymmetry(cells, rows);
  const runs = runLengthRows(rows);
  const distinctLevels = new Set(rows.map((r) => `${r.y}:${r.kind}`)).size;

  return {
    tile,
    symmetry,
    /** Shorthand for the useful half: does the height profile mirror? */
    symmetric: symmetry.heights,
    runs,
    distinctLevels,
    /** Which shortcut to lead with in the UI. */
    best: tile
      ? 'tile'
      : symmetry.heights
        ? 'symmetry'
        : runs.length < rows.length
          ? 'runs'
          : 'none',
  };
}
