import type {
  Block,
  BlockItem,
  BlockKind,
  Phase,
  Section,
  WorkoutDefinition,
  WorkoutDraft,
} from '@kb/core';

/**
 * The workout being edited, and the operations the builder performs on it.
 *
 * Pure functions returning new drafts, so the editing rules are testable on
 * their own and the screen is left with nothing to do but render and dispatch.
 *
 * The draft is `WorkoutDraft` plus a `key` on every block and item. React needs
 * a stable identity per row to reorder a list without muddling the inputs
 * inside it, and position is not that identity — moving a row changes it.
 * `toWorkoutDraft` strips the keys before anything is sent.
 */

export interface DraftItem extends BlockItem {
  key: string;
}

export interface DraftBlock extends Omit<Block, 'items'> {
  key: string;
  items: DraftItem[];
}

export interface DraftSection extends Omit<Section, 'blocks'> {
  blocks: DraftBlock[];
}

export interface Draft {
  name: string;
  description: string;
  sections: DraftSection[];
}

export const PHASE_TITLES: Record<Phase, string> = {
  warmup: 'Warm-up',
  strength: 'Strength',
  endurance: 'Endurance',
  core: 'Core',
  cooldown: 'Cool-down',
};

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  timed_circuit: 'Timed circuit',
  reps: 'Reps, at your own pace',
  emom: 'Every minute, on the minute',
  hold: 'Holds and stretches',
};

let counter = 0;
/** Unique within a session, which is all a React key or a draft id needs. */
function key(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Starting values that make a new block immediately runnable. */
function defaultsFor(kind: BlockKind): Omit<DraftBlock, 'key' | 'kind' | 'items'> {
  switch (kind) {
    case 'timed_circuit':
      return { rounds: 1, workSec: 40, restSec: 20 };
    case 'reps':
      return { estimatedSecPerItem: 60 };
    case 'emom':
      return { rounds: 4, intervalSec: 60, tasks: [] };
    case 'hold':
      return { rounds: 1 };
  }
}

function newBlock(kind: BlockKind): DraftBlock {
  return { key: key('block'), kind, items: [], ...defaultsFor(kind) };
}

function newSection(phase: Phase): DraftSection {
  return {
    id: key('section'),
    title: PHASE_TITLES[phase],
    phase,
    intro: '',
    blocks: [newBlock('timed_circuit')],
  };
}

export function createEmpty(): Draft {
  return { name: '', description: '', sections: [newSection('strength')] };
}

/** Seed the builder from a workout being copied or edited. */
export function fromDefinition(definition: WorkoutDefinition): Draft {
  return {
    name: definition.name,
    description: definition.description,
    sections: definition.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({
        ...block,
        key: key('block'),
        items: block.items.map((item) => ({ ...item, key: key('item') })),
      })),
    })),
  };
}

/** Strip the editor's bookkeeping, leaving what the API accepts. */
export function toWorkoutDraft(draft: Draft): WorkoutDraft {
  return {
    name: draft.name,
    description: draft.description,
    sections: draft.sections.map((section) => ({
      id: section.id,
      title: section.title,
      phase: section.phase,
      intro: section.intro,
      blocks: section.blocks.map(({ key: _blockKey, items, ...block }) => ({
        ...block,
        items: items.map(({ key: _itemKey, ...item }) => item),
      })),
    })),
  };
}

/* ------------------------------ helpers ------------------------------ */

function replaceAt<T>(list: T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}

/** Move one entry by `direction`, or return the list untouched at the ends. */
function shift<T>(list: T[], index: number, direction: 1 | -1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;

  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

/**
 * Apply a patch, deleting any key set to undefined.
 *
 * Clearing a field has to remove it rather than store `undefined`: the domain
 * treats an absent `durationSec` as "use the block's" and the contract rejects
 * an explicit undefined.
 */
function patch<T extends object>(value: T, changes: Partial<T>): T {
  const next = { ...value, ...changes };
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) delete (next as Record<string, unknown>)[k];
  }
  return next;
}

function withSection(
  draft: Draft,
  index: number,
  change: (s: DraftSection) => DraftSection,
): Draft {
  const section = draft.sections[index];
  if (!section) return draft;
  return { ...draft, sections: replaceAt(draft.sections, index, change(section)) };
}

