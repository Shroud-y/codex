import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { FrequencyProfile, Settings, SkinId } from '@shared/types';
import { SKIN_IDS } from '@shared/types';
import './styles/panel.css';

const FREQUENCIES: FrequencyProfile[] = ['chatty', 'balanced', 'reserved', 'rare'];
const SKIN_LABELS: Record<SkinId, string> = { eye: 'Eye' };
const MONITOR_LABELS: Record<string, string> = {
  system: 'System (CPU, memory, disk, thermal, battery)',
  process: 'Processes (watchlist)',
  idle: 'Idle / return',
  schedule: 'Schedule (time of day, breaks, uptime)',
  session: 'Session (startup, lock, resume)',
  file: 'Files (downloads, builds)'
};

/** A config screen, not a product surface (§15). */
function SettingsPanel(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    const api = window.codexPanel;
    if (!api) return;
    void api.getSettings().then(setSettings);
    return api.onSettingsUpdated(setSettings);
  }, []);

  if (!settings) return <div className="panel">Loading…</div>;

  const patch = (change: Partial<Settings>): void => {
    const next = { ...settings, ...change };
    setSettings(next);
    void window.codexPanel?.setSettings(change).then(setSettings);
  };

  return (
    <div className="panel">
      <h1>SHARD settings</h1>

      <h2>General</h2>
      <section>
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={settings.startWithSystem}
              onChange={(event) => patch({ startWithSystem: event.target.checked })}
            />
            Start with Windows
          </label>
        </div>
        <div className="row">
          <label>
            Frequency
            <select
              value={settings.frequencyProfile}
              onChange={(event) =>
                patch({ frequencyProfile: event.target.value as FrequencyProfile })
              }
            >
              {FREQUENCIES.map((profile) => (
                <option key={profile} value={profile}>
                  {profile}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">scales every cooldown at once</span>
        </div>
        <div className="row">
          <label>
            Appearance
            <select
              value={settings.skinId}
              onChange={(event) => patch({ skinId: event.target.value as SkinId })}
            >
              {SKIN_IDS.map((id) => (
                <option key={id} value={id}>
                  {SKIN_LABELS[id]}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">changes the overlay immediately</span>
        </div>
      </section>

      <h2>Do not disturb</h2>
      <section>
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={settings.quietHours.enabled}
              onChange={(event) =>
                patch({ quietHours: { ...settings.quietHours, enabled: event.target.checked } })
              }
            />
            Quiet hours
          </label>
          <label>
            from
            <input
              type="text"
              size={5}
              value={settings.quietHours.from}
              onChange={(event) =>
                patch({ quietHours: { ...settings.quietHours, from: event.target.value } })
              }
            />
          </label>
          <label>
            to
            <input
              type="text"
              size={5}
              value={settings.quietHours.to}
              onChange={(event) =>
                patch({ quietHours: { ...settings.quietHours, to: event.target.value } })
              }
            />
          </label>
        </div>
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={settings.suppressOnFullscreen}
              onChange={(event) => patch({ suppressOnFullscreen: event.target.checked })}
            />
            Stay silent while a fullscreen app is in front
          </label>
        </div>
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={settings.suppressOnMicrophoneUse}
              onChange={(event) => patch({ suppressOnMicrophoneUse: event.target.checked })}
            />
            Stay silent while the microphone is in use
          </label>
        </div>
      </section>

      <h2>Overlay</h2>
      <section>
        <div className="row">
          <label>
            offset X
            <input
              type="number"
              value={settings.overlay.offsetX}
              onChange={(event) =>
                patch({ overlay: { ...settings.overlay, offsetX: Number(event.target.value) } })
              }
            />
          </label>
          <label>
            offset Y
            <input
              type="number"
              value={settings.overlay.offsetY}
              onChange={(event) =>
                patch({ overlay: { ...settings.overlay, offsetY: Number(event.target.value) } })
              }
            />
          </label>
        </div>
      </section>

      <h2>Monitors</h2>
      <section>
        {Object.keys(MONITOR_LABELS).map((id) => (
          <div className="row" key={id}>
            <label>
              <input
                type="checkbox"
                checked={settings.monitors[id] !== false}
                onChange={(event) =>
                  patch({ monitors: { ...settings.monitors, [id]: event.target.checked } })
                }
              />
              {MONITOR_LABELS[id]}
            </label>
          </div>
        ))}
      </section>

      <h2>Watched processes</h2>
      <section>
        <textarea
          value={settings.watchedProcesses.join('\n')}
          onChange={(event) =>
            patch({
              watchedProcesses: event.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
            })
          }
        />
        <div className="muted">One executable name per line.</div>
      </section>

      <h2>Watched folders</h2>
      <section>
        <textarea
          value={settings.watchedFolders.join('\n')}
          onChange={(event) =>
            patch({
              watchedFolders: event.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
            })
          }
        />
        <div className="muted">One absolute path per line. Restart to re-watch.</div>
      </section>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <SettingsPanel />
    </StrictMode>
  );
}
