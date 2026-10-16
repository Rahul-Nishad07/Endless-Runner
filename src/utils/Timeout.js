// ============================================
// TIMEOUT HELPER
//
// Rejects if a promise does not settle in time. Used so a stalled asset
// download or model parse fails visibly, instead of leaving the game
// screen blank with no error.
// ============================================

export function withTimeout(promise, ms, label) {
  let timer = null;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000} s`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}
