import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { CompiledWorkout } from '@kb/core';
import {
  advance,
  back,
  endSession,
  next,
  startSession,
  toggleTask,
  togglePause,
  type SessionEvent,
  type SessionResult,
  type SessionState,
} from './session';
import {
  ensureAudio,
  playSound,
  releaseWakeLock,
  requestWakeLock,
  speak,
  stopSpeaking,
  vibrate,
} from './cues';
import { readSettings } from '../settings/useSettings';

const TICK_MS = 100;
/** How long the halfway banner stays up. */
const CUE_VISIBLE_MS = 4_000;

export interface FinishedSession {
  activeSeconds: number;
}

/**
 * Drives the session engine with a real clock and turns its events into sound.
 *
 * The authoritative state lives in a ref rather than React state: the ticking
 * happens in a timer callback, and a callback that closed over a stale state
 * would reset the clock every tick. React is told to re-render by advancing
 * `now`, which is what the display needs anyway.
 */
export function useSession(run: CompiledWorkout, onFinish: (result: FinishedSession) => void) {
  const stateRef = useRef<SessionState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [cue, setCue] = useState<string | null>(null);
  const cueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `onFinish` is called from a timer; keeping it in a ref means a caller that
  // passes an inline function does not restart the session on every render.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // The opening cue is produced here but played in an effect, because
  // rendering must not make a noise.
  const pending = useRef<SessionEvent[]>([]);

  if (stateRef.current === null || stateRef.current.run !== run) {
    const opening = startSession(run, Date.now());
    stateRef.current = opening.state;
    pending.current = opening.events;
  }

  const showCue = useCallback((text: string) => {
    setCue(text);
    if (cueTimer.current) clearTimeout(cueTimer.current);
    cueTimer.current = setTimeout(() => setCue(null), CUE_VISIBLE_MS);
  }, []);

  const play = useCallback(
    (events: SessionEvent[]) => {
      const settings = readSettings();

      for (const event of events) {
        switch (event.type) {
          case 'enter-step': {
            if (settings.sound) {
              playSound(event.tone === 'rest' ? 'rest' : event.tone === 'reps' ? 'count' : 'go');
            }
            if (settings.vibrate) {
              vibrate(event.tone === 'rest' ? [80, 60, 80] : event.tone === 'reps' ? 60 : 140);
            }
            if (settings.voice) speak(event.step.speech);
            break;
          }
          case 'countdown':
            if (settings.sound) playSound('count');
            break;
          case 'halfway':
            if (settings.sound) playSound('half');
            if (settings.vibrate) vibrate([60, 60, 60]);
            showCue(event.cue);
            break;
          case 'rest-reached':
            if (settings.sound) playSound('rest');
            if (settings.vibrate) vibrate([80, 60, 80]);
            if (settings.voice) speak('Rest');
            break;
          case 'finished':
            if (settings.sound) playSound('done');
            if (settings.vibrate) vibrate([200, 100, 200, 100, 300]);
            if (settings.voice) speak('Done. Nice work.');
            onFinishRef.current({ activeSeconds: event.activeSeconds });
            break;
        }
      }
    },
    [showCue],
  );

  /** Apply a transition, play whatever it asked for, and redraw. */
  const apply = useCallback(
    (transition: (state: SessionState, at: number) => SessionResult) => {
      const at = Date.now();
      const result = transition(stateRef.current!, at);
      stateRef.current = result.state;
      play(result.events);
      setNow(at);
      rerender();
    },
    [play],
  );

  // Announce the first step, and keep the screen awake for the session.
  useEffect(() => {
    ensureAudio();
    const settings = readSettings();
    if (settings.awake) void requestWakeLock();

    play(pending.current);
    pending.current = [];

    return () => {
      void releaseWakeLock();
      stopSpeaking();
      if (cueTimer.current) clearTimeout(cueTimer.current);
    };
    // Deliberately once per run: re-announcing on every render would be chaos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  useEffect(() => {
    const id = setInterval(() => apply(advance), TICK_MS);
    return () => clearInterval(id);
  }, [apply]);

  /*
   * A backgrounded tab stops firing timers and drops the wake lock. On return,
   * catch the clock up in one go — the engine carries overshoot forward, so a
   * ten-minute absence lands on the right step rather than replaying every one.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (readSettings().awake) void requestWakeLock();
      apply(advance);
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [apply]);

  const state = stateRef.current;

  return {
    state,
    now,
    cue,
    next: useCallback(() => apply(next), [apply]),
    back: useCallback(() => apply(back), [apply]),
    togglePause: useCallback(() => apply(togglePause), [apply]),
    toggleTask: useCallback((index: number) => apply((s, at) => toggleTask(s, index, at)), [apply]),
    end: useCallback(() => apply(endSession), [apply]),
  };
}
