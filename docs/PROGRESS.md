# Where the rewrite has got to

Last updated 2026-09-22, phase 6 in progress.

The approved plan is [`plan.md`](plan.md). This file records what is actually
built, what was decided along the way, and what to do next — so a session
picking this up cold (including from a phone) does not have to re-derive it.

## State

All work is on the `full-version` branch. `main` still holds the original
single-file app and still serves it from GitHub Pages, so the installed phone
app keeps working. Nothing merged to `main` yet.

- **Phase 1 — core domain: done.** `packages/core`, 57 tests.
- **Phase 2 — backend and auth: done.** `apps/api`, 51 tests.
- **Phase 3 — front end: done.** `apps/web`, plus the Playwright suite.
- **Phase 4 — the workout builder: done.** Build, edit, copy and delete.
- **Phase 5 — offline and sync: done.** Installable, runs without a signal.
- **Phase 6 — deploy: live** at
  https://kettlebell-and-mat.keith-bloom.workers.dev.
- **Phase 7 — retire the old app: done.** `legacy/` deleted, GitHub Pages off.

194 unit and integration tests, and 19 end-to-end tests against the built app.
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

**The fidelity guarantee.** `test/fixtures/legacy-steps.json` records the 47
steps the original app produced, taken by running its own
`buildWorkout`/`finalize` before it was retired.
`test/legacy-fidelity.test.ts` checks the compiler still produces those steps
with the same timings, labels and cues, totalling 1820 seconds. **If you change
the compiler, this test is the one that matters.**

The fixture can no longer be regenerated — the app that produced it is gone —
which is the point. It is evidence, not output.

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

### The builder

`src/builder/draft.ts` holds the editing rules as pure functions over a draft,
so they are tested on their own and the screen only renders and dispatches. The
draft is a `WorkoutDraft` plus a `key` on every block and item: React needs a
stable identity per row to reorder a list without muddling the inputs inside
it, and position is not that identity. `toWorkoutDraft` strips the keys.

The running total comes from `compileWorkout` — the same function the player
runs — so what the builder promises and what the session delivers cannot drift.

Reordering uses up and down buttons rather than drag-and-drop, a deliberate
departure from the plan: this is a phone-first app used with sweaty hands, and
a drag target is harder to hit and much harder to operate with a screen reader
or a keyboard.

`GET /api/workouts/:id` returns `canEdit` alongside the workout, so the client
is told whether the Edit button belongs on screen rather than inferring it.

### Offline

The old app worked without a signal and so does this one, but now with an
account behind it.

- **The shell** is precached by a service worker (`vite-plugin-pwa`), so the
  app opens with no network. The manifest and icons come from the original.
- **The data** is the TanStack Query cache persisted into IndexedDB: workouts,
  the exercise catalogue, and `me`. That last one matters — sign-in is
  required, so without a cached user an offline app decides you are signed out
  and shows the sign-in screen, in a gym, with no way past it. A network
  failure leaves the cached user in place; a real 401 signs you out properly.
- **Finished sessions** go to an outbox in IndexedDB (`src/offline/outbox.ts`)
  _before_ any attempt to send them, so a session survives a closed tab or a
  dead battery. `useSync` drains it on open, on `online`, and when the tab
  returns to the foreground — a phone that has been in a pocket often never
  fires `online`, because as far as it knows it was only asleep.

The API upserts on `(user_id, client_id)`, so a replayed flush is a no-op. A
4xx is treated as permanent and the session is dropped, because retrying cannot
help and one unacceptable session would otherwise block the queue forever.

### One Worker, one origin

Decided 2026-09-22: everything is hosted on Cloudflare, on `*.workers.dev`, and
GitHub Pages goes away.

This is **one Worker**, not the Pages-plus-Workers split the original plan
assumed. The Worker serves the built web app as static assets and handles
`/api` itself:

```jsonc
"assets": {
  "directory": "../web/dist",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"]
}
```

