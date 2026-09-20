import { lengthOf } from '@kb/core';
import type { CompiledWorkout, Step } from '@kb/core';

/**
 * The session engine: everything about running a workout that is not drawing.
 *
 * Written as pure functions over a state value, taking `now` as an argument
 * rather than reading the clock. That is what makes the awkward parts testable
 * without fake timers — overshoot on a late tick, time given back after a
 * pause, the beeps in the last three seconds.
 *
 * Effects the engine wants (a beep, a spoken cue, a buzz) are returned as
 * events rather than performed, so the hook that owns the audio decides what to
 * do with them and the engine stays pure.
 */

export interface SessionState {
  run: CompiledWorkout;
  index: number;
  paused: boolean;
  /** When the current step began, already adjusted for any pauses. */
  stepStartedAt: number;
  /** When the current step ends. 0 for an untimed step. */
  endsAt: number;
  pausedAt: number;
  /** Time spent actually working, excluding pauses. */
  activeMs: number;
  lastTickAt: number;
  /** Which second of the countdown last beeped, so each beeps once. */
  lastBeepSecond: number | null;
  halfwayDone: boolean;
  /** Ticked checklist lines on an emom step. */
  ticks: boolean[];
  /** True once every line of an emom round is ticked: the round becomes rest. */
  emomRest: boolean;
  finished: boolean;
}

export type SessionEvent =
  | { type: 'enter-step'; step: Step; tone: Tone }
  | { type: 'countdown'; secondsLeft: number }
  | { type: 'halfway'; cue: string }
  | { type: 'rest-reached' }
  | { type: 'finished'; activeSeconds: number };

export interface SessionResult {
  state: SessionState;
  events: SessionEvent[];
}

export type Tone = 'work' | 'rest' | 'reps';

/** How long a step can be under way before "back" restarts it instead. */
const RESTART_WINDOW_MS = 3_000;

/** The clock beeps for each of the last this-many seconds. */
const COUNTDOWN_FROM_SEC = 3;

/* ------------------------------ selectors ------------------------------ */

export function currentStep(state: SessionState): Step | undefined {
  return state.run.steps[state.index];
}

/** Prep and rest are breaks; a finished emom round becomes one too. */
export function isRestTone(state: SessionState): boolean {
  const step = currentStep(state);
  if (!step) return false;
  if (step.type === 'rest' || step.type === 'prep') return true;
  return step.type === 'emom' && state.emomRest;
}

export function toneOf(state: SessionState): Tone {
  const step = currentStep(state);
  if (!step) return 'work';
  if (isRestTone(state)) return 'rest';
  return step.type === 'reps' ? 'reps' : 'work';
}

/** Whole seconds left, rounded up so the clock reads 0 only when it is over. */
export function secondsRemaining(state: SessionState, now: number): number | null {
  const step = currentStep(state);
  if (!step?.durationSec) return null;

  const at = state.paused ? state.pausedAt : now;
  return Math.max(0, Math.ceil((state.endsAt - at) / 1000));
}

/** How far through the current step, 0 to 1, for the progress bar. */
export function stepProgress(state: SessionState, now: number): number {
  const step = currentStep(state);
  if (!step?.durationSec) return 0;

  const at = state.paused ? state.pausedAt : now;
  const elapsed = at - state.stepStartedAt;
  return clamp(elapsed / (step.durationSec * 1000), 0, 1);
}

