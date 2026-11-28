import { shiftColors } from './atmosphere';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'kindling:theme';

/** The theme theme-init.js applied before React loaded (stored choice, else dark). */
export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme: Theme) {
  shiftColors();
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}
