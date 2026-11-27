/**
 * Marks a sign-up in this tab so the welcome screen can greet a new account as new.
 * Route state alone is not enough: the guest guard can redirect first and drop it.
 */
const KEY = 'kindling:just-registered';

export function markJustRegistered(): void {
  try {
    window.sessionStorage.setItem(KEY, '1');
  } catch {
    // Storage blocked: the welcome screen falls back to "Welcome back".
  }
}

export function isJustRegistered(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function clearJustRegistered(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
