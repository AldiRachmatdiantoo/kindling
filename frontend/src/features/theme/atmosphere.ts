import { useEffect, useSyncExternalStore } from 'react';
import type { CalibrationTier } from '../../api/types';
import type { TodayCheckinStatus } from '../today/TodayStatus';
import { getTodayInTimezone } from '../../utils/date';

/**
 * Adaptive atmosphere: today's calibration tier tints the accent colors and paces the
 * motion (index.css, html[data-atmosphere]). No check-in today, or the profile toggle off,
 * means no attribute and the default palette.
 */
export type Atmosphere = CalibrationTier;

const ENABLED_KEY = 'kindling:atmosphere';
const TODAY_KEY = 'kindling:atmosphere-today';
const CHANGE_EVENT = 'kindling:atmosphere-change';
/** How long the short color cross-fade runs; matches .k-atmosphere-shift in index.css. */
export const SHIFT_MS = 320;

export function atmosphereFor(tier: CalibrationTier | null, enabled: boolean): Atmosphere | null {
  return enabled && tier ? tier : null;
}

export function isAtmosphereEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAtmosphereEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.removeItem(ENABLED_KEY);
    else localStorage.setItem(ENABLED_KEY, 'off');
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  memoryEnabled = enabled;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Mirrors storage so the choice still works for this page when storage is blocked.
let memoryEnabled: boolean | null = null;
function readEnabled() {
  return memoryEnabled ?? isAtmosphereEnabled();
}
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** The "Match colors to my day" preference, live across components. */
export function useAtmosphereEnabled(): boolean {
  return useSyncExternalStore(subscribe, readEnabled, () => true);
}

/**
 * Remembers today's tier so theme-init.js can paint it before React loads: a reload never
 * flashes the default accent first. The timezone travels with it so the script can tell
 * whether "today" has passed.
 */
export function rememberTodayAtmosphere(tier: CalibrationTier, timezone: string) {
  try {
    localStorage.setItem(
      TODAY_KEY,
      JSON.stringify({ tier, date: getTodayInTimezone(timezone), tz: timezone }),
    );
  } catch {
    // Without storage the attribute still arrives once today's log loads.
  }
}

/** The tier remembered for today in that timezone, or null once the day has passed. */
export function readTodayAtmosphere(timezone: string): Atmosphere | null {
  try {
    const raw = localStorage.getItem(TODAY_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { tier?: string; date?: string; tz?: string };
    const valid = saved.tier === 'gentle' || saved.tier === 'balanced' || saved.tier === 'standard';
    return valid && saved.tz === timezone && saved.date === getTodayInTimezone(timezone)
      ? (saved.tier as Atmosphere)
      : null;
  } catch {
    return null;
  }
}

export function forgetTodayAtmosphere() {
  try {
    localStorage.removeItem(TODAY_KEY);
  } catch {
    // Nothing stored.
  }
}

/**
 * Sets or clears html[data-atmosphere]. A real change cross-fades colors briefly; the first
 * paint (theme-init.js) and prefers-reduced-motion switch instantly.
 */
export function applyAtmosphere(next: Atmosphere | null) {
  const root = document.documentElement;
  const current = root.dataset.atmosphere ?? null;
  if (current === next) return;
  shiftColors();
  if (next) root.dataset.atmosphere = next;
  else delete root.dataset.atmosphere;
}

let shiftTimer: ReturnType<typeof setTimeout> | null = null;
/** Adds .k-atmosphere-shift for one short cross-fade; the CSS only acts without reduced motion. */
export function shiftColors() {
  const root = document.documentElement;
  root.classList.add('k-atmosphere-shift');
  if (shiftTimer) clearTimeout(shiftTimer);
  shiftTimer = setTimeout(() => {
    root.classList.remove('k-atmosphere-shift');
    shiftTimer = null;
  }, SHIFT_MS + 80);
}

/**
 * Keeps <html> in step with today's check-in inside the signed-in shell. While the status is
 * still loading it holds the remembered tier (the one theme-init.js painted), so a reload
 * never blinks.
 */
export function useAtmosphereSync(
  tier: CalibrationTier | null,
  status: TodayCheckinStatus,
  timezone: string,
) {
  const enabled = useAtmosphereEnabled();

  useEffect(() => {
    if (tier) rememberTodayAtmosphere(tier, timezone);
    else if (status === 'open') forgetTodayAtmosphere();
  }, [tier, status, timezone]);

  useEffect(() => {
    const known = tier ?? (status === 'unknown' ? readTodayAtmosphere(timezone) : null);
    applyAtmosphere(atmosphereFor(known, enabled));
  }, [tier, status, enabled, timezone]);

  // Leaving the shell (signed-out pages) drops the tint.
  useEffect(
    () => () => {
      delete document.documentElement.dataset.atmosphere;
    },
    [],
  );
}
