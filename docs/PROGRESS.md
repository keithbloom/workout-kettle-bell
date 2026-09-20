# Where the rewrite has got to

Last updated 2026-09-20, end of phase 3.

The approved plan is [`plan.md`](plan.md). This file records what is actually
built, what was decided along the way, and what to do next — so a session
picking this up cold (including from a phone) does not have to re-derive it.

## State

All work is on the `full-version` branch. `main` still holds the original
single-file app and still serves it from GitHub Pages, so the installed phone
app keeps working. Nothing merged to `main` yet.

- **Phase 1 — core domain: done.** `packages/core`, 57 tests.
- **Phase 2 — backend and auth: done.** `apps/api`, 51 tests.
- **Phase 3 — front end: done.** `apps/web`, 50 tests, plus 8 end-to-end.
- **Phase 4 — the workout builder: not started.** This is the next piece of work.

158 unit and integration tests, and 8 end-to-end tests against the real stack.
`pnpm lint`, `pnpm format:check` and `pnpm typecheck` are clean.

## Decisions taken when the plan was approved

Cloudflare (Pages + Workers + D1) · offline-first with sync · Better Auth with
Google, magic links later · full-fidelity section/block workout model ·
sign-in required, no guest mode · the old app kept live until v2 is proven.

## What exists

### `packages/core` — the domain, pure and tested

`compileWorkout` turns an authored workout into the flat step list the player
runs; `compileInterval` does the same for the interval timer. The builder will
call `compileWorkout` for its live duration preview, so a preview cannot drift
from the session you actually get.

