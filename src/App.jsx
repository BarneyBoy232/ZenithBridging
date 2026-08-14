import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { buildBridge } from './engine/build.js';
import { queryToParams, writeQuery } from './state/urlState.js';
import ControlPanel from './components/ControlPanel.jsx';
import Logo from './components/Logo.jsx';
import PlanView from './components/PlanView.jsx';
import SummaryPanel from './components/SummaryPanel.jsx';
import './App.css';

// The 3D library is by far the biggest thing here, and most visits never open
// the 3D tab. Loading it only when that tab is opened keeps the first paint
// small for everyone else.
const Preview3D = lazy(() => import('./components/Preview3D.jsx'));

const VIEWS = [
  { id: 'plan', label: 'Plan' },
  { id: '3d', label: '3D' },
];

export default function App() {
  // Settings come from the address bar, so a link restores an exact bridge.
  const [params, setParams] = useState(() => queryToParams(location.search));
  const [view, setView] = useState('plan');

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
        <ControlPanel params={params} setParams={setParams} />

        <div className="stage">
          {model ? (
            <>
              {/* Only the active view is mounted — a 3D scene left running in
                  the background costs frames for nothing. */}
              {view === 'plan' ? (
                <PlanView model={model} />
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