function withBlock(
  draft: Draft,
  sectionIndex: number,
  blockIndex: number,
  change: (b: DraftBlock) => DraftBlock,
): Draft {
  return withSection(draft, sectionIndex, (section) => {
    const block = section.blocks[blockIndex];
    if (!block) return section;
    return { ...section, blocks: replaceAt(section.blocks, blockIndex, change(block)) };
  });
}

/* ------------------------------ sections ------------------------------ */

export function addSection(draft: Draft, phase: Phase): Draft {
  return { ...draft, sections: [...draft.sections, newSection(phase)] };
}

export function updateSection(draft: Draft, index: number, changes: Partial<DraftSection>): Draft {
  return withSection(draft, index, (section) => patch(section, changes));
}

/** Removing the last section is refused: there must be somewhere to add a move. */
export function removeSection(draft: Draft, index: number): Draft {
  if (draft.sections.length <= 1) return draft;
  return { ...draft, sections: draft.sections.filter((_, i) => i !== index) };
}

export function moveSection(draft: Draft, index: number, direction: 1 | -1): Draft {
  return { ...draft, sections: shift(draft.sections, index, direction) };
}

/* ------------------------------ blocks ------------------------------ */

export function addBlock(draft: Draft, sectionIndex: number, kind: BlockKind): Draft {
  return withSection(draft, sectionIndex, (section) => ({
    ...section,
    blocks: [...section.blocks, newBlock(kind)],
  }));
}

/**
 * Changing a block's kind keeps its exercises and takes the new kind's
 * defaults: someone who built a circuit and then decided it should be an EMOM
 * should not have to pick the moves again.
 */
export function updateBlock(
  draft: Draft,
  sectionIndex: number,
  blockIndex: number,
  changes: Partial<DraftBlock>,
): Draft {
  return withBlock(draft, sectionIndex, blockIndex, (block) => {
    if (changes.kind && changes.kind !== block.kind) {
      return {
        key: block.key,
        kind: changes.kind,
        items: block.items,
        ...defaultsFor(changes.kind),
      };
    }
    return patch(block, changes);
  });
}

export function removeBlock(draft: Draft, sectionIndex: number, blockIndex: number): Draft {
  return withSection(draft, sectionIndex, (section) =>
    section.blocks.length <= 1
      ? section
      : { ...section, blocks: section.blocks.filter((_, i) => i !== blockIndex) },
  );
}

export function moveBlock(
  draft: Draft,
  sectionIndex: number,
  blockIndex: number,
  direction: 1 | -1,
): Draft {
  return withSection(draft, sectionIndex, (section) => ({
    ...section,
    blocks: shift(section.blocks, blockIndex, direction),
  }));
}

/* ------------------------------ items ------------------------------ */

export function addItem(
  draft: Draft,
  sectionIndex: number,
  blockIndex: number,
  exerciseSlug: string,
): Draft {
  return withBlock(draft, sectionIndex, blockIndex, (block) => ({
    ...block,
    items: [...block.items, { key: key('item'), exerciseSlug }],
  }));
}

export function updateItem(
  draft: Draft,
  sectionIndex: number,
  blockIndex: number,
  itemIndex: number,
  changes: Partial<DraftItem>,
): Draft {
  return withBlock(draft, sectionIndex, blockIndex, (block) => {
    const item = block.items[itemIndex];
    if (!item) return block;
    return { ...block, items: replaceAt(block.items, itemIndex, patch(item, changes)) };
  });
}

export function removeItem(
  draft: Draft,
  sectionIndex: number,
  blockIndex: number,
  itemIndex: number,
): Draft {
  return withBlock(draft, sectionIndex, blockIndex, (block) => ({
    ...block,
    items: block.items.filter((_, i) => i !== itemIndex),
  }));
}

export function moveItem(
  draft: Draft,
  sectionIndex: number,
  blockIndex: number,
  itemIndex: number,
  direction: 1 | -1,
): Draft {
  return withBlock(draft, sectionIndex, blockIndex, (block) => ({
    ...block,
    items: shift(block.items, itemIndex, direction),
  }));
}
