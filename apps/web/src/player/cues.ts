/**
 * The things the player does to get your attention: beeps, buzzes and speech.
 *
 * Ported from the original app, tones and timings unchanged — they were tuned
 * to be audible over breathing and a bell hitting a mat, so they are worth
 * keeping exactly.
 *
 * Every call is best-effort. Audio can be blocked until a gesture, vibration
 * exists on roughly half of devices, and speech synthesis is missing or broken
 * in plenty of browsers. None of that should interrupt a workout, so failures
 * are swallowed rather than surfaced.
 */

export type SoundKind = 'count' | 'go' | 'rest' | 'half' | 'done';

let context: AudioContext | null = null;

/**
 * Create or resume the audio context.
 *
 * Must be called from inside a user gesture — browsers refuse to start audio
 * otherwise, and a context created too early starts suspended and stays silent
 * for the whole session.
 */
export function ensureAudio(): void {
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) context = new Ctor();
    }
    if (context?.state === 'suspended') void context.resume();
  } catch {
    // No audio available; the rest of the session carries on regardless.
  }
}

function blip(freq: number, dur: number, delay = 0, vol = 0.3, type: OscillatorType = 'sine') {
  if (!context) return;

  try {
    const t0 = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.type = type;
    osc.frequency.value = freq;
    // Ramped rather than switched, so it reads as a tone and not a click.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  } catch {
    // Ignore: a failed beep is not worth stopping for.
  }
}

export function playSound(kind: SoundKind): void {
  switch (kind) {
    case 'count':
      blip(880, 0.09, 0, 0.28);
      break;
    case 'go':
      blip(1175, 0.24, 0, 0.34, 'triangle');
      break;
    case 'rest':
      blip(523, 0.16, 0, 0.3);
      blip(392, 0.22, 0.17, 0.3);
      break;
    case 'half':
      blip(740, 0.08, 0, 0.3);
      blip(740, 0.08, 0.14, 0.3);
      break;
    case 'done':
      [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.26, i * 0.16, 0.32, 'triangle'));
      break;
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    // Not supported here.
  }
}

export function speak(text: string): void {
  if (!text) return;

  try {
    if (!('speechSynthesis' in window)) return;
    // Cancel first: cues arrive faster than they can be spoken, and a queue of
    // stale exercise names is worse than none.
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    // No speech available.
  }
}

export function stopSpeaking(): void {
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  } catch {
    // Nothing to stop.
  }
}

/* ------------------------------ wake lock ------------------------------ */

let lock: WakeLockSentinel | null = null;

/** Keep the screen on. The browser drops the lock when the tab is hidden. */
export async function requestWakeLock(): Promise<void> {
  try {
    if (!('wakeLock' in navigator)) return;
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
    });
  } catch {
    // Denied or unsupported; the screen will dim as usual.
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await lock?.release();
  } catch {
    // Already gone.
  }
  lock = null;
}