Four block kinds cover everything: `timed_circuit`, `reps`, `emom`, `hold`.
Items handle sides (`each-side` expands into two steps, `switch-halfway`
carries a midpoint cue and an optional `switchNoun` so rows still say "switch
arms").

`schema.ts` is the Zod wire contract, shared by the API and the future builder.

**The fidelity guarantee.** `scripts/extract-legacy-steps.mjs` slices the
original `buildWorkout`/`finalize` out of `legacy/index.html`, runs them, and
records the 47 steps they produce. `test/legacy-fidelity.test.ts` checks the
new compiler still produces those steps with the same timings, labels and cues,
totalling 1820 seconds. CI regenerates the fixture so it cannot be edited to
make a failing test pass. **If you change the compiler, this test is the one
that matters.**

One deliberate behaviour change, asserted in its own test: the 15-second break
before Endurance used to be a `rest` tacked onto Strength and is now
Endurance's own `prep`.

### `apps/api` — Hono on Workers, D1, Better Auth

Endpoints, all behind a session except health:

| Method   | Path                     | Notes                                  |
| -------- | ------------------------ | -------------------------------------- |
| `GET`    | `/api/health`            | public                                 |
| `*`      | `/api/auth/*`            | Better Auth                            |
| `GET`    | `/api/me`                |                                        |
| `GET`    | `/api/exercises`         | the catalogue                          |
| `GET`    | `/api/workouts`          | built-ins plus your own                |
| `GET`    | `/api/workouts/:id`      | full definition                        |
| `POST`   | `/api/workouts`          | create, returns `{ id }`               |
| `PUT`    | `/api/workouts/:id`      | replace contents                       |
| `DELETE` | `/api/workouts/:id`      |                                        |
| `POST`   | `/api/workouts/:id/copy` | your own copy of anything you can read |
| `POST`   | `/api/sessions`          | record a finished run                  |
| `GET`    | `/api/sessions`          | history plus `thisWeek`                |

`requireUser` is applied to the whole router, so a new endpoint is private by
default and has to be moved out to become public.

Tests run inside workerd against a local D1 with the real migrations applied —
no Cloudflare account, no network.

### `apps/web` — React, Tailwind, and the player

The original app's three screens, ported: a workout list, a workout laid out as
coloured section bands that open to reveal the moves, the interval timer, and
settings. Plus a sign-in screen, since an account is now required.

**`src/player/session.ts` is the piece to understand.** The session engine is
pure functions over a state value that take `now` as an argument rather than
reading the clock. That is what makes the awkward parts testable without fake
timers: overshoot when a tick arrives late, time given back after a pause, the
beeps in the last three seconds. It performs no effects — it returns them as
events, and `usePlayer.ts` decides what to do with them.

The styling is mostly plain CSS rather than Tailwind utilities, deliberately.
The visual language is a custom-property cascade: a section sets
`data-phase="strength"` and everything inside follows from `--pbg`, `--pfg` and
`--pacc`; the player re-points the same three variables to switch between work
and rest. Utilities would mean naming every combination at every call site.

### `e2e` — Playwright

Drives the real app against the real Worker and a local D1. Playwright starts
both servers itself, so `pnpm e2e` is the whole command. Tests sign in with an
email and password, which keeps Google and its consent screen out of the test
path while still exercising the real session cookie.

`pnpm test` deliberately excludes these, since they need live servers.

## Things that will bite you if you forget them

- **D1 allows 100 bound parameters per statement.** A twenty-item workout needs 160. Inserts are chunked by column count in `saveWorkoutContents` and the
  whole replacement runs in one `batch` (which D1 treats as a transaction).
  Any new multi-row insert needs the same care.
- **`compatibility_date` is pinned to 2026-08-22**, because the workerd the
  vitest pool bundles is older than the one wrangler ships. A newer date makes
  every API test fail at startup with a confusing runtime error.
- **Versions are pinned through a pnpm catalog** in `pnpm-workspace.yaml`
  (typescript, vitest, zod). Installing a package that pulls its own major
  caused real drift once already. The Workers vitest pool needs vitest 4.x.
- **pnpm 12 calls the build-script allowlist `allowBuilds`**, not
  `onlyBuiltDependencies`. It is in `pnpm-workspace.yaml`; esbuild and workerd
  are approved.
- **`@cloudflare/vitest-pool-workers` 0.22 dropped `defineWorkersConfig`.**
  Config is now a normal vitest `defineConfig` with the `cloudflareTest()`
  plugin.
- **Section row ids are scoped by workout id** (`<workout>:<section>`), because
  a section id is a primary key across the whole table while the domain's
  `Section.id` is only a local handle.
- **A `.d.ts` must not share a basename with a `.ts`** in the same folder —
  `src/env.d.ts` beside `src/env.ts` silently shadowed it. The ambient
  declarations live in `src/bindings.d.ts`.
- **`exactOptionalPropertyTypes` is off in `apps/web` and `e2e`**, on
  everywhere else. In domain code the difference between "absent" and
  "explicitly undefined" is worth catching; in React it only fights the idiom
  of passing an optional prop straight through.
- **An exercise name appears twice on a player step** — once as the title and
  once as the heading of the instructions panel. A plain text query matches
  both, in Testing Library and in Playwright's strict mode. Query `.p-title`
  for the heading.
- **The countdown only beeps on steps longer than three seconds**, or a
  three-second prep would beep from the moment it began. Ported from the
  original, and easy to lose.

## Next: phase 4, the workout builder

The API side is already built and tested (`POST`/`PUT`/`DELETE /api/workouts`
and the copy endpoint), so this phase is pure UI.

1. Start from a copy of a workout, or from empty.
2. Add and reorder sections; add blocks of the four kinds; pick exercises from
   the catalogue with search and filtering; set per-item doses and sides.
3. A live "this is N minutes" total by calling `compileWorkout` in the browser —
   the same function the player uses, so the preview cannot drift.
4. Validate with `workoutDraftSchema` from `@kb/core` before sending, so the
   builder and the API agree on what is legal.

Then phase 5 (offline and sync), 6 (deploy), 7 (retire `legacy/`).

## Still outstanding

- **Google sign-in has never been exercised end to end.** The credentials are
  in `apps/api/.dev.vars`, but every test signs in with a password instead. Try
  the "Continue with Google" button by hand before relying on it.
- **Google OAuth client** — configured locally. Redirect URIs are
  `<API origin>/api/auth/callback/google`, i.e.
  `http://localhost:8787/api/auth/callback/google` locally. Keep the consent
  screen in Testing mode and add yourself as a test user; that avoids
  verification, and Google's 7-day refresh-token expiry does not matter because
  we issue our own 90-day session cookie.
- **Cloudflare account and D1 database** — not needed until phase 6.
  `wrangler.jsonc` has a placeholder `database_id`.
- **Magic links** need an email provider (Resend's free tier). Google-only
  until then.
- **Importing your existing phone history** from `localStorage` is optional and
  unscheduled; say if you want it and it goes in phase 5.

## Running it

```sh
pnpm install
pnpm test          # core, web and the API; not the end-to-end tests
pnpm typecheck
pnpm lint

cp apps/api/.dev.vars.example apps/api/.dev.vars   # then fill it in
pnpm --filter @kb/api db:migrate:local

pnpm --filter @kb/api dev     # the Worker, on :8787
pnpm --filter @kb/web dev     # the app, on :5173, proxying /api to the Worker

pnpm e2e           # starts both servers itself
```

`.dev.vars` sets `TEST_AUTH_ENABLED`, so a dev build offers email-and-password
sign-in as well as Google. Production never sets it.
