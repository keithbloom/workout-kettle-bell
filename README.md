# Kettlebell and mat

A workout app: build your own sessions from a library of exercises and run them
with a guided timer, or use the standalone interval timer.

Live at **https://kettlebell-and-mat.keith-bloom.workers.dev** — a single
Cloudflare Worker serving the React app and the API from one origin, over D1.

It replaces a single-file vanilla-JS app, which was retired once this one took
over. `packages/core/test/fixtures/legacy-steps.json` is what remains of it: a
recording of the 47 steps its workout produced, which the compiler is still
checked against.

**Picking this up?** [`docs/PROGRESS.md`](docs/PROGRESS.md) says what is built,
what was decided, and what comes next. The approved plan is
[`docs/plan.md`](docs/plan.md).

## Layout

| Path            | What it is                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `packages/core` | The domain: workout definitions, the step compiler, the seed catalogue. Pure TypeScript, no I/O. |
| `apps/api`      | Hono API on Cloudflare Workers, backed by D1, with Better Auth for sign-in.                      |
| `apps/web`      | React + Tailwind front end, with the session player.                                             |
| `e2e`           | Playwright specs, driving the real app against the real API.                                     |

`packages/core` is the heart of it. `compileWorkout` turns an authored workout
into the flat list of timed steps the player runs, and the builder calls the
same function to show a live duration — so a preview can never disagree with
the session you get.

## Working on it

```sh
pnpm install
pnpm test        # core unit tests, plus API tests on the real Workers runtime
pnpm typecheck
pnpm lint
```

The API's tests run inside workerd against a local D1 with the real migrations
applied, so they exercise the same runtime and SQL as production. They need no
Cloudflare account and no network.

To run the API locally you'll need secrets:

```sh
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then fill it in
pnpm --filter @kb/api db:migrate:local
pnpm --filter @kb/api dev
```

### The golden fixture

`packages/core/test/fixtures/legacy-steps.json` records the 47 steps the
original app's workout produced, taken by running its own builder before it was
retired. `test/legacy-fidelity.test.ts` checks the current compiler still
produces exactly those steps, so the workout cannot drift.

It cannot be regenerated — the app that produced it is gone — which is the
point: it is evidence, not output.
