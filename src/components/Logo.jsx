/**
 * The Zenith Bridging mark: a two-block-thick deck sagging like a real rope,
 * with the block at the lowest point picked out in the accent colour.
 *
 * The shape itself lives in logoProfile.js — see there for why the middle is
 * flat rather than pointed.
 */

import { BLOCK, HEIGHT, WIDTH, logoBlocks } from './logoProfile.js';

const BLOCKS = logoBlocks();

export default function Logo({ height = 26, title = 'Zenith Bridging' }) {
  return (
    <svg
      className="logo"
      height={height}
      width={(height * WIDTH) / HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={title}
    >
      {BLOCKS.map((b) => (
        <rect
          key={b.key}
          x={b.x}
          y={b.y}
          width={BLOCK}
          height={BLOCK}
          rx="1"
          fill={b.accent ? 'var(--logo-accent, currentColor)' : 'currentColor'}
        />
      ))}
    </svg>
  );
}
