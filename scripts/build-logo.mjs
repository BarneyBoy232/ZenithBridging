/**
 * Writes the logo asset files from the same profile the React component uses,
 * so the mark in the header, the file on disk and the browser-tab icon can
 * never drift apart.
 *
 * Run with: npm run logo
 */

import { writeFileSync } from 'node:fs';
import { BLOCK, HEIGHT, WIDTH, logoBlocks } from '../src/components/logoProfile.js';

function rects(colour, accentColour) {
  return logoBlocks()
    .map(
      (b) =>
        `<rect x="${b.x}" y="${b.y}" width="${BLOCK}" height="${BLOCK}" rx="1" fill="${
          b.accent ? accentColour : colour
        }"/>`
    )
    .join('');
}

// The bare mark. Takes its colour from wherever it is placed.
const mark =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" ` +
  `width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="Zenith Bridging">` +
  `<title>Zenith Bridging</title>` +
  rects('currentColor', 'var(--logo-accent, currentColor)') +
  `</svg>\n`;

// The browser-tab icon needs its own colours, because nothing surrounds it to
// inherit from, and it needs to be square with a little breathing room.
const pad = (WIDTH - HEIGHT) / 2;
const icon =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 ${-pad - 3} ${WIDTH + 6} ${WIDTH + 6}" ` +
  `role="img" aria-label="Zenith Bridging">` +
  `<title>Zenith Bridging</title>` +
  rects('#e6edf3', '#e6edf3') +
  `</svg>\n`;

writeFileSync(new URL('../public/logo.svg', import.meta.url), mark);
writeFileSync(new URL('../public/favicon.svg', import.meta.url), icon);

console.log(`logo.svg     ${WIDTH} x ${HEIGHT}`);
console.log(`favicon.svg  ${WIDTH + 6} square`);
