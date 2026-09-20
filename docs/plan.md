# Kettlebell & Mat v2 — multi-user app

## Context

The app today is a single 764-line `index.html`: a vanilla-JS PWA with one hardcoded 30-minute
workout, an interval timer, and history in `localStorage`. It works well and is installed on a
phone, but everything is fused together — the data model, the session engine, the DOM rendering and
the storage all live in one IIFE, so nothing can be tested or reused, and there is no way to have
more than one user or more than one workout.

We are rebuilding it as a real application: a React/TypeScript/Tailwind frontend against an
authenticated API with a database, so that multiple people can sign in and compose their own
workouts from a curated exercise library. The current UI and feature set are the target experience,
not a starting point to be redesigned. Groups and shared workouts come later, and the schema and
auth choices below are made so that later step is additive.

**Decisions taken:** Cloudflare (Pages + Workers + D1) · offline-first with sync · Better Auth with
Google, magic links later · full-fidelity section/block workout model · sign-in required, no guest
mode · current app moves to `legacy/` and stays live on Pages until v2 is proven.

## Architecture

pnpm workspace monorepo in this repo:

```
apps/web      Vite + React + TypeScript + Tailwind + vite-plugin-pwa  → Cloudflare Pages
apps/api      Hono + Better Auth + Drizzle + D1                       → Cloudflare Workers
packages/core Pure TS: workout schema, session compiler, Zod contracts (no I/O)
legacy/       The current index.html, sw.js, manifest, icons — untouched, still on Pages
e2e/          Playwright specs driving web + api together
```

`packages/core` is the important one. The best code in the existing app is
`buildWorkout`/`buildHiit`/`finalize` (`index.html:335-420`) — a pure function turning a workout
definition into a flat list of timed steps with cumulative offsets and progress segments. Ported
into `core` as `compileWorkout(definition): Step[]`, it becomes the thing both the player and the
tests stand on, and it is shared by client and server. Everything in `core` is pure, so it is the
natural home for strict TDD.

## Domain model (D1 / Drizzle)

Ported from `M` and `SECTIONS` at `index.html:243-271`.

