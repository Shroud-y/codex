import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  FrequencyProfile,
  Preset,
  PresetAssetKind,
  PresetAssetStatus,
  Settings,
  SkinId
} from '@shared/types';
import { BUILTIN_PRESET_ID, SKIN_IDS } from '@shared/types';
import './styles/panel.css';

const ASSET_ROWS: { kind: PresetAssetKind; label: string; statusKey: keyof PresetAssetStatus }[] = [
  { kind: 'bank', label: 'Phrase bank (.json)', statusKey: 'hasBank' },
  { kind: 'appearSound', label: 'Appear sound', statusKey: 'hasAppear' },
  { kind: 'disappearSound', label: 'Disappear sound', statusKey: 'hasDisappear' },
  { kind: 'gif', label: 'Appearance GIF', statusKey: 'hasGif' }
];

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
      </section>

      <PresetsSection settings={settings} patch={patch} />

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

/**
 * Ordis is the built-in preset — renamable, not deletable. New presets
 * default to the name 'Shard'. Custom bank/sounds/GIF are not settings
 * fields: their presence on disk is what main resolves, so this panel only
 * ever asks "does a custom one exist" and offers to add or remove one.
 */
function PresetsSection({
  settings,
  patch
}: {
  settings: Settings;
  patch: (change: Partial<Settings>) => void;
}): JSX.Element {
  const [status, setStatus] = useState<Record<string, PresetAssetStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refreshStatus = (presetId: string): void => {
    void window.codexPanel
      ?.getPresetAssetStatus(presetId)
      .then((next) => setStatus((prev) => ({ ...prev, [presetId]: next })));
  };

  useEffect(() => {
    for (const preset of settings.presets) refreshStatus(preset.id);
    // Re-run whenever the set of presets changes, not on every keystroke of a rename.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.presets.map((p) => p.id).join(',')]);

  const renamePreset = (id: string, name: string): void => {
    patch({ presets: settings.presets.map((p) => (p.id === id ? { ...p, name } : p)) });
  };

  const setPresetSkin = (id: string, skinId: SkinId): void => {
    patch({ presets: settings.presets.map((p) => (p.id === id ? { ...p, skinId } : p)) });
  };

  const addPreset = (): void => {
    const id = crypto.randomUUID();
    patch({ presets: [...settings.presets, { id, name: 'Shard', skinId: 'eye' }] });
  };

  const deletePreset = (id: string): void => {
    setBusy(id);
    void window.codexPanel
      ?.deletePreset(id)
      .finally(() => setBusy(null));
  };

  const pickAsset = (presetId: string, kind: PresetAssetKind): void => {
    const key = `${presetId}:${kind}`;
    setBusy(key);
    setErrors((prev) => ({ ...prev, [key]: '' }));
    void window.codexPanel
      ?.pickPresetAsset(presetId, kind)
      .then((result) => {
        if (!result.ok && result.error !== 'cancelled') {
          setErrors((prev) => ({ ...prev, [key]: result.error }));
        }
        refreshStatus(presetId);
      })
      .finally(() => setBusy(null));
  };

  const clearAsset = (presetId: string, kind: PresetAssetKind): void => {
    setBusy(`${presetId}:${kind}`);
    void window.codexPanel
      ?.clearPresetAsset(presetId, kind)
      .then(() => refreshStatus(presetId))
      .finally(() => setBusy(null));
  };

  return (
    <>
      <h2>Presets</h2>
      <section>
        {settings.presets.map((preset: Preset) => {
          const isBuiltin = preset.id === BUILTIN_PRESET_ID;
          const isActive = preset.id === settings.activePresetId;
          const presetStatus = status[preset.id];
          const hasGif = presetStatus?.hasGif ?? false;

          return (
            <div className="row" key={preset.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="row">
                <input
                  type="text"
                  value={preset.name}
                  onChange={(event) => renamePreset(preset.id, event.target.value)}
                />
                <label>
                  <input
                    type="radio"
                    name="activePreset"
                    checked={isActive}
                    onChange={() => patch({ activePresetId: preset.id })}
                  />
                  Active
                </label>
                {!hasGif ? (
                  <select
                    value={preset.skinId}
                    onChange={(event) => setPresetSkin(preset.id, event.target.value as SkinId)}
                  >
                    {SKIN_IDS.map((id) => (
                      <option key={id} value={id}>
                        {SKIN_LABELS[id]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="muted">custom GIF appearance</span>
                )}
                {!isBuiltin ? (
                  <button type="button" disabled={busy === preset.id} onClick={() => deletePreset(preset.id)}>
                    Delete
                  </button>
                ) : null}
              </div>

              {ASSET_ROWS.map(({ kind, label, statusKey }) => {
                const hasCustom = presetStatus?.[statusKey] ?? false;
                const rowKey = `${preset.id}:${kind}`;
                const rowBusy = busy === rowKey;
                const error = errors[rowKey];
                return (
                  <div className="row" key={kind}>
                    <span style={{ minWidth: '160px' }}>{label}</span>
                    <span className="muted">{hasCustom ? 'custom' : 'default'}</span>
                    <button type="button" disabled={rowBusy} onClick={() => pickAsset(preset.id, kind)}>
                      Choose file…
                    </button>
                    {hasCustom ? (
                      <button type="button" disabled={rowBusy} onClick={() => clearAsset(preset.id, kind)}>
                        Reset to default
                      </button>
                    ) : null}
                    {error ? <span className="muted">{error}</span> : null}
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="row">
          <button type="button" onClick={addPreset}>
            Add preset
          </button>
        </div>
      </section>
    </>
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
