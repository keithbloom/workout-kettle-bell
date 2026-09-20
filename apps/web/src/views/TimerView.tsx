import { useState } from 'react';
import { compileInterval } from '@kb/core';
import type { CompiledWorkout, IntervalConfig } from '@kb/core';
import { Player } from '../player/Player.js';
import { formatDuration, plural } from '../lib/format.js';

const PRESETS = [
  { label: 'Tabata 20/10 × 8', workSec: 20, restSec: 10, rounds: 8 },
  { label: '30/30 × 10', workSec: 30, restSec: 30, rounds: 10 },
  { label: '40/20 × 6', workSec: 40, restSec: 20, rounds: 6 },
  { label: '45/15 × 8', workSec: 45, restSec: 15, rounds: 8 },
  { label: '60/30 × 5', workSec: 60, restSec: 30, rounds: 5 },
];

/** Bounds and step size for each control: [min, max, step]. */
const RANGE = {
  workSec: [5, 600, 5],
  restSec: [0, 600, 5],
  rounds: [1, 99, 1],
  prepSec: [0, 30, 5],
} as const;

const KEY = 'kb.timer';
const DEFAULT: IntervalConfig = { workSec: 40, restSec: 20, rounds: 8, prepSec: 5 };

function read(): IntervalConfig {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<IntervalConfig>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function write(config: IntervalConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Not persisted; the timer still runs.
  }
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

/** A standalone interval timer, unconnected to any workout. */
export function TimerView() {
  const [config, setConfig] = useState<IntervalConfig>(read);
  const [run, setRun] = useState<CompiledWorkout | null>(null);

  const adjust = (key: keyof IntervalConfig, direction: 1 | -1) => {
    const [lo, hi, step] = RANGE[key];
    const next = { ...config, [key]: clamp(config[key] + direction * step, lo, hi) };
    setConfig(next);
    write(next);
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const next = {
      ...config,
      workSec: preset.workSec,
      restSec: preset.restSec,
      rounds: preset.rounds,
    };
    setConfig(next);
    write(next);
  };

  const display = (key: keyof IntervalConfig) => {
    const value = config[key];
    if (key === 'rounds') return String(value);
    if (value === 0) return 'Off';
    return value >= 60 ? formatDuration(value) : `${value} sec`;
  };

  const total =
    config.prepSec + config.rounds * config.workSec + (config.rounds - 1) * config.restSec;

  const stepper = (key: keyof IntervalConfig, label: string) => (
    <div className="step-row" key={key}>
      <div className="step-lbl">{label}</div>
      <div className="step-ctl">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => adjust(key, -1)}
        >
          −
        </button>
        <output aria-live="polite">{display(key)}</output>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => adjust(key, 1)}
        >
          +
        </button>
      </div>
    </div>
  );

  return (
    <section className="view">
      <h1>Interval timer</h1>
      <p className="lede">
        Set your work and rest times for any high-intensity session. A big countdown with beeps for
        the last three seconds.
      </p>

      <div className="presets" role="group" aria-label="Presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="chip"
            aria-pressed={
              preset.workSec === config.workSec &&
              preset.restSec === config.restSec &&
              preset.rounds === config.rounds
            }
            onClick={() => applyPreset(preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {stepper('workSec', 'Work')}
      {stepper('restSec', 'Rest')}
      {stepper('rounds', 'Rounds')}
      {stepper('prepSec', 'Get ready')}

      <p className="total">
        Total time {formatDuration(total)} for {plural(config.rounds, 'round')}.
      </p>

      <div className="start-wrap">
        <button type="button" className="cta" onClick={() => setRun(compileInterval(config))}>
          Start timer
        </button>
      </div>

      {run && (
        <Player
          run={run}
          finishTitle="Timer finished"
          onFinished={() => {
            // The interval timer is not a workout, so it is not recorded.
          }}
          onClose={() => setRun(null)}
        />
      )}
    </section>
  );
}
