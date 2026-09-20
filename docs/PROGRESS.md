# Where the rewrite has got to

Last updated 2026-09-20, end of phase 2.

The approved plan is [`plan.md`](plan.md). This file records what is actually
built, what was decided along the way, and what to do next — so a session
picking this up cold (including from a phone) does not have to re-derive it.

## State

All work is on the `full-version` branch. `main` still holds the original
single-file app and still serves it from GitHub Pages, so the installed phone
app keeps working. Nothing merged to `main` yet.

- **Phase 1 — core domain: done.** `packages/core`, 57 tests.
- **Phase 2 — backend and auth: done.** `apps/api`, 51 tests.
- **Phase 3 — front end: not started.** This is the next piece of work.

108 tests pass. `pnpm lint`, `pnpm format:check` and `pnpm typecheck` are clean.

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

## Next: phase 3, the front end

Nothing in phase 3 is blocked on Google credentials — use the email/password
path, which is compiled in only when `TEST_AUTH_ENABLED` is set.

1. Scaffold `apps/web`: Vite + React + TypeScript + Tailwind, React Router,
   TanStack Query.
2. Port the three views and the player from `legacy/index.html` — same layout,
   same dark player, same phase colours, and keep the accessibility attributes
   (`role="timer"`, the `aria-live` regions, the reduced-motion block).
3. The player becomes a `useSession` hook over the step list from `@kb/core`;
   the audio, haptics, voice and wake-lock helpers (`legacy/index.html` around
   lines 301–332) become small typed modules.
4. Sign-in screen, workout list, session history.

Then phase 4 (builder), 5 (offline and sync), 6 (deploy), 7 (retire `legacy/`).

## Still outstanding

- **CI has never run.** It fires on a push to `full-version` or `main`. Check
  it, since workerd in Actions is the one thing not yet exercised.
- **Google OAuth client** — needed before real sign-in works. Redirect URIs are
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
pnpm test          # core, plus the API on the real Workers runtime
pnpm typecheck
pnpm lint

cp apps/api/.dev.vars.example apps/api/.dev.vars   # then fill it in
pnpm --filter @kb/api db:migrate:local
pnpm --filter @kb/api dev
```
