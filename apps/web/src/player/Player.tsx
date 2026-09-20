import { useEffect, useState } from 'react';
import type { CompiledWorkout } from '@kb/core';
import { currentStep, elapsedSec, isRestTone, secondsRemaining, stepProgress } from './session.js';
import { useSession, type FinishedSession } from './usePlayer.js';
import { formatClock, formatDuration, plural } from '../lib/format.js';
import {
  BackIcon,
  CheckIcon,
  CloseIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
  SoundIcon,
} from '../components/icons.js';
import { useSettings } from '../settings/useSettings.js';

const PHASE_NAMES: Record<string, string> = {
  warmup: 'Warm-up',
  strength: 'Strength',
  endurance: 'Endurance',
  core: 'Core',
  cooldown: 'Cool-down',
  interval: 'Interval timer',
};

export interface PlayerProps {
  run: CompiledWorkout;
  /** Headline on the finish screen: a workout completes, a timer finishes. */
  finishTitle?: string;
  /** Second line on the finish screen, e.g. "3 sessions this week". */
  weekSummary?: string;
  onFinished: (result: FinishedSession) => void;
  onClose: () => void;
}

/**
 * The full-screen session player.
 *
 * A faithful port of the original: the same layout, the same phase colours, and
 * the same behaviour where the whole screen switches to a dark "rest" palette
 * between efforts so you can tell at a glance, from across a room, whether you
 * should be working.
 */
export function Player({
  run,
  finishTitle = 'Session complete',
  weekSummary,
  onFinished,
  onClose,
}: PlayerProps) {
  const [finished, setFinished] = useState<FinishedSession | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { settings, toggle } = useSettings();

  const session = useSession(run, (result) => {
    setFinished(result);
    onFinished(result);
  });

  const { state, now, cue } = session;
  const step = currentStep(state);
  const rest = isRestTone(state);
  const remaining = secondsRemaining(state, now);
  const timed = remaining !== null;

  // Reps steps open their instructions by default: there is no clock to watch,
  // so the description is the useful thing on screen.
  useEffect(() => {
    setDetailsOpen(step?.type === 'reps');
  }, [step?.type, state.index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished || confirming) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (step?.type === 'reps') session.next();
        else session.togglePause();
      } else if (e.key === 'ArrowRight') session.next();
      else if (e.key === 'ArrowLeft') session.back();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [session, step?.type, finished, confirming]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!step) return null;

  const emomWorking = step.type === 'emom' && !state.emomRest;
  const done = elapsedSec(state, now);

  const segments = run.segments.map((segment, i) => {
    const fill = segment.totalSec
      ? Math.min(1, Math.max(0, (done - segment.startSec) / segment.totalSec))
      : 0;
    return (
      <span key={i} style={{ flex: Math.max(segment.totalSec, 1) }}>
        <i style={{ transform: `scaleX(${fill})` }} />
      </span>
    );
  });

  return (
    <div
      className={`player${state.paused ? ' paused' : ''}`}
      data-phase={step.phase}
      data-tone={rest ? 'rest' : 'work'}
      role="dialog"
      aria-modal="true"
      aria-label="Session in progress"
    >
      <div className="p-top">
        <button
          type="button"
          className="ibtn"
          aria-label="End session"
          onClick={() => setConfirming(true)}
        >
          <CloseIcon />
        </button>
        <div className="p-head">
          <div className="p-phase">{PHASE_NAMES[step.phase] ?? ''}</div>
          <div className="p-round">{step.round ?? ''}</div>
        </div>
        <button
          type="button"
          className="ibtn"
          aria-label={settings.sound ? 'Sound on' : 'Sound off'}
          aria-pressed={settings.sound}
          onClick={() => toggle('sound')}
        >
          <SoundIcon on={settings.sound} />
        </button>
      </div>

      <div className="seg" aria-hidden="true">
        {segments}
      </div>

      <div className="p-main">
        <div className="p-inner">
          <div className="p-title" aria-live="polite">
            {state.emomRest ? 'Rest' : step.title}
          </div>

          {(state.emomRest ? step.nextText : step.sub) && (
            <div className="p-sub">{state.emomRest ? step.nextText : step.sub}</div>
          )}

          {!state.emomRest && step.hint && <div className="p-hint">{step.hint}</div>}

          {timed && (
            <>
              <div className="p-clock" role="timer" aria-live="off">
                {formatClock(remaining)}
              </div>
              <div className="p-bar">
                <i style={{ transform: `scaleX(${stepProgress(state, now)})` }} />
              </div>
            </>
          )}

          {emomWorking && step.tasks && (
            <div className="tasks">
              {step.tasks.map((task, i) => (
                <button
                  key={i}
                  type="button"
                  className="task"
                  aria-pressed={!!state.ticks[i]}
                  onClick={() => session.toggleTask(i)}
                >
                  <span className="ck">
                    <CheckIcon />
                  </span>
                  <span className="t">{task}</span>
                </button>
              ))}
            </div>
          )}

          {cue && (
            <div className="cue" role="status">
              {cue}
            </div>
          )}

          {(step.type === 'work' || emomWorking) && step.nextText && (
            <div className="p-next">{step.nextText}</div>
          )}

          {step.details.length > 0 && (
            <>
              <button
                type="button"
                className="more"
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen((open) => !open)}
              >
                {detailsOpen ? 'Hide details' : 'How to do it'}
              </button>
              {detailsOpen && (
                <div className="details">
                  {step.details.map((detail) => (
                    <div key={detail.name}>
                      <h3>{detail.name}</h3>
                      <p>{detail.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="p-controls">
        <button type="button" className="pbtn" aria-label="Previous" onClick={session.back}>
          <BackIcon />
        </button>
        <button
          type="button"
          className="pbtn primary"
          onClick={() => (step.type === 'reps' ? session.next() : session.togglePause())}
        >
          {step.type === 'reps' ? (
            'Done'
          ) : state.paused ? (
            <>
              <PlayIcon />
              Resume
            </>
          ) : (
            <>
              <PauseIcon />
              Pause
            </>
          )}
        </button>
        <button type="button" className="pbtn" aria-label="Skip" onClick={session.next}>
          <ForwardIcon />
        </button>
      </div>

      {finished && (
        <div className="finish">
          <div className="seg" aria-hidden="true">
            {run.segments.map((segment, i) => (
              <span key={i} style={{ flex: Math.max(segment.totalSec, 1) }}>
                <i style={{ transform: 'scaleX(1)' }} />
              </span>
            ))}
          </div>
          <h2>{finishTitle}</h2>
          <p>Total time {formatDuration(finished.activeSeconds)}</p>
          {weekSummary && <p>{weekSummary}</p>}
          <button type="button" className="pbtn primary" onClick={onClose} autoFocus>
            Back to the app
          </button>
        </div>
      )}

      {confirming && (
        <div className="confirm">
          <h2>End this session?</h2>
          <p>Your progress won&rsquo;t be saved.</p>
          <button
            type="button"
            className="pbtn primary"
            onClick={() => setConfirming(false)}
            autoFocus
          >
            Keep going
          </button>
          <button type="button" className="pbtn" onClick={onClose}>
            End session
          </button>
        </div>
      )}
    </div>
  );
}

/** "3 sessions this week", for the finish screen. */
export function weekLine(count: number): string {
  return `${plural(count, 'session')} this week`;
}
