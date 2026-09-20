# Working on this repo

A multi-user rewrite of a kettlebell workout app, in phases.

**Read [`docs/PROGRESS.md`](docs/PROGRESS.md) first.** It says what is built,
what was decided, what comes next, and the handful of platform gotchas that
cost real time. The approved plan is [`docs/plan.md`](docs/plan.md).

## Layout

`packages/core` is the domain — workout definitions, the step compiler, the Zod
wire contract, the seed catalogue. Pure TypeScript, no I/O. `apps/api` is a Hono
Worker on D1 with Better Auth. `apps/web` is not built yet. `legacy/` is the
original single-file app, still live from `main`.

## Non-negotiables

- **Don't change the workout's behaviour by accident.**
  `packages/core/test/legacy-fidelity.test.ts` checks the compiler still
  produces the 47 steps and 1820 seconds the original app produced, against a
  fixture generated from the original's own code. If it fails, that is a real
  regression unless you meant it — in which case assert the change explicitly,
  as the one existing deviation does.
- **TDD.** Core and the API are built test-first, against a real local D1 rather
  than mocks. Write the failing test before the code.
- **Every private endpoint is tested twice**: that it refuses a stranger, and
  that it refuses another signed-in user's data. Ownership checks come before
  validation, so a stranger cannot probe with error messages.
- **Generated files are not hand-edited.** The golden fixture and the seed
  migration are both regenerated in CI and the build fails if they differ.

## Commands

```sh
pnpm install
pnpm test        # core unit tests, plus the API inside workerd on a local D1
pnpm typecheck
pnpm lint
pnpm format
```

All four must pass before a commit. CI runs the same set plus the two
regeneration checks.

## Conventions

British English in prose and UI copy. Comments explain why, not what. Match the
surrounding code's density and idiom.
