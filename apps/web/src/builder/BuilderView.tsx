import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { compileWorkout, workoutDraftSchema, PHASES } from '@kb/core';
import type { BlockKind, Phase } from '@kb/core';
import { useExercises, useSaveWorkout, useWorkout } from '../api/queries.js';
import { formatDuration } from '../lib/format.js';
import { BlockEditor } from './BlockEditor.js';
import { ExercisePicker } from './ExercisePicker.js';
import {
  addBlock,
  addItem,
  addSection,
  createEmpty,
  fromDefinition,
  moveItem,
  moveSection,
  removeBlock,
  removeItem,
  removeSection,
  toWorkoutDraft,
  updateBlock,
  updateItem,
  updateSection,
  BLOCK_KIND_LABELS,
  PHASE_TITLES,
  type Draft,
} from './draft.js';

/** Which block a newly picked exercise belongs to. */
interface PickerTarget {
  sectionIndex: number;
  blockIndex: number;
}

/**
 * Build or edit a workout.
 *
 * Reordering is done with up and down buttons rather than dragging. This is a
 * phone-first app used with sweaty hands, and a drag target is both harder to
 * hit and much harder to operate with a screen reader or a keyboard.
 */
export function BuilderView({ mode }: { mode: 'new' | 'edit' | 'copy' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const exercises = useExercises();
  const save = useSaveWorkout();

  // A workout is loaded when editing, and when starting from a copy.
  const source = useWorkout(mode === 'new' ? undefined : id);

  const [draft, setDraft] = useState<Draft | null>(mode === 'new' ? createEmpty : null);
  const [picking, setPicking] = useState<PickerTarget | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // Seed the draft once the workout being copied or edited arrives.
  if (!draft && source.data) {
    const seeded = fromDefinition(source.data.workout);
    setDraft(mode === 'copy' ? { ...seeded, name: `${seeded.name} (copy)` } : seeded);
  }

  const bySlug = useMemo(
    () => new Map((exercises.data ?? []).map((exercise) => [exercise.slug, exercise])),
    [exercises.data],
  );

  /*
   * The running total comes from the same compiler the player uses, so what the
   * builder promises and what the session delivers cannot drift. It needs a
   * complete, valid workout, so it is null while one is still being assembled.
   */
  const preview = useMemo(() => {
    if (!draft || !exercises.data) return null;
    const parsed = workoutDraftSchema.safeParse(toWorkoutDraft(draft));
    if (!parsed.success) return null;

    try {
      return compileWorkout({ id: 'preview', ...parsed.data }, exercises.data);
    } catch {
      // An exercise that is no longer in the catalogue; the save will explain.
      return null;
    }
  }, [draft, exercises.data]);

  if (exercises.isPending || (!draft && source.isPending)) {
    return (
      <section className="view">
        <p className="status">Loading…</p>
      </section>
    );
  }

  if (!draft || !exercises.data) {
    return (
      <section className="view">
        <h1>Not found</h1>
        <p className="lede">That workout isn’t available to edit.</p>
      </section>
    );
  }

  const parsed = workoutDraftSchema.safeParse(toWorkoutDraft(draft));
  const problems = parsed.success ? [] : describe(parsed.error.issues);

  const submit = async () => {
    if (!parsed.success) {
      setShowErrors(true);
      return;
    }

    const result = await save.mutateAsync({
      ...(mode === 'edit' && id ? { id } : {}),
      draft: parsed.data,
    });
    void navigate(`/workouts/${result.id}`);
  };

  return (
    <section className="view">
      <h1>{mode === 'edit' ? 'Edit workout' : 'New workout'}</h1>

      <label className="field-row">
        <span className="field-label">Name</span>
        <input
          className="field"
          value={draft.name}
          placeholder="Morning session"
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>

      <label className="field-row">
        <span className="field-label">Description</span>
        <input
          className="field"
          value={draft.description}
          placeholder="Short and heavy."
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>

      <p className="total" aria-live="polite">
        {preview
          ? `${formatDuration(preview.totalSec)} in ${preview.steps.length} steps.`
          : 'Add an exercise to see how long this takes.'}
      </p>

      {draft.sections.map((section, sectionIndex) => (
        <section className="band builder-band" data-phase={section.phase} key={section.id}>
          <div className="band-head builder-head">
            <input
              className="field section-name"
              aria-label={`Section ${sectionIndex + 1} name`}
              value={section.title}
              onChange={(e) =>
                setDraft(updateSection(draft, sectionIndex, { title: e.target.value }))
              }
            />
            <span className="item-controls">
              <button
                type="button"
                aria-label={`Move ${section.title} up`}
                disabled={sectionIndex === 0}
                onClick={() => setDraft(moveSection(draft, sectionIndex, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${section.title} down`}
                disabled={sectionIndex === draft.sections.length - 1}
                onClick={() => setDraft(moveSection(draft, sectionIndex, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Remove ${section.title}`}
                disabled={draft.sections.length <= 1}
                onClick={() => setDraft(removeSection(draft, sectionIndex))}
              >
                ✕
              </button>
            </span>
          </div>

          <div className="band-body">
            <label className="field-row">
              <span className="field-label">Colour and grouping</span>
              <select
                className="field"
                value={section.phase}
                onChange={(e) =>
                  setDraft(updateSection(draft, sectionIndex, { phase: e.target.value as Phase }))
                }
              >
                {PHASES.map((phase) => (
                  <option key={phase} value={phase}>
                    {PHASE_TITLES[phase]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-row">
              <span className="field-label">Guidance</span>
              <input
                className="field"
                value={section.intro}
                placeholder="Use your heavier bell."
                onChange={(e) =>
                  setDraft(updateSection(draft, sectionIndex, { intro: e.target.value }))
                }
              />
            </label>

            {section.blocks.map((block, blockIndex) => (
              <BlockEditor
                key={block.key}
                block={block}
                exercises={bySlug}
                canRemove={section.blocks.length > 1}
                onChange={(changes) =>
                  setDraft(updateBlock(draft, sectionIndex, blockIndex, changes))
                }
                onRemove={() => setDraft(removeBlock(draft, sectionIndex, blockIndex))}
                onAddExercise={() => setPicking({ sectionIndex, blockIndex })}
                onItemChange={(itemIndex, changes) =>
                  setDraft(updateItem(draft, sectionIndex, blockIndex, itemIndex, changes))
                }
                onItemMove={(itemIndex, direction) =>
                  setDraft(moveItem(draft, sectionIndex, blockIndex, itemIndex, direction))
                }
                onItemRemove={(itemIndex) =>
                  setDraft(removeItem(draft, sectionIndex, blockIndex, itemIndex))
                }
              />
            ))}

            <label className="field-row">
              <span className="field-label">Add a block</span>
              <select
                className="field"
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setDraft(addBlock(draft, sectionIndex, e.target.value as BlockKind));
                }}
              >
                <option value="">Choose…</option>
                {Object.entries(BLOCK_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      ))}

      <label className="field-row">
        <span className="field-label">Add a section</span>
        <select
          className="field"
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            setDraft(addSection(draft, e.target.value as Phase));
          }}
        >
          <option value="">Choose…</option>
          {PHASES.map((phase) => (
            <option key={phase} value={phase}>
              {PHASE_TITLES[phase]}
            </option>
          ))}
        </select>
      </label>

      {showErrors && problems.length > 0 && (
        <div className="set-block" role="alert">
          <h2>Not ready to save</h2>
          <ul>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      {save.error && (
        <p className="status" role="alert">
          Couldn’t save that. Check your connection and try again.
        </p>
      )}

      <div className="start-wrap">
        <button type="button" className="cta" onClick={submit} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save workout'}
        </button>
      </div>

      {picking && (
        <ExercisePicker
          exercises={exercises.data}
          onPick={(slug) => {
            setDraft(addItem(draft, picking.sectionIndex, picking.blockIndex, slug));
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </section>
  );
}

/** Turn the contract's complaints into something worth reading. */
function describe(issues: { path: PropertyKey[]; message: string }[]): string[] {
  const seen = new Set<string>();

  for (const issue of issues) {
    const path = issue.path.map(String);

    if (path[0] === 'name') seen.add('Give the workout a name.');
    else if (path.includes('items')) seen.add('Every block needs at least one exercise.');
    else if (path.includes('sections')) seen.add('Add at least one section.');
    else seen.add(issue.message);
  }

  return [...seen];
}
