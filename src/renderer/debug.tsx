import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DebugSnapshot } from '@shared/types';
import './styles/panel.css';

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour12: false });
}

function formatRemaining(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** §13.4 — dev-only panel. Built early; most development happens here. */
function DebugPanel(): JSX.Element {
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    const api = window.codexPanel;
    if (!api) return;
    void api.getDebugSnapshot().then(setSnapshot);
    return api.onDebugSnapshot(setSnapshot);
  }, []);

  if (!snapshot) return <div className="panel">Waiting for main…</div>;

  const events = [...snapshot.events].reverse();
  // Derived, not stored: the first known type is the default until one is picked.
  const activeType = selected || snapshot.knownEventTypes[0] || '';

  return (
    <div className="panel">
      <h1>Codex debug</h1>

      <section>
        <div className="row">
          <select value={activeType} onChange={(event) => setSelected(event.target.value)}>
            {snapshot.knownEventTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button onClick={() => activeType && window.codexPanel?.fireEvent(activeType)}>
            Fire synthetic event
          </button>
          <span className="muted grow">
            frequency: {snapshot.frequencyProfile} · deferred: {snapshot.deferred.length}
          </span>
        </div>
      </section>

      <h2>Suppression</h2>
      <section>
        <div className="row">
          <strong className={snapshot.suppression.suppressed ? 'urgent' : 'ambient'}>
            {snapshot.suppression.suppressed ? 'SUPPRESSED' : 'CLEAR'}
          </strong>
          <span className="muted">{snapshot.suppression.reason ?? 'no active reason'}</span>
          {snapshot.suppression.hardMute ? <span className="urgent">hard mute</span> : null}
        </div>
      </section>

      <h2>Cooldowns</h2>
      <section>
        {snapshot.cooldowns.length === 0 ? (
          <span className="muted">nothing on cooldown</span>
        ) : (
          <table>
            <thead>
              <tr>
                <th>key</th>
                <th>remaining</th>
                <th>window</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.cooldowns.map((entry) => (
                <tr key={entry.key}>
                  <td>
                    <code>{entry.key}</code>
                  </td>
                  <td>{formatRemaining(entry.remainingMs)}</td>
                  <td className="muted">{formatRemaining(entry.totalMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <h2>Events ({events.length})</h2>
      <section>
        <table>
          <thead>
            <tr>
              <th>time</th>
              <th>type</th>
              <th>priority</th>
              <th>payload</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td className="muted">{formatTime(event.at)}</td>
                <td>
                  <code>{event.type}</code>
                </td>
                <td className={event.priority}>{event.priority}</td>
                <td className="muted">{JSON.stringify(event.payload)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <DebugPanel />
    </StrictMode>
  );
}