| Table              | Purpose                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exercises`        | Curated catalogue, seeded with the 20 existing moves: slug, name, description, default dose, equipment, muscle tags. Admin-owned; users pick from it, they do not create exercises. |
| `workouts`         | `owner_user_id` (null = built-in template), name, description, `is_template`, timestamps                                                                                            |
| `sections`         | `workout_id`, position, title, `phase` (warmup/strength/endurance/core/cooldown), intro text                                                                                        |
| `blocks`           | `section_id`, position, `kind`, `rounds`, `work_sec`, `rest_sec`, `interval_sec`                                                                                                    |
| `block_items`      | `block_id`, position, `exercise_id`, and overrides: `duration_sec`, `reps`, `side` (both / left / right / switch-halfway)                                                           |
| `sessions`         | `user_id`, `workout_id`, `client_id` (UUID from the device, unique — makes sync idempotent), `started_at`, `completed_at`, `active_seconds`                                         |
| Better Auth tables | `user`, `session`, `account`, `verification` — owned by the library's own migrations                                                                                                |

Four block kinds cover the existing workout exactly, which is the test that the model is right:

- `timed_circuit` — work/rest × rounds (Strength: 45/15 × 2, Core: 30s × 2)
- `reps` — untimed, tap to advance (Warm-up)
- `emom` — fixed interval, checklist of tasks, rest for what's left (Endurance: 4 × 2 min)
- `hold` — per-side timed holds (Cool-down stretches, side planks)

The existing 30-minute workout is seeded as a built-in template expressed purely in this model. If
it cannot be expressed without special-casing, the model is wrong — that is an explicit acceptance
test in phase 2.

## Build order

Each phase ends green on CI and, from phase 6, deployed.

**1 — Foundation.** pnpm workspace, TypeScript project references, ESLint/Prettier, Vitest.
`legacy/` move (Pages config updated so the live app keeps working). `packages/core` built
test-first: workout schema types + Zod contracts, then `compileWorkout` ported from
`buildWorkout`/`finalize`, then `compileInterval` from `buildHiit`. GitHub Actions running lint,
typecheck and unit tests on every push.

**2 — Backend and auth.** Drizzle schema + first D1 migration. Better Auth mounted in Hono with the
Google provider and a Drizzle/D1 adapter — _this integration is the main technical risk; spike it
first, before the rest of the phase_. Exercise catalogue seed script. Workouts/sessions REST
handlers with Zod validation, tested against a real local D1 via Miniflare (`unstable_dev`), not
mocks. Every handler scopes by `user_id`; an ownership test per endpoint is part of the definition
of done, since that is the guard groups will later extend.

**3 — Frontend rebuild.** Vite + React + Tailwind. React Router, TanStack Query for server state.
Port the three views and the player screen from the existing markup and CSS (`index.html:20-232`) —
same layout, same dark player, same phase colours, same accessibility attributes (`role="timer"`,
`aria-live`, the reduced-motion block). The player becomes a `useSession` hook wrapping the step
list from `core`, with the audio/haptics/voice/wake-lock helpers (`index.html:301-332`) as small
typed modules. Sign-in screen, workout list, session history.

**4 — Workout builder.** Pick a workout to copy or start empty; add sections; add blocks of the four
kinds; pick exercises from the catalogue with a search/filter; reorder with drag-and-drop;
per-item dose overrides. A live "this is N minutes" total computed by calling `compileWorkout` in
the browser — the same function the player uses, so the preview cannot drift from reality.

**5 — Offline and sync.** vite-plugin-pwa for the shell. Workouts and the exercise catalogue
persisted from the TanStack Query cache into IndexedDB, so a signed-in user opens the app and
starts a session with no signal. Completed sessions written to an IndexedDB outbox keyed by
`client_id` and flushed on reconnect; the API upserts on `client_id` so a replayed flush is
harmless. Long-lived auth cookie so offline does not mean signed out.

**6 — Deploy.** Actions deploys `apps/api` with `wrangler deploy` and `apps/web` to Pages, runs
`wrangler d1 migrations apply` before the API deploy, and deploys PR previews. Playwright smoke
test against the deployed URL after each production deploy.

**7 — Retire the old app.** After a week of real use, `legacy/` is deleted and Pages points at the
new build.

**Later — groups.** Better Auth's organizations plugin supplies orgs, members and invitations;
`workouts` gains a nullable `organization_id`, and the ownership checks written in phase 2 widen to
"owner or member". No schema rewrite.

## Testing

TDD means the test is written first for `packages/core` and for every API handler — those are
deterministic and cheap, and they are where the rules live. UI work is test-after with React
Testing Library, covering behaviour (the player advances, the builder totals update) rather than
markup.

- **Unit (Vitest)** — `core` compiler: step ordering, cumulative timings, progress segments,
  per-side splitting, EMOM rest, "start from section N", and the built-in workout compiling to the
  same step list the current app produces. That last one is a golden-file test generated from the
  existing `index.html` so the port is provably faithful.
- **Integration (Vitest + Miniflare)** — handlers against a real local D1 with migrations applied:
  auth required, ownership enforced, validation rejects bad payloads, session upsert is idempotent.
- **E2E (Playwright)** — sign in, run a workout to completion with a mocked clock, build a custom
  workout and run it, and an offline run using `context.setOffline(true)` that verifies the session
  syncs on reconnect. A test-only sign-in route, gated behind an env var that is never set in
  production, keeps Google out of the test path.
- **CI (GitHub Actions)** — one workflow: install (pnpm cache) → lint → typecheck → unit →
  integration → build → e2e (Playwright browser cache, trace on failure) → deploy on `main`.
  Branch protection on `main` once it is green.

## Verification

- `pnpm test` — unit and integration suites pass, including the golden-file test proving the ported
  compiler matches today's workout step-for-step.
- `pnpm dev` — wrangler and Vite together; sign in with Google, run the built-in workout, build a
  custom one, run it.
- `pnpm e2e` — Playwright against local dev, including the offline-and-resync spec.
- Airplane mode on a phone against the deployed site: open, start a session, complete it, restore
  signal, confirm it appears in history.
- The `legacy/` Pages URL still works throughout, until phase 7.

## What you'll need to set up

A Cloudflare account (free, no card) and an API token; a Google Cloud OAuth client ID and secret;
those three as GitHub Actions secrets. I'll tell you exactly when each is needed — phase 2 for
Google, phase 6 for Cloudflare — and nothing before then is blocked on them.

## Open, non-blocking

- **Magic links** need an email provider (Resend's free tier is 3k/month). Google-only until you
  want them.
- **Existing history** in your phone's `localStorage` can be imported on first sign-in with a small
  one-off migration. Worth doing only if you care about the numbers; say so and I'll add it to
  phase 5.
