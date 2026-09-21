import { useMemo, useState } from 'react';
import type { Exercise } from '@kb/core';

export interface ExercisePickerProps {
  exercises: Exercise[];
  onPick: (slug: string) => void;
  onClose: () => void;
}

/**
 * Pick an exercise from the catalogue.
 *
 * A full-screen sheet rather than a dropdown: the list is long enough to want
 * searching, and on a phone a sheet gives the search field and the results room
 * to breathe.
 */
export function ExercisePicker({ exercises, onPick, onClose }: ExercisePickerProps) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return exercises;
    return exercises.filter(
      (exercise) =>
        exercise.name.toLowerCase().includes(needle) ||
        exercise.description.toLowerCase().includes(needle),
    );
  }, [exercises, query]);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Choose an exercise">
      <div className="sheet-head">
        <h2>Choose an exercise</h2>
        <button type="button" className="btn2" onClick={onClose}>
          Cancel
        </button>
      </div>

      <input
        className="field"
        type="search"
        placeholder="Search exercises"
        aria-label="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      <div className="sheet-body">
        {matches.length === 0 && <p className="status">Nothing matches “{query}”.</p>}

        {matches.map((exercise) => (
          <button
            key={exercise.slug}
            type="button"
            className="pick"
            onClick={() => onPick(exercise.slug)}
          >
            <span className="pick-top">
              <b>{exercise.name}</b>
              <span>{exercise.defaultDose}</span>
            </span>
            <span className="pick-desc">{exercise.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
