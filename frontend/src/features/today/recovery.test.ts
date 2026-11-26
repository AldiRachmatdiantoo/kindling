import { afterEach, describe, expect, it } from 'vitest';
import { isRecoverySkipped, skipRecovery } from './recovery';

describe('recovery skip storage isolation', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('scopes skipped state per userId and logDate', () => {
    skipRecovery('user-a', '2026-11-26');

    expect(isRecoverySkipped('user-a', '2026-11-26')).toBe(true);
    expect(isRecoverySkipped('user-b', '2026-11-26')).toBe(false);
    expect(isRecoverySkipped('user-a', '2026-11-27')).toBe(false);
  });

  it('ignores empty userId', () => {
    skipRecovery('', '2026-11-26');
    expect(isRecoverySkipped('', '2026-11-26')).toBe(false);
  });
});