Everything that is a file is served straight from the asset store without
waking the Worker; `/api/*` goes to the handler; anything else returns the app
so client-side routing works.

This is simpler — one deploy, one URL, one config — and it settles the
same-origin question by removing it. The session cookie is an ordinary
first-party cookie, and there is no CORS middleware because there is no
cross-origin request to permit. In development the Vite proxy reproduces the
same arrangement, so cookies behave identically.

`apps/web/dist` must be built before wrangler packages the Worker. The deploy
workflow and the Playwright config both do this.

### `e2e` — Playwright

Drives **exactly what gets deployed**: one Worker serving the built app and the
API from a single origin, over a local D1. Built, not dev-served — the service
worker and everything offline only exist in a production build, so testing the
dev server would skip the lot. Playwright builds the app and starts the Worker
itself, so `pnpm e2e` is the whole command.

Tests sign in with an email and password, which keeps Google and its consent
screen out of the test path while still exercising the real session cookie.

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
- **Changing `database_id` re-keys the local database.** Wrangler stores local
  D1 state per id, so pointing at a different one silently gives you an empty
  database until `pnpm --filter @kb/api db:migrate:local` is run again. The
  symptom is every end-to-end test failing at once.
- **Relative imports have no extension** (`from './session'`). The workspace
  is on `moduleResolution: "bundler"` and every consumer is a bundler, so the
  `.js` suffix the ESM convention asks for bought nothing and read as though
  the browser were loading files one by one.
- **`@kb/core` is never built.** Its `exports` points at the TypeScript source
  and both consumers bundle it, so there is no emit step. That also matters
  given the line above: `tsc` would emit extensionless imports, which a plain
  Node consumer could not resolve. `typecheck` still compiles it.
- **`@kb/core` declares `"sideEffects": false`.** Without it a bundler keeps
  every module the barrel re-exports, so importing `compileWorkout` dragged the
  Zod contract and the seed data into the main bundle even though nothing on
  that path used them. Any new package in the workspace wants the same
  declaration — everything here is pure.
- **The builder is a lazily loaded chunk**, because it is the only thing that
  needs Zod and most visits are someone running a workout, not writing one.
  First load is 103 KB gzipped rather than 130 KB. The service worker precaches
  every chunk, so it still opens offline; there is a test for exactly that.
- **Never persist a signed-out answer.** The `me` query is cached to IndexedDB
  so the app opens offline, but persisting `null` meant that arriving signed
  out recorded "nobody", and the next load restored it, treated it as fresh,
  and showed the sign-in screen to somebody holding a valid session. `me` is
  now persisted only when there is a user, and always revalidated on mount —
  the cache is a fallback for a failed request, not an answer in its own right.
- **A deploy used to take two page loads to appear.** The precached shell kept
  serving the previous build on the first visit after a deploy, so a fix looked
  like it had not worked — which cost real time during the sign-in debugging.
  The app now registers the service worker itself (`registerSW` from
  `virtual:pwa-register`, with `injectRegister: null`) and reloads once the new
  version takes control. When debugging anything that looks stale, check the
  bundle filename in the page source against the one the build printed.
- **Cookies are SameSite=Lax, and must stay that way.** The app and the API
  are one origin. An earlier version forced `SameSite=None` from when they were
  going to be separate; browsers restrict None as part of phasing out
  third-party cookies, and the symptom was a Google sign-in that completed,
  redirected home, and left you signed out. There is a test asserting the
  attribute.
- **Signing out reloads the page.** `queryClient.clear()` empties the cache
  without telling mounted components to reconsider, so the screen stayed as it
  was and you appeared still signed in. Sign-out also deletes the persisted
  cache, or the restored copy would put the previous user back on screen.
- **`APP_URL` is a comma-separated list of origins.** Better Auth checks the
  Origin and the `callbackURL` against it, and rejects anything else with
  `Invalid callbackURL` — which does not obviously point at a port. Local
  development needs both 5173 (dev) and 4173 (preview, used by the tests).
