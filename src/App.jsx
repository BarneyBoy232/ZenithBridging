import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { buildBridge, smoothSagLimit } from './engine/build.js';
import { queryToParams, writeQuery } from './state/urlState.js';
import ControlPanel from './components/ControlPanel.jsx';
import Logo from './components/Logo.jsx';
import PlanView, { PLANES } from './components/PlanView.jsx';
import SummaryPanel from './components/SummaryPanel.jsx';
import './App.css';

// The 3D library is by far the biggest thing here, and most visits never open
// the 3D tab. Loading it only when that tab is opened keeps the first paint
// small for everyone else.
const Preview3D = lazy(() => import('./components/Preview3D.jsx'));

const VIEWS = [
  ...Object.values(PLANES).map((p) => ({ id: p.id, label: p.label, flat: true })),
  { id: '3d', label: '3D', flat: false },
];

export default function App() {
  // Settings come from the address bar, so a link restores an exact bridge.
  const [params, setParams] = useState(() => queryToParams(location.search));
  const [view, setView] = useState('top');

  useEffect(() => {
    writeQuery(params);
  }, [params]);

  // Rebuilding is fast enough to do on every keystroke — a 5000-block bridge
  // takes about ten milliseconds.
  const { model, error } = useMemo(() => {
    try {
      return { model: buildBridge(params), error: null };
    } catch (e) {
      return { model: null, error: e.message };
    }
  }, [params]);

  // How deep the sag can go before the blocks stop being able to follow it.
  const sagLimit = useMemo(() => {
    try {
      return smoothSagLimit(params);
    } catch {
      return null;
    }
  }, [params]);

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
      </header>

      <main className="app-body">
        <ControlPanel params={params} setParams={setParams} sagLimit={sagLimit} />

        <div className="stage">
          {model ? (
            <>
              {/* Only the active view is mounted — a 3D scene left running in
                  the background costs frames for nothing. */}
              {active.flat ? (
                <PlanView key={view} model={model} plane={view} />
              ) : (
                <Suspense fallback={<div className="empty-state">Loading the 3D view…</div>}>
                  <Preview3D model={model} />
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

        {model && <SummaryPanel model={model} />}
      </main>
    </div>
  );
}