/** Seconds of the whole run completed, for filling the phase segments. */
export function elapsedSec(state: SessionState, now: number): number {
  const step = currentStep(state);
  const before = state.run.cumulativeSec[state.index] ?? 0;
  if (!step) return before;

  return before + lengthOf(step) * stepProgress(state, now);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/* ------------------------------ transitions ------------------------------ */

/** Begin a run. The returned `events` announce the first step. */
export function startSession(run: CompiledWorkout, now: number): SessionResult {
  const base: SessionState = {
    run,
    index: 0,
    paused: false,
    stepStartedAt: now,
    endsAt: 0,
    pausedAt: 0,
    activeMs: 0,
    lastTickAt: now,
    lastBeepSecond: null,
    halfwayDone: false,
    ticks: [],
    emomRest: false,
    finished: false,
  };

  const state = enter(base, 0, now);

  return { state, events: [enterEvent(state)] };
}

/** Move to `index` and reset everything that is per-step. */
function enter(state: SessionState, index: number, now: number): SessionState {
  const step = state.run.steps[index];

  return {
    ...state,
    index,
    stepStartedAt: now,
    endsAt: step?.durationSec ? now + step.durationSec * 1000 : 0,
    lastBeepSecond: null,
    halfwayDone: false,
    ticks: [],
    emomRest: false,
    pausedAt: state.paused ? now : state.pausedAt,
  };
}

function enterEvent(state: SessionState): SessionEvent {
  return { type: 'enter-step', step: currentStep(state)!, tone: toneOf(state) };
}

/**
 * Drive the clock forward.
 *
 * `now` is whatever the caller's timer reported, which may be late — a
 * backgrounded tab can return after minutes. Overshoot is carried into the next
 * step rather than discarded, so a late tick cannot silently lengthen a
 * session, and several steps can elapse in one call.
 */
export function advance(state: SessionState, now: number): SessionResult {
  if (state.finished || state.paused) {
    return { state: { ...state, lastTickAt: now }, events: [] };
  }

  const events: SessionEvent[] = [];
  let next = { ...state, activeMs: state.activeMs + (now - state.lastTickAt), lastTickAt: now };

  // A timed step may have ended, and the one after it too if we are far behind.
  while (!next.finished && next.endsAt > 0 && now >= next.endsAt) {
    const endedAt = next.endsAt;

    if (next.index >= next.run.steps.length - 1) {
      next = { ...next, finished: true };
      events.push({ type: 'finished', activeSeconds: Math.round(next.activeMs / 1000) });
      break;
    }

    // Enter at the moment the previous step ended, not at `now`, so the
    // overshoot comes out of the new step rather than being given away.
    next = enter(next, next.index + 1, endedAt);
    events.push(enterEvent(next));
  }

  if (next.finished) return { state: next, events };

  events.push(...cuesFor(next, now));
  return { state: applyCues(next, now), events };
}

/** The last-three-seconds beeps and the halfway switch, each fired once. */
function cuesFor(state: SessionState, now: number): SessionEvent[] {
  const step = currentStep(state);
  if (!step?.durationSec) return [];

  const events: SessionEvent[] = [];
  const secondsLeft = Math.ceil((state.endsAt - now) / 1000);

  // Only count down steps long enough for it to mean something: a three-second
  // prep would otherwise beep from the moment it started.
  if (
    step.durationSec > COUNTDOWN_FROM_SEC &&
    secondsLeft >= 1 &&
    secondsLeft <= COUNTDOWN_FROM_SEC &&
    state.lastBeepSecond !== secondsLeft
  ) {
    events.push({ type: 'countdown', secondsLeft });
  }

  if (step.halfwayCue && !state.halfwayDone) {
    const halfway = state.stepStartedAt + (step.durationSec * 1000) / 2;
    if (now >= halfway) events.push({ type: 'halfway', cue: step.halfwayCue });
  }

  return events;
}

function applyCues(state: SessionState, now: number): SessionState {
  const step = currentStep(state);
  if (!step?.durationSec) return state;

  const secondsLeft = Math.ceil((state.endsAt - now) / 1000);
  const beeped =
    step.durationSec > COUNTDOWN_FROM_SEC && secondsLeft >= 1 && secondsLeft <= COUNTDOWN_FROM_SEC;
  const halfway =
    step.halfwayCue && !state.halfwayDone
      ? now >= state.stepStartedAt + (step.durationSec * 1000) / 2
      : false;

  return {
    ...state,
    lastBeepSecond: beeped ? secondsLeft : state.lastBeepSecond,
    halfwayDone: state.halfwayDone || halfway,
  };
}

export function next(state: SessionState, now: number): SessionResult {
  if (state.finished) return { state, events: [] };

  if (state.index >= state.run.steps.length - 1) {
    const finished = { ...state, finished: true };
    return {
      state: finished,
      events: [{ type: 'finished', activeSeconds: Math.round(state.activeMs / 1000) }],
    };
  }

  const moved = enter(state, state.index + 1, now);
  return { state: moved, events: [enterEvent(moved)] };
}

/**
 * Back means "I need this bit again": restart the current step if it is already
 * under way, otherwise step back to the previous one. Matches the behaviour of
 * a music player's back button, which is what people expect.
 */
export function back(state: SessionState, now: number): SessionResult {
  const step = currentStep(state);
  const at = state.paused ? state.pausedAt : now;
  const underWay = !!step?.durationSec && at - state.stepStartedAt > RESTART_WINDOW_MS;

  const target = underWay ? state.index : Math.max(0, state.index - 1);
  const moved = enter({ ...state, finished: false }, target, now);

  return { state: moved, events: [enterEvent(moved)] };
}

export function togglePause(state: SessionState, now: number): SessionResult {
  if (state.paused) {
    // Shift the step's end and start forward by however long we were paused,
    // so the user gets back exactly the time they stopped for.
    const pausedFor = now - state.pausedAt;
    return {
      state: {
        ...state,
        paused: false,
        endsAt: state.endsAt ? state.endsAt + pausedFor : 0,
        stepStartedAt: state.stepStartedAt + pausedFor,
        lastTickAt: now,
      },
      events: [],
    };
  }

  return { state: { ...state, paused: true, pausedAt: now, lastTickAt: now }, events: [] };
}

/** Tick a line off an emom round; the round becomes rest once all are ticked. */
export function toggleTask(state: SessionState, index: number, now: number): SessionResult {
  const step = currentStep(state);
  if (step?.type !== 'emom' || !step.tasks) return { state, events: [] };

  const ticks = [...state.ticks];
  ticks[index] = !ticks[index];

  const allDone = step.tasks.every((_, i) => ticks[i]);
  const events: SessionEvent[] = allDone && !state.emomRest ? [{ type: 'rest-reached' }] : [];

  void now;
  return { state: { ...state, ticks, emomRest: allDone }, events };
}

export function endSession(state: SessionState): SessionResult {
  return {
    state: { ...state, finished: true },
    events: [{ type: 'finished', activeSeconds: Math.round(state.activeMs / 1000) }],
  };
}
