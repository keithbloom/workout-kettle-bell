import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { compileWorkout, lengthOf } from '@kb/core';
import type { CompiledWorkout } from '@kb/core';
import {
  useDeleteWorkout,
  useExercises,
  useHistory,
  useRecordSession,
  useWorkout,
} from '../api/queries.js';
import { Player, weekLine } from '../player/Player.js';
import { ChevronIcon } from '../components/icons.js';
import { plural } from '../lib/format.js';

/**
 * One workout, laid out as the original app laid out its only workout: a
 * coloured band per section, each opening to reveal the moves and a "start from
 * here" button.
 */
export function WorkoutDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const workout = useWorkout(id);
  const exercises = useExercises();
  const history = useHistory();
  const record = useRecordSession();
  const remove = useDeleteWorkout();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [open, setOpen] = useState<string | null>(null);
  const [run, setRun] = useState<CompiledWorkout | null>(null);
  const [startedAt, setStartedAt] = useState(0);

  const compiled = useMemo(() => {
    if (!workout.data || !exercises.data) return null;
    return compileWorkout(workout.data.workout, exercises.data);
  }, [workout.data, exercises.data]);

  if (workout.isPending || exercises.isPending) {
    return (
      <section className="view">
        <p className="status">Loading…</p>
      </section>
    );
  }

  if (workout.error || !workout.data || !exercises.data || !compiled) {
    return (
      <section className="view">
        <h1>Not found</h1>
        <p className="lede">That workout isn&rsquo;t available.</p>
      </section>
    );
  }

  const { workout: definition, canEdit } = workout.data;
  const catalogue = exercises.data;
  const bySlug = new Map(catalogue.map((e) => [e.slug, e]));

  const start = (fromSectionIndex: number) => {
    setStartedAt(Date.now());
    setRun(compileWorkout(definition, catalogue, { fromSectionIndex }));
  };

  /*
   * Minutes per section, summed from the compiled steps rather than read off
   * the progress segments: segments merge consecutive sections that share a
   * phase, so in a workout with two "strength" sections in a row they would not
   * line up one-to-one.
   */
  const sectionSeconds = new Map<number, number>();
  for (const step of compiled.steps) {
    sectionSeconds.set(
      step.sectionIndex,
      (sectionSeconds.get(step.sectionIndex) ?? 0) + lengthOf(step),
    );
  }
  const sectionMinutes = (index: number) => Math.round((sectionSeconds.get(index) ?? 0) / 60);

  return (
    <section className="view">
      <h1>{definition.name}</h1>
      <p className="lede">{definition.description}</p>

      <div className="timeline" aria-hidden="true">
        {compiled.segments.map((segment, i) => (
          <i key={i} data-phase={segment.phase} style={{ flex: Math.max(segment.totalSec, 1) }} />
        ))}
      </div>

      <div className="row-actions">
        {canEdit ? (
          <>
            <Link to={`/workouts/${definition.id}/edit`} className="btn2">
              Edit
            </Link>
            <button
              type="button"
              className="btn2 danger"
              onClick={() =>
                confirmingDelete
                  ? remove.mutate(definition.id, { onSuccess: () => void navigate('/') })
                  : setConfirmingDelete(true)
              }
            >
              {confirmingDelete ? 'Tap again to delete' : 'Delete'}
            </button>
          </>
        ) : (
          <Link to={`/workouts/${definition.id}/copy`} className="btn2">
            Make my own copy
          </Link>
        )}
      </div>

      <p className="hist">
        {history.data?.sessions.length
          ? `${plural(history.data.thisWeek, 'session')} this week, ${history.data.sessions.length} in total.`
          : ''}
      </p>

      {definition.sections.map((section, index) => {
        const isOpen = open === section.id;
        const moves = section.blocks.flatMap((block) =>
          block.items.map((item) => bySlug.get(item.exerciseSlug)?.name ?? item.exerciseSlug),
        );

        return (
          <section className="band" data-phase={section.phase} key={section.id}>
            <button
              type="button"
              className="band-head"
              aria-expanded={isOpen}
              aria-controls={`body-${section.id}`}
              onClick={() => setOpen(isOpen ? null : section.id)}
            >
              <span>
                <span className="band-name">{section.title}</span>
                <span className="band-moves">{[...new Set(moves)].join(', ')}</span>
              </span>
              <span className="band-min">{sectionMinutes(index)} min</span>
              <ChevronIcon />
            </button>

            {isOpen && (
              <div className="band-body" id={`body-${section.id}`}>
                <p className="band-intro">{section.intro}</p>
                {section.blocks.map((block, b) =>
                  block.items.map((item, i) => {
                    const exercise = bySlug.get(item.exerciseSlug);
                    if (!exercise) return null;
                    return (
                      <div className="mv" key={`${b}-${i}`}>
                        <div className="mv-top">
                          <b>{exercise.name}</b>
                          <span>
                            {item.reps ??
                              (item.durationSec ? `${item.durationSec} sec` : exercise.defaultDose)}
                          </span>
                        </div>
                        <p>{exercise.description}</p>
                      </div>
                    );
                  }),
                )}
                <button type="button" className="band-start" onClick={() => start(index)}>
                  Start from here
                </button>
              </div>
            )}
          </section>
        );
      })}

      <div className="start-wrap">
        <button type="button" className="cta" onClick={() => start(0)}>
          Start workout
        </button>
      </div>

      {run && (
        <Player
          run={run}
          weekSummary={history.data ? weekLine(history.data.thisWeek + 1) : undefined}
          onFinished={({ activeSeconds }) => {
            record.mutate({
              clientId: crypto.randomUUID(),
              workoutId: definition.id,
              workoutName: definition.name,
              startedAt,
              completedAt: Date.now(),
              activeSeconds,
            });
          }}
          onClose={() => {
            setRun(null);
            void navigate('/');
          }}
        />
      )}
    </section>
  );
}
