/**
 * Remembers that the user chose "Answer later" for today's check-in, so the app can
 * land them on the dashboard instead of the wizard. Scoped per user and per local
 * date: the choice expires on its own the next day and never leaks across accounts.
 */
const KEY_PREFIX = 'kindling:checkin-deferred';

function keyFor(userId: string): string {
  return `${KEY_PREFIX}:${userId}`;
}

export function deferCheckin(userId: string, logDate: string): void {
  try {
    window.localStorage.setItem(keyFor(userId), logDate);
  } catch {
    // Storage can be unavailable (private mode, quota); deferring then lasts for this visit only.
  }
}

export function isCheckinDeferred(userId: string, logDate: string): boolean {
  try {
    return window.localStorage.getItem(keyFor(userId)) === logDate;
  } catch {
    return false;
  }
}

export function clearCheckinDefer(userId: string): void {
  try {
    window.localStorage.removeItem(keyFor(userId));
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
