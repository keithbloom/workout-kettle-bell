# Kettlebell and mat

A 30 minute kettlebell and mat workout for your phone: strength, endurance and core, with guided timers, exercise descriptions and a separate interval timer. It runs entirely in the browser and works offline once it has loaded.

- **Workout:** warm-up, strength, endurance, core and cool-down, with a timer, beeps and instructions for every move.
- **Interval timer:** set work, rest and rounds, or pick a preset (Tabata, 30/30, 40/20, 45/15, 60/30).
- **Offline:** a service worker caches the app after the first visit. Settings and history are stored on the device.

No build step, no dependencies. It is one `index.html` plus a service worker and manifest.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

The service worker needs `http://localhost` or `https`, so open it through a server rather than double-clicking the file.

## Deploy to GitHub Pages

```sh
git init -b main
git add .
git commit -m "Kettlebell and mat workout app"
gh repo create kettlebell-and-mat --public --source=. --push
```

Then in the repo go to **Settings, Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save. The app will be at `https://<your-username>.github.io/kettlebell-and-mat/`.

## Install on a phone

Open the site once with a connection, then use **Add to Home Screen** (Safari share menu on iPhone, browser menu on Android). After that it opens and runs with no signal.

## Changing the workout

Exercises and their descriptions are in the `M` object near the top of the script in `index.html`. The order and timings of each section are in `buildWorkout()`. After editing, bump `VERSION` in `sw.js` so phones pick up the new copy.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app |
| `sw.js` | Offline caching |
| `manifest.webmanifest` | Install metadata |
| `icon-192.png`, `icon-512.png` | App icons |
| `.nojekyll` | Tells GitHub Pages to serve files as they are |
