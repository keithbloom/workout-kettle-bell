import { useCallback, useEffect, useState } from 'react';

/**
 * How the timer gets your attention. Per-device rather than per-account: which
 * phone you are holding decides whether it should buzz, not who you are, so
 * these stay in local storage and are never synced.
 */
export interface Settings {
  sound: boolean;
  vibrate: boolean;
  voice: boolean;
  awake: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  vibrate: true,
  voice: false,
  awake: true,
};

const KEY = 'kb.settings';

export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Private browsing, blocked storage, or corrupt JSON: the defaults are fine.
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not persisted; the session still works.
  }
}

/**
 * Settings are read by the player through `readSettings()` rather than through
 * this hook, because a cue fires from a timer callback that has no access to
 * React state and must see the current value, not the one captured when the
 * callback was created.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(readSettings);

  useEffect(() => {
    writeSettings(settings);
  }, [settings]);

  const toggle = useCallback((key: keyof Settings) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  return { settings, toggle };
}
