// The 3 Daily Wins open after one recovery moment. Skipping it is allowed (no pressure), and
// that choice only lasts for the day it was made.
const skipKey = (logDate: string) => `kindling:recovery-skipped:${logDate}`;

export function isRecoverySkipped(logDate: string): boolean {
  try {
    return localStorage.getItem(skipKey(logDate)) === '1';
  } catch {
    return false;
  }
}

export function skipRecovery(logDate: string): void {
  try {
    localStorage.setItem(skipKey(logDate), '1');
  } catch {
    // Storage blocked: the skip still applies for this visit through component state.
  }
}
