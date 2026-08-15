import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { buildBridge, smoothSagLimit } from './engine/build.js';
import { buildTrack, resolveBox } from './engine/splineTrack.js';
import { queryToParams, writeQuery } from './state/urlState.js';
import ControlPanel from './components/ControlPanel.jsx';
import Logo from './components/Logo.jsx';
import PlanView, { PLANES } from './components/PlanView.jsx';
import SummaryPanel from './components/SummaryPanel.jsx';
import TrackPanel from './components/TrackPanel.jsx';
import './App.css';

// The 3D library is by far the biggest thing here, and most visits never open
// the 3D tab. Loading it only when that tab is opened keeps the first paint
// small for everyone else.
const Preview3D = lazy(() => import('./components/Preview3D.jsx'));

const VIEWS = [
  ...Object.values(PLANES).map((p) => ({ id: p.id, label: p.label, flat: true })),
  { id: '3d', label: '3D', flat: false },
];

const TOOLS = [
  { id: 'bridge', label: 'Straight bridge' },
  { id: 'track', label: 'Curved path' },
];

export default function App() {
  // Settings come from the address bar, so a link restores an exact build.
  const [state, setState] = useState(() => queryToParams(location.search));
  const [view, setView] = useState('top');
  const [highlight, setHighlight] = useState(null);

  useEffect(() => {
    writeQuery(state);
  }, [state]);

  const { tool } = state;
  const params = tool === 'bridge' ? state.bridge : state.track;
  const setParams = (next) => setState((s) => ({ ...s, [tool]: next }));

  // Rebuilding is fast enough to do on every keystroke — a 5000-block bridge
  // takes about ten milliseconds.
  const { model, error } = useMemo(() => {
    try {
      return {
        model: tool === 'bridge' ? buildBridge(state.bridge) : buildTrack(state.track),
        error: null,
      };
    } catch (e) {
      return { model: null, error: e.message };
    }
  }, [tool, state.bridge, state.track]);

  // How deep the sag can go before the blocks stop being able to follow it.
  const sagLimit = useMemo(() => {
    if (tool !== 'bridge') return null;
    try {
      return smoothSagLimit(state.bridge);
    } catch {
      return null;
    }
  }, [tool, state.bridge]);

  const box = useMemo(() => {
    try {
      return resolveBox(state.track);
    } catch {
      return null;
    }
  }, [state.track]);

  const active = VIEWS.find((v) => v.id === view);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <Logo height={26} />
          <div className="brand-text">
            <h1>Zenith Bridging</h1>
            <p>Two coordinates in. A buildable bridge out.</p>
          </div>
        </div>

        <div className="tool-switch">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tool === t.id ? 'tab active' : 'tab'}
              onClick={() => setState((s) => ({ ...s, tool: t.id }))}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="app-body">
        {tool === 'bridge' ? (
          <ControlPanel params={params} setParams={setParams} sagLimit={sagLimit} />
        ) : (
          <TrackPanel params={params} setParams={setParams} box={box} />
        )}

        <div className="stage">
          {model ? (
            <>
              {/* Only the active view is mounted — a 3D scene left running in
                  the background costs frames for nothing. */}
              {active.flat ? (
                <PlanView
                  key={`${tool}-${view}`}
                  model={model}
                  plane={view}
                  highlight={highlight}
                  points={tool === 'track' ? state.track.points : null}
                  onPointsChange={
                    tool === 'track' ? (points) => setParams({ ...state.track, points }) : null
                  }
                  box={tool === 'track' ? box : null}
                />
              ) : (
                <Suspense fallback={<div className="empty-state">Loading the 3D view…</div>}>
                  <Preview3D model={model} highlight={highlight} />
                </Suspense>
              )}
              <div className="view-tabs">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={view === v.id ? 'tab active' : 'tab'}
                    onClick={() => setView(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <h2>Cannot build that</h2>
              <p>{error}</p>
            </div>
          )}
        </div>

        {model && <SummaryPanel model={model} highlight={highlight} setHighlight={setHighlight} />}
      </main>
    </div>
  );
}
