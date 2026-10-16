// ============================================
// DEVELOPMENT FRAME-TIMER
//
// Measures JavaScript frame intervals in the game loop and logs a
// summary every WINDOW frames. It is active only when __DEV__ is true,
// so it does nothing in production builds.
//
// These are JavaScript frame intervals, not GPU presentation times.
// Treat the numbers as estimates. Confirm FPS with the Expo performance
// monitor or a native profiler on the device.
//
// It never touches React state, so it causes no re-renders.
// ============================================

const WINDOW = 300;

// A frame longer than this counts as a visible stutter (about 2 frames at 60 fps).
const STUTTER_MS = 33.4;

export function createFrameTimer(label = 'game') {
  const enabled = typeof __DEV__ !== 'undefined' && __DEV__;

  let last = 0;
  let samples = [];

  return {
    tick() {
      if (!enabled) return;

      // performance.now() has sub-millisecond resolution where it exists.
      const now =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();

      if (last !== 0) {
        samples.push(now - last);
      }

      last = now;

      if (samples.length < WINDOW) return;

      const sorted = samples.slice().sort((a, b) => a - b);
      const total = samples.reduce((sum, value) => sum + value, 0);
      const average = total / samples.length;
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const max = sorted[sorted.length - 1];
      const stutters = samples.filter((value) => value > STUTTER_MS).length;

      console.log(
        `[FRAMES:${label}] avg ${average.toFixed(1)} ms ` +
          `(≈${(1000 / average).toFixed(1)} fps est.), ` +
          `p95 ${p95} ms, max ${max} ms, ` +
          `stutters>${STUTTER_MS}ms: ${stutters}/${samples.length}`
      );

      samples = [];
    },

    reset() {
      last = 0;
      samples = [];
    },
  };
}