- **Mutations must invalidate the individual workout, not just the list.**
  Workouts are cached for half an hour, so an edit that only invalidates
  `['workouts']` saves correctly and then shows the previous version on the
  detail screen. This shipped once and is covered by an end-to-end test now.
- **`.btn2` sets its colour explicitly.** Inside a coloured section band the
  inherited colour is the band's foreground, which on the button's white
  background is invisible.
- **Better Auth's social sign-in is a POST, not a link.** You POST
  `/api/auth/sign-in/social` with `{provider, callbackURL}`, it mints the state
  and PKCE challenge, and hands back a URL to send the browser to. An `<a href>`
  to the same path is a GET, which has no route and 404s — which is exactly
  what shipped once.

## Deployed

**https://kettlebell-and-mat.keith-bloom.workers.dev**

One Worker serving the built app and the API over D1, on the free tier.

## Deploying

**Automatic.** A push to `main` builds the app, applies migrations to the remote
D1, deploys the Worker, and smoke-tests the live URL. Roughly thirty seconds.
`workflow_dispatch` re-runs it by hand.

Because every push to `main` deploys, work happens on a branch and lands when
it is ready.

Set up once, and done:

- D1 database `kb-db`, its id in `apps/api/wrangler.jsonc`.
- Worker secrets `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, set with `wrangler secret put`. Never in the repo or
  in GitHub.
- GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and the
  repository variable `APP_URL` that the smoke test reads.
- The Google OAuth client lists
  `https://kettlebell-and-mat.keith-bloom.workers.dev/api/auth/callback/google`
  as an authorised redirect URI.

A deploy that fails with `Invalid format for Authorization header [code: 6111]`
means the API token secret has whitespace in it, not that its permissions are
wrong. Re-set it with the whitespace stripped.

To deploy by hand:

```sh
pnpm --filter @kb/web build
pnpm --filter @kb/api exec wrangler deploy
```

## Next

Nothing planned. Outstanding items, in rough order of worth:

- **Scope the outbox by user**, described above.
- **Magic-link sign-in**, so Google is not the only way in. Needs an email
  provider; Resend's free tier is 3k/month.
- **Groups and shared workouts**, the original reason `workouts` carries an
  unused `organization_id`. Better Auth's organisations plugin supplies orgs,
  members and invitations, and the ownership checks written in phase 2 widen
  from "owner" to "owner or member".
- **Importing the history** from the old app's `localStorage`, if you still
  have a device with it.

## Known gap: the outbox is not scoped to a user

Sessions waiting in the outbox carry no user id. Signing out attempts a final
flush, but if that fails — offline, say — and somebody else then signs in on the
same device, those sessions would be recorded against the new account. A
single-person phone never hits this. Scoping the outbox by user id would fix
it properly.

## The account UI

Built 2026-09-23, as asked for.

- **An account element** in the top corner of every signed-in screen: avatar
  plus first name, linking to the account page.
- **An account page** at `/account` with your name, email, what you have
  trained, and signing out. Settings keeps only the device preferences and
  links across.
- **The avatar** falls back in order: the picture Google gave us (Better Auth
  stores it on the user, and `GET /api/me` now returns it), then Gravatar, then
  initials.

The initials are drawn first and a picture layered over them once it has
actually loaded. Rendering the image first and falling back on error leaves an
empty circle for as long as the request takes — and Gravatar answering "no
picture" is a round trip like any other. A test asserts the initials appear
within 250ms for exactly this reason; the usual five-second retry window hid
the problem completely.

Gravatar is asked for by SHA-256 of the address, which the browser hashes
natively, rather than the older MD5 form that would mean shipping a hash
implementation. It does send a hash of the email to a third party, and only
happens when the provider gave us no picture.

## Still outstanding

- **Google sign-in is covered up to the consent screen, not through it.** An
  end-to-end test checks the button reaches Google with a valid `client_id` and
  `redirect_uri`; nothing can click Google's consent screen, so the callback
  and the first real sign-in are still unverified.
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
