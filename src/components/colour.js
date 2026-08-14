/**
 * One height-to-colour ramp, shared by the plan view and the 3D preview so a
 * block is the same colour wherever you look at it.
 *
 * Comma syntax rather than the modern space syntax, because the 3D library
 * parses colours itself and only understands the older form.
 */
export function levelColour(y, minY, maxY) {
  const v = maxY === minY ? 0.5 : (y - minY) / (maxY - minY);
  return `hsl(${Math.round(210 - 190 * v)}, 58%, ${Math.round(36 + 24 * v)}%)`;
}
