// The 3 Daily Wins open after one recovery moment. Skipping it is allowed (no pressure), and
// that choice only lasts for the day it was made and never leaks across accounts.
const skipKey = (userId: string, logDate: string) =>
  `kindling:recovery-skipped:${userId}:${logDate}`;

export function isRecoverySkipped(userId: string, logDate: string): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(skipKey(userId, logDate)) === '1';
  } catch {
    return false;
  }
}

export function skipRecovery(userId: string, logDate: string): void {
  if (!userId) return;
  try {
    localStorage.setItem(skipKey(userId, logDate), '1');
  } catch {
    // Storage blocked: the skip still applies for this visit through component state.
  }
}
