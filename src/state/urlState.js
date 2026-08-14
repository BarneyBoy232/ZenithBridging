/**
 * Keeps the settings in the address bar.
 *
 * Costs nothing and means any build is shareable as a plain link — paste it to
 * a friend and they get your exact bridge, no accounts, no server.
 */

import { DEFAULT_PARAMS } from '../engine/build.js';
import { DEFAULT_TRACK_PARAMS } from '../engine/splineTrack.js';

// Short keys so the link stays readable rather than turning into a wall of text.
const BRIDGE_KEYS = {
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

const encodePoints = (points) => points.map((p) => `${p.x}_${p.y}_${p.z}`).join('.');

const decodePoints = (raw) => {
  const points = raw
    .split('.')
    .map((chunk) => chunk.split('_').map(Number))
    .filter((n) => n.length === 3 && n.every(Number.isFinite))
    .map(([x, y, z]) => ({ x, y, z }));
  return points.length >= 2 ? points : null;
};

const encodeBox = (box) =>
  `${box.min.x}_${box.min.y}_${box.min.z}.${box.max.x}_${box.max.y}_${box.max.z}`;

const decodeBox = (raw) => {
  const points = decodePoints(raw);
  return points && points.length === 2 ? { min: points[0], max: points[1] } : null;
};

export function defaultState() {
  return {
    tool: 'bridge',
    bridge: {
      ...DEFAULT_PARAMS,
      start: { ...DEFAULT_PARAMS.start },
      end: { ...DEFAULT_PARAMS.end },
    },
    track: {
      ...DEFAULT_TRACK_PARAMS,
      points: DEFAULT_TRACK_PARAMS.points.map((p) => ({ ...p })),
    },
  };
}

export function paramsToQuery(state) {
  const q = new URLSearchParams();
  if (state.tool !== 'bridge') q.set('tool', state.tool);

  for (const [key, path] of Object.entries(BRIDGE_KEYS)) {
    const value = path.reduce((o, k) => o?.[k], state.bridge);
    const fallback = path.reduce((o, k) => o?.[k], DEFAULT_PARAMS);
    if (value === fallback) continue; // leave defaults out of the link
    q.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }

  const track = state.track;
  if (encodePoints(track.points) !== encodePoints(DEFAULT_TRACK_PARAMS.points)) {
    q.set('pts', encodePoints(track.points));
  }
  if (track.width !== DEFAULT_TRACK_PARAMS.width) q.set('tw', String(track.width));
  if (track.useSlabs !== DEFAULT_TRACK_PARAMS.useSlabs) q.set('tsl', track.useSlabs ? '1' : '0');
  if (track.box) q.set('box', encodeBox(track.box));

  return q.toString();
}

export function queryToParams(search) {
  const q = new URLSearchParams(search);
  const state = defaultState();

  if (q.get('tool') === 'track') state.tool = 'track';

  for (const [key, path] of Object.entries(BRIDGE_KEYS)) {
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

    const target = path.length === 2 ? state.bridge[path[0]] : state.bridge;
    target[path.at(-1)] = value;
  }

  if (q.has('pts')) {
    const points = decodePoints(q.get('pts'));
    if (points) state.track.points = points;
  }
  if (q.has('tw')) {
    const w = Number(q.get('tw'));
    if (Number.isFinite(w) && w >= 1) state.track.width = w;
  }
  if (q.has('tsl')) state.track.useSlabs = q.get('tsl') === '1';
  if (q.has('box')) {
    const box = decodeBox(q.get('box'));
    if (box) state.track.box = box;
  }

  return state;
}

export function writeQuery(state) {
  const query = paramsToQuery(state);
  const url = query ? `${location.pathname}?${query}` : location.pathname;
  history.replaceState(null, '', url);
}
