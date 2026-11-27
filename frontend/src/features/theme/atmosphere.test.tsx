import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CalibrationTier } from '../../api/types';
import type { TodayCheckinStatus } from '../today/TodayStatus';
import { getTodayInTimezone } from '../../utils/date';
import {
  atmosphereFor,
  rememberTodayAtmosphere,
  setAtmosphereEnabled,
  useAtmosphereSync,
} from './atmosphere';
import { AtmosphereToggle } from './AtmosphereToggle';
import themeInitScript from '../../../public/theme-init.js?raw';

const TZ = 'Asia/Jakarta';
const root = document.documentElement;

function sync(tier: CalibrationTier | null, status: TodayCheckinStatus) {
  return renderHook(({ t, s }) => useAtmosphereSync(t, s, TZ), {
    initialProps: { t: tier, s: status },
  });
}

beforeEach(() => {
  localStorage.clear();
  setAtmosphereEnabled(true);
  delete root.dataset.atmosphere;
  root.classList.remove('k-atmosphere-shift');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('atmosphereFor', () => {
  it('maps each tier to the attribute of the same name', () => {
    expect(atmosphereFor('gentle', true)).toBe('gentle');
    expect(atmosphereFor('balanced', true)).toBe('balanced');
    expect(atmosphereFor('standard', true)).toBe('standard');
  });

  it('gives no atmosphere without a check-in or with the toggle off', () => {
    expect(atmosphereFor(null, true)).toBeNull();
    expect(atmosphereFor('gentle', false)).toBeNull();
  });
});

describe('useAtmosphereSync', () => {
  it('sets data-atmosphere on <html> from today’s tier and follows a new one', () => {
    const { rerender } = sync('gentle', 'done');
    expect(root.dataset.atmosphere).toBe('gentle');
    rerender({ t: 'standard', s: 'done' });
    expect(root.dataset.atmosphere).toBe('standard');
  });

  it('leaves the attribute off when there is no check-in today', () => {
    sync(null, 'open');
    expect(root).not.toHaveAttribute('data-atmosphere');
  });

  it('drops the attribute when the toggle is switched off and restores it when on', () => {
    sync('gentle', 'done');
    act(() => setAtmosphereEnabled(false));
    expect(root).not.toHaveAttribute('data-atmosphere');
    expect(localStorage.getItem('kindling:atmosphere')).toBe('off');
    act(() => setAtmosphereEnabled(true));
    expect(root.dataset.atmosphere).toBe('gentle');
  });

  it('never applies a tier while the toggle is stored off', () => {
    localStorage.setItem('kindling:atmosphere', 'off');
    act(() => setAtmosphereEnabled(false));
    sync('standard', 'done');
    expect(root).not.toHaveAttribute('data-atmosphere');
  });

  it('holds the remembered tier while today is still loading, so nothing blinks', () => {
    rememberTodayAtmosphere('gentle', TZ);
    root.dataset.atmosphere = 'gentle';
    sync(null, 'unknown');
    expect(root.dataset.atmosphere).toBe('gentle');
    expect(root).not.toHaveClass('k-atmosphere-shift');
  });

  it('cross-fades only on a real change', () => {
    sync('balanced', 'done');
    expect(root).toHaveClass('k-atmosphere-shift');
  });

  it('forgets the remembered tier once today turns out to have no check-in', () => {
    rememberTodayAtmosphere('gentle', TZ);
    sync(null, 'open');
    expect(localStorage.getItem('kindling:atmosphere-today')).toBeNull();
  });

  it('removes the attribute when the shell unmounts', () => {
    const { unmount } = sync('gentle', 'done');
    unmount();
    expect(root).not.toHaveAttribute('data-atmosphere');
  });
});

describe('theme-init.js', () => {
  const run = () => new Function(themeInitScript)();

  it('paints today’s remembered tier before React loads inside the shell', () => {
    rememberTodayAtmosphere('gentle', TZ);
    window.history.replaceState(null, '', '/wins');
    run();
    expect(root.dataset.atmosphere).toBe('gentle');
  });

  it('skips a stale day, signed-out pages, and the toggle switched off', () => {
    localStorage.setItem(
      'kindling:atmosphere-today',
      JSON.stringify({ tier: 'gentle', date: '2001-01-01', tz: TZ }),
    );
    window.history.replaceState(null, '', '/wins');
    run();
    expect(root).not.toHaveAttribute('data-atmosphere');

    rememberTodayAtmosphere('gentle', TZ);
    window.history.replaceState(null, '', '/login');
    run();
    expect(root).not.toHaveAttribute('data-atmosphere');

    localStorage.setItem('kindling:atmosphere', 'off');
    window.history.replaceState(null, '', '/wins');
    run();
    expect(root).not.toHaveAttribute('data-atmosphere');
  });

  it('stores the date in the user’s timezone', () => {
    rememberTodayAtmosphere('standard', TZ);
    const saved = JSON.parse(localStorage.getItem('kindling:atmosphere-today') ?? '{}');
    expect(saved).toEqual({ tier: 'standard', date: getTodayInTimezone(TZ), tz: TZ });
  });
});

describe('AtmosphereToggle', () => {
  it('is on by default and saves "off" when switched', () => {
    render(<AtmosphereToggle />);
    const toggle = screen.getByRole('switch', { name: 'Match colors to my day' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem('kindling:atmosphere')).toBe('off');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('kindling:atmosphere')).toBeNull();
  });
});
