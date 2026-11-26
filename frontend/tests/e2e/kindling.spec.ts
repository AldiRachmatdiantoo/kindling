import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';

function uniqueEmail(prefix: string): string {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  return `${prefix}-${suffix}@kindling.test`;
}

function getTodayInJakarta(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Builds a syntactically valid HS256 JWT whose `exp` is in the past so the backend
 * rejects it with 401 UNAUTHENTICATED, simulating an expired access token.
 */
function buildExpiredJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: '01930000-0000-7000-8000-000000000000',
      iat: nowSec - 3600,
      exp: nowSec - 60,
      jti: 'expired-e2e-token',
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', 'expired-test-signature')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

test.describe('Kindling E2E (AI_PROVIDER=mock)', () => {
  test('full daily calibration flow: register -> Preset A -> cope -> slice task -> recalibrate -> 3 wins -> profile heatmap complete', async ({
    page,
  }) => {
    const email = uniqueEmail('e2e-flow');
    const today = getTodayInJakarta();

    // 1. Register new user
    await page.goto('/register');
    await expect(page.getByTestId('register-form')).toBeVisible();

    await page.getByTestId('register-fullname').fill('Kindling E2E User');
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill('SafePassw0rd123!');
    await page.getByTestId('register-timezone').fill('Asia/Jakarta');
    await page.getByTestId('register-ai-consent').check();
    await page.getByTestId('register-submit').click();

    // Redirects to /checkin
    await expect(page).toHaveURL(/\/checkin$/);
    await expect(page.getByTestId('checkin-form')).toBeVisible();
    // A friendly intro explains the questions before the first one appears
    await expect(page.getByTestId('checkin-intro')).toBeVisible();

    // 2. Click Demo Preset A and submit
    await page.getByTestId('preset-a-button').click();
    await expect(page.getByTestId('checkin-fun-cope')).not.toHaveValue('');
    await page.getByTestId('checkin-submit').click();

    // Redirects to /cope with gentle tier & scores
    await expect(page).toHaveURL(/\/cope$/);

    // First visit to the dashboard: Ember's welcome tour, skippable
    await expect(page.getByTestId('welcome-tour')).toBeVisible();
    await expect(page.getByTestId('welcome-step')).toContainText('1/6');
    await page.getByTestId('welcome-skip').click();
    await expect(page.getByTestId('welcome-tour')).toHaveCount(0);

    await expect(page.getByTestId('calibration-tier-badge')).toContainText('Gentle Mode');
    // Adaptive atmosphere: the whole app takes on the gentle mood and Ember quotes the reading
    await expect(page.locator('html')).toHaveAttribute('data-mood', 'gentle');
    await expect(page.getByTestId('mood-greeting')).toContainText('physical energy is at 0%');
    await expect(page.getByTestId('score-physical_exhaustion')).toContainText('100');
    await expect(page.getByTestId('score-work_exhaustion')).toContainText('100');

    // 3. Choose a positive cope option
    const firstCopeCard = page.getByTestId('cope-card-cope_1');
    await expect(firstCopeCard).toBeVisible();
    await firstCopeCard.click();
    await expect(firstCopeCard).toContainText('Picked for today');
    // The pick opens the full-screen focus room; closing it leaves a way back in
    await expect(page.getByTestId('focus-room')).toBeVisible();
    await page.getByTestId('focus-room-close').click();
    await expect(page.getByTestId('focus-room')).toHaveCount(0);
    await expect(page.getByTestId('active-cope-tool')).toBeVisible();

    // 4. Navigate to /wins
    await page.getByTestId('skip-to-wins').click();
    await expect(page).toHaveURL(/\/wins$/);
    await expect(page.getByTestId('wins-progress-badge')).toContainText('0 / 3');

    // 5. Slice task on Work Win
    await page.getByTestId('slice-task-input').fill('Menyusun ringkasan modul laporan akhir');
    await page.getByTestId('slice-task-submit').click();
    await expect(page.getByTestId('work-micro-step-box')).toBeVisible();
    await expect(page.getByTestId('work-micro-step')).not.toBeEmpty();
    await expect(page.getByTestId('focus-timer')).toBeVisible();

    // 6. Recalibrate one pillar (physical: Level 0 -> Level 1)
    await expect(page.getByTestId('win-level-physical')).toContainText('Level 0');
    await page.getByTestId('recalibrate-physical').click();
    await expect(page.getByTestId('win-level-physical')).toContainText('Level 1');
    await expect(page.getByTestId('win-recal-physical')).toContainText('Made lighter 1x · No penalty');
    await expect(page.getByTestId('win-previous-physical')).toBeVisible();

    // 7. Toggle all 3 wins to completed
    // Each Done pops a mascot celebration; the third one shows the whole crew. Tap to close.
    const celebration = page.getByTestId('win-celebration');
    await page.getByTestId('win-toggle-physical').click();
    await expect(celebration).toHaveAttribute('data-kind', 'win');
    await celebration.click();
    await expect(celebration).toBeHidden();
    await expect(page.getByTestId('wins-progress-badge')).toContainText('1 / 3');

    await page.getByTestId('win-toggle-work').click();
    await celebration.click();
    await expect(celebration).toBeHidden();
    await expect(page.getByTestId('wins-progress-badge')).toContainText('2 / 3');

    await page.getByTestId('win-toggle-soul').click();
    await expect(celebration).toHaveAttribute('data-kind', 'all');
    await celebration.click();
    await expect(celebration).toBeHidden();
    await expect(page.getByTestId('wins-progress-badge')).toContainText('3 / 3');

    // 8. Open /profile and verify today's heatmap square is level "complete"
    await page.getByTestId('nav-profile').click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId('heatmap-grid')).toBeVisible();

    const todayCell = page.getByTestId(`heatmap-cell-${today}`);
    await expect(todayCell).toBeVisible();
    await expect(todayCell).toHaveAttribute('data-level', 'complete');

    // Verify lifetime milestone counters reflect today's completion
    await expect(page.getByTestId('stat-total_active_days')).toContainText('1');
    await expect(page.getByTestId('stat-total_complete_days')).toContainText('1');
    await expect(page.getByTestId('stat-total_daily_wins')).toContainText('3');

    // 9. After checking in, the first tab becomes "Today" and opens the day overview
    await expect(page.getByTestId('nav-checkin')).toContainText('Today');
    await page.getByTestId('nav-checkin').click();
    await expect(page).toHaveURL(/\/checkin$/);
    await expect(page.getByTestId('today-summary')).toBeVisible();
    await expect(page.getByTestId('today-wins-count')).toContainText('3 / 3');
  });

  test('"Answer later" skips the check-in, lands on the dashboard, and the choice survives "/"', async ({
    page,
  }) => {
    const email = uniqueEmail('e2e-defer');

    await page.goto('/register');
    await page.getByTestId('register-fullname').fill('Defer Flow User');
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill('DeferPassw0rd123!');
    await page.getByTestId('register-timezone').fill('Asia/Jakarta');
    await page.getByTestId('register-ai-consent').check();
    await page.getByTestId('register-submit').click();

    await expect(page).toHaveURL(/\/checkin$/);
    await page.getByTestId('checkin-answer-later').click();

    await expect(page).toHaveURL(/\/wins$/);

    // The welcome tour can be stepped through to the end
    await expect(page.getByTestId('welcome-tour')).toBeVisible();
    for (let i = 0; i < 6; i++) await page.getByTestId('welcome-next').click();
    await expect(page.getByTestId('welcome-tour')).toHaveCount(0);

    await expect(page.getByTestId('wins-pending')).toBeVisible();

    await page.getByTestId('nav-cope').click();
    await expect(page.getByTestId('cope-pending')).toBeVisible();

    // The home route respects the deferral instead of forcing the wizard again
    await page.getByTestId('brand-logo').click();
    await expect(page).toHaveURL(/\/wins$/);

    // Answering later is still one click away
    await page.getByTestId('wins-pending-start').click();
    await expect(page).toHaveURL(/\/checkin$/);
    await expect(page.getByTestId('checkin-form')).toBeVisible();
  });

  test('transparent token refresh after access token expires rotates cookies and keeps session alive', async ({
    page,
    context,
  }) => {
    const email = uniqueEmail('e2e-refresh');

    // 1. Register and confirm authenticated session
    await page.goto('/register');
    await page.getByTestId('register-fullname').fill('Refresh Flow User');
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill('RefreshPassw0rd123!');
    await page.getByTestId('register-timezone').fill('Asia/Jakarta');
    await page.getByTestId('register-ai-consent').check();
    await page.getByTestId('register-submit').click();

    await expect(page).toHaveURL(/\/checkin$/);
    await expect(page.getByTestId('checkin-form')).toBeVisible();

    // 2. Capture initial cookies (including HttpOnly access_token & refresh_token)
    const beforeCookies = await context.cookies();
    const initialAccess = beforeCookies.find((c) => c.name === 'access_token');
    const initialRefresh = beforeCookies.find((c) => c.name === 'refresh_token');
    const initialCsrf = beforeCookies.find((c) => c.name === 'csrf_token');

    expect(initialAccess).toBeDefined();
    expect(initialRefresh).toBeDefined();
    expect(initialCsrf).toBeDefined();
    expect(initialAccess?.httpOnly).toBe(true);
    expect(initialRefresh?.httpOnly).toBe(true);
    expect(initialCsrf?.httpOnly).toBe(false);

    // 3. Replace access_token with an expired JWT while preserving refresh_token & csrf_token
    await context.addCookies([
      {
        name: 'access_token',
        value: buildExpiredJwt(),
        domain: initialAccess!.domain,
        path: initialAccess!.path,
        httpOnly: true,
        secure: initialAccess!.secure,
        sameSite: initialAccess!.sameSite,
      },
    ]);

    // 4. Listen for automatic POST /api/v1/auth/refresh triggered by 401
    const refreshResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/v1/auth/refresh') && res.request().method() === 'POST'
    );

    // Trigger authenticated API call by navigating to /profile
    await page.getByTestId('nav-profile').click();

    const refreshRes = await refreshResponsePromise;
    expect(refreshRes.status()).toBe(200);

    // 5. User stays authenticated and /profile loads successfully
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId('heatmap-grid')).toBeVisible();

    // 6. Verify access_token and refresh_token were both rotated
    const afterCookies = await context.cookies();
    const rotatedAccess = afterCookies.find((c) => c.name === 'access_token');
    const rotatedRefresh = afterCookies.find((c) => c.name === 'refresh_token');

    expect(rotatedAccess).toBeDefined();
    expect(rotatedRefresh).toBeDefined();
    expect(rotatedAccess?.value).not.toBe(initialAccess?.value);
    expect(rotatedAccess?.value).not.toBe(buildExpiredJwt());
    expect(rotatedRefresh?.value).not.toBe(initialRefresh?.value);

    // 7. Reload page to prove the newly rotated access_token works for /auth/me
    await page.reload();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId('heatmap-grid')).toBeVisible();
  });
});
