import type { BlockKind, Exercise, Side } from '@kb/core';
import { BLOCK_KIND_LABELS, type DraftBlock } from './draft.js';

/** Which numeric settings each kind of block actually uses. */
const FIELDS: Record<BlockKind, { key: keyof DraftBlock; label: string; min: number }[]> = {
  timed_circuit: [
    { key: 'rounds', label: 'Rounds', min: 1 },
    { key: 'workSec', label: 'Work (sec)', min: 1 },
    { key: 'restSec', label: 'Rest (sec)', min: 0 },
  ],
  reps: [{ key: 'estimatedSecPerItem', label: 'Allow per move (sec)', min: 1 }],
  emom: [
    { key: 'rounds', label: 'Rounds', min: 1 },
    { key: 'intervalSec', label: 'Every (sec)', min: 1 },
  ],
  hold: [{ key: 'rounds', label: 'Rounds', min: 1 }],
};

const SIDES: { value: Side; label: string }[] = [
  { value: 'both', label: 'Straight through' },
  { value: 'each-side', label: 'Each side' },
  { value: 'switch-halfway', label: 'Switch halfway' },
];

export interface BlockEditorProps {
  block: DraftBlock;
  exercises: Map<string, Exercise>;
  canRemove: boolean;
  onChange: (changes: Partial<DraftBlock>) => void;
  onRemove: () => void;
  onAddExercise: () => void;
  onItemChange: (index: number, changes: Partial<DraftBlock['items'][number]>) => void;
  onItemMove: (index: number, direction: 1 | -1) => void;
  onItemRemove: (index: number) => void;
}

export function BlockEditor({
  block,
  exercises,
  canRemove,
  onChange,
  onRemove,
  onAddExercise,
  onItemChange,
  onItemMove,
  onItemRemove,
}: BlockEditorProps) {
  return (
    <div className="block">
      <div className="block-head">
        <label className="field-row">
          <span className="field-label">How it runs</span>
          <select
            className="field"
            value={block.kind}
            onChange={(e) => onChange({ kind: e.target.value as BlockKind })}
          >
            {Object.entries(BLOCK_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {canRemove && (
          <button type="button" className="btn2 danger" onClick={onRemove}>
            Remove block
          </button>
        )}
      </div>

      <div className="fields">
        {FIELDS[block.kind].map(({ key, label, min }) => (
          <label className="field-row" key={String(key)}>
            <span className="field-label">{label}</span>
            <input
              className="field"
              type="number"
              min={min}
              value={(block[key] as number | undefined) ?? ''}
              onChange={(e) =>
                onChange({
                  [key]: e.target.value === '' ? undefined : Number(e.target.value),
                } as Partial<DraftBlock>)
              }
            />
          </label>
        ))}
      </div>

      {block.kind === 'emom' && (
        <label className="field-row">
          <span className="field-label">Checklist, one line each</span>
          <textarea
            className="field"
            rows={3}
            placeholder={'20 kettlebell swings\n10 reverse lunges'}
            value={(block.tasks ?? []).join('\n')}
            onChange={(e) =>
              onChange({
                tasks: e.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      )}

      <label className="field-row">
        <span className="field-label">Get ready first (sec, blank for none)</span>
        <input
          className="field"
          type="number"
          min={0}
          value={block.prep?.durationSec ?? ''}
          onChange={(e) =>
            onChange({
              prep:
                e.target.value === ''
                  ? undefined
                  : { durationSec: Number(e.target.value), hint: block.prep?.hint ?? '' },
            })
          }
        />
      </label>

      {block.prep && (
        <label className="field-row">
          <span className="field-label">What to do while getting ready</span>
          <input
            className="field"
            value={block.prep.hint}
            placeholder="Pick up your heavier bell."
            onChange={(e) =>
              onChange({ prep: { durationSec: block.prep!.durationSec, hint: e.target.value } })
            }
          />
        </label>
      )}

      <div className="items">
        {block.items.length === 0 && <p className="status">No exercises in this block yet.</p>}

        {block.items.map((item, index) => {
          const exercise = exercises.get(item.exerciseSlug);

          return (
            <div className="item" key={item.key}>
              <div className="item-top">
                <b>{exercise?.name ?? item.exerciseSlug}</b>
                <span className="item-controls">
                  <button
                    type="button"
                    aria-label={`Move ${exercise?.name ?? 'exercise'} up`}
                    disabled={index === 0}
                    onClick={() => onItemMove(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${exercise?.name ?? 'exercise'} down`}
                    disabled={index === block.items.length - 1}
                    onClick={() => onItemMove(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${exercise?.name ?? 'exercise'}`}
                    onClick={() => onItemRemove(index)}
                  >
                    ✕
                  </button>
                </span>
              </div>

              <div className="fields">
                {block.kind === 'reps' ? (
                  <label className="field-row">
                    <span className="field-label">Dose</span>
                    <input
                      className="field"
                      value={item.reps ?? ''}
                      placeholder={exercise?.defaultDose ?? '10 reps'}
                      onChange={(e) => onItemChange(index, { reps: e.target.value || undefined })}
                    />
                  </label>
                ) : (
                  <label className="field-row">
                    <span className="field-label">
                      Seconds {block.kind === 'timed_circuit' && '(blank uses the block’s)'}
                    </span>
                    <input
                      className="field"
                      type="number"
                      min={1}
                      value={item.durationSec ?? ''}
                      onChange={(e) =>
                        onItemChange(index, {
                          durationSec: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                )}

                <label className="field-row">
                  <span className="field-label">Sides</span>
                  <select
                    className="field"
                    value={item.side ?? 'both'}
                    onChange={(e) =>
                      onItemChange(index, {
                        side: e.target.value === 'both' ? undefined : (e.target.value as Side),
                      })
                    }
                  >
                    {SIDES.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                {item.side === 'switch-halfway' && (
                  <label className="field-row">
                    <span className="field-label">Switch what?</span>
                    <input
                      className="field"
                      value={item.switchNoun ?? ''}
                      placeholder="sides"
                      onChange={(e) =>
                        onItemChange(index, { switchNoun: e.target.value || undefined })
                      }
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}

        <button type="button" className="btn2" onClick={onAddExercise}>
          Add an exercise
        </button>
      </div>
    </div>
  );
}
