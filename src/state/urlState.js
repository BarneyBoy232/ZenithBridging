/**
 * Keeps the bridge settings in the address bar.
 *
 * Costs nothing and means any bridge is shareable as a plain link — paste it
 * to a friend and they get your exact bridge, no accounts, no server.
 */

import { DEFAULT_PARAMS } from '../engine/build.js';

// Short keys so the link stays readable rather than turning into a wall of text.
const KEYS = {
  sx: ['start', 'x'],
  sy: ['start', 'y'],
  sz: ['start', 'z'],
  ex: ['end', 'x'],
  ey: ['end', 'y'],
  ez: ['end', 'z'],
  w: ['width'],
  sag: ['sag'],
  c: ['curve'],
  sl: ['useSlabs'],
  st: ['useStairs'],
  d: ['compensateDiagonal'],
};

export function paramsToQuery(params) {
  const q = new URLSearchParams();
  for (const [key, path] of Object.entries(KEYS)) {
    const value = path.reduce((o, k) => o?.[k], params);
    const fallback = path.reduce((o, k) => o?.[k], DEFAULT_PARAMS);
    if (value === fallback) continue; // leave defaults out of the link
    q.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  return q.toString();
}

export function queryToParams(search) {
  const q = new URLSearchParams(search);
  const params = {
    ...DEFAULT_PARAMS,
    start: { ...DEFAULT_PARAMS.start },
    end: { ...DEFAULT_PARAMS.end },
  };

  for (const [key, path] of Object.entries(KEYS)) {
    if (!q.has(key)) continue;
    const raw = q.get(key);
    const fallback = path.reduce((o, k) => o?.[k], DEFAULT_PARAMS);

    let value;
    if (typeof fallback === 'number') {
      value = Number(raw);
      if (!Number.isFinite(value)) continue;
    } else if (typeof fallback === 'boolean') {
      value = raw === '1' || raw === 'true';
    } else {
      value = raw;
    }

    const target = path.length === 2 ? params[path[0]] : params;
    target[path.at(-1)] = value;
  }

  return params;
}

export function writeQuery(params) {
  const query = paramsToQuery(params);
  const url = query ? `${location.pathname}?${query}` : location.pathname;
  history.replaceState(null, '', url);
}
