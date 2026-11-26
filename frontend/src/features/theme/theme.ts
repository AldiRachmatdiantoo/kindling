export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'kindling:theme';

/** The theme index.html already applied before React loaded (stored choice, else the OS). */
export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}
