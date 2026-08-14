/**
 * The geometry of the Zenith Bridging mark, in one place.
 *
 * The mark is a real bridge. These block heights are not drawn by eye — they
 * are what the app's own engine returns for a nine-block span with a two-block
 * sag, quantised to whole blocks. That is why the middle is flat and the drop
 * happens near the ends: a hanging rope barely changes height across its
 * centre. Space the steps evenly instead and you get a V, which is a pair of
 * straight lines pretending to be a curve.
 *
 * Regenerate the profile with:
 *   buildBridge({ start: { x: 0, y: 0, z: 0 }, end: { x: 8, y: 0, z: 0 },
 *                 width: 1, sag: -2, curve: 'catenary', blockMode: 'full' })
 *
 * Kept free of JSX so the asset build script can share it, which is what stops
 * the header mark and the browser-tab icon from drifting apart.
 */

/** Depth of each column below the deck ends, straight from the engine. */
export const PROFILE = [0, 1, 2, 2, 2, 2, 2, 1, 0];

/** How many blocks thick the deck is. */
export const THICKNESS = 2;

/** Grid spacing and block size — the 1 unit difference is the gap. */
export const PITCH = 7;
export const BLOCK = 6;

export const WIDTH = (PROFILE.length - 1) * PITCH + BLOCK;
export const HEIGHT = (Math.max(...PROFILE) + THICKNESS - 1) * PITCH + BLOCK;

/** The single block at the lowest point of the centre column. */
const ACCENT_COLUMN = (PROFILE.length - 1) / 2;
const ACCENT_ROW = PROFILE[ACCENT_COLUMN] + THICKNESS - 1;

/** Every block in the mark, as plain data. */
export function logoBlocks() {
  const out = [];
  PROFILE.forEach((top, column) => {
    for (let n = 0; n < THICKNESS; n++) {
      const row = top + n;
      out.push({
        key: `${column}-${row}`,
        x: column * PITCH,
        y: row * PITCH,
        accent: column === ACCENT_COLUMN && row === ACCENT_ROW,
      });
    }
  });
  return out;
}
