import { expect, test, type Page } from '@playwright/test';
import crypto from 'node:crypto';

function uniqueEmail(prefix: string): string {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  return `${prefix}-${suffix}@kindling.test`;
}

/**
 * Presses Register or Sign in. The whole suite runs from one IP and makes about as many API
 * calls as the per-IP limit (60/min) allows, so a test can meet a 429 here. Like the on-screen
 * message asks a person to, wait out Retry-After and press the button again; the limiter is
 * not touched.
 */
async function submitAuthForm(page: Page, form: 'register' | 'login'): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes(`/api/v1/auth/${form}`) && res.request().method() === 'POST',
      ),
      page.getByTestId(`${form}-submit`).click(),
    ]);
    if (response.status() !== 429) return;
    const retryAfter = Number(response.headers()['retry-after'] ?? '5');
    await page.waitForTimeout((Number.isFinite(retryAfter) ? retryAfter : 5) * 1000 + 1000);
  }
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
    }),
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', 'expired-test-signature')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

test.describe('Kindling E2E (AI_PROVIDER=mock)', () => {
  test('full daily calibration flow: register -> Preset A -> cope -> brain-dump reflection -> slice task -> recalibrate -> 3 wins -> profile heatmap complete', async ({
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
    await submitAuthForm(page, 'register');

    // A new account lands on the welcome screen first, then goes on to the check-in
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByTestId('welcome-title')).toContainText('Welcome to Kindling, Kindling');
    await page.getByTestId('welcome-start').click();
    await expect(page).toHaveURL(/\/checkin$/);
    await expect(page.getByTestId('checkin-form')).toBeVisible();
    // The check-in opens with a short guide: what it's for, the three pillars, how it ends
    await page.getByTestId('checkin-guide-next').click();
    await expect(page.getByTestId('checkin-guide-pillars').locator('li')).toHaveCount(3);
    await page.getByTestId('checkin-guide-next').click();
    await expect(page.getByTestId('checkin-start')).toBeVisible();

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
    // Adaptive atmosphere: Preset A is a gentle day, so <html> takes the gentle palette and Ember quotes the reading
    await expect(page.locator('html')).toHaveAttribute('data-atmosphere', 'gentle');
    await expect(page.getByTestId('mood-greeting')).toContainText('physical energy is at 0%');
    await expect(page.getByTestId('score-physical_exhaustion')).toContainText('100');
    await expect(page.getByTestId('score-work_exhaustion')).toContainText('100');

    // 3. Choose a positive cope option. The 3 Wins stay locked until one is picked.
    await expect(page.getByTestId('skip-to-wins')).toHaveCount(0);
    await expect(page.getByTestId('skip-recovery')).toBeVisible();
    // The gentle mock's third card is the brain dump. Picking it opens the full-screen focus
    // room; closing it leaves a way back in without another request.
    const dumpCard = page.getByTestId('cope-card-cope_3');
    await expect(dumpCard).toBeVisible();
    await dumpCard.click();
    await expect(dumpCard).toContainText('Picked for today');
    await expect(page.getByTestId('focus-room')).toHaveAttribute('data-tool', 'brain_dump');
    await page.getByTestId('focus-room-close').click();
    await expect(page.getByTestId('focus-room')).toHaveCount(0);
    await expect(page.getByTestId('active-cope-tool')).toBeVisible();
    await expect(page.getByTestId('skip-to-wins')).toBeVisible();

    // 3b. Back in the room: fold the brain dump away and ask for a read-back (mock AI)
    await page.getByTestId('open-focus-room').click();
    await page
      .getByTestId('focus-dump-input')
      .fill('Too many deadlines this week and I keep sleeping late.');
    await page.getByTestId('focus-fold').click();
    await expect(page.getByTestId('focus-reflect-consent')).toContainText('Google Gemini');
    await page.getByTestId('focus-reflect-send').click();
    await expect(page.getByTestId('focus-reflection-text')).not.toBeEmpty();
    await expect(page.getByTestId('focus-reflection-theme').first()).toBeVisible();
    await expect(page.getByTestId('safety-banner')).toHaveCount(0);

    // 4. On to /wins from the reflection
    await page.getByTestId('focus-go-wins').click();
    await expect(page).toHaveURL(/\/wins$/);
    await expect(page.getByTestId('wins-progress-badge')).toContainText('0 / 3');

    // 5. Slice task on Work Win: details start folded so all three goals fit on one screen
    await expect(page.getByTestId('win-details-work')).toBeHidden();
    await page.getByTestId('win-details-toggle-work').click();
    await expect(page.getByTestId('win-details-toggle-work')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.getByTestId('slice-task-input').fill('Menyusun ringkasan modul laporan akhir');
    await page.getByTestId('slice-task-submit').click();
    // The slicing moment plays in the middle of the screen, shows the step, then waits for a tap
    const morph = page.getByTestId('task-morph');
    await expect(morph).toHaveAttribute('data-kind', 'slice');
    await expect(morph).toHaveAttribute('data-phase', 'done');
    await expect(page.getByTestId('task-morph-result')).toContainText('Step 1');
    await page.getByTestId('task-morph-close').click();
    await expect(morph).toHaveCount(0);
    await expect(page.getByTestId('work-micro-step-box')).toBeVisible();
    await expect(page.getByTestId('work-micro-step')).not.toBeEmpty();
    await expect(page.getByTestId('focus-timer')).toBeVisible();

    // 6. Recalibrate one pillar (physical: Level 0 -> Level 1)
    await expect(page.getByTestId('win-level-physical')).toContainText('Level 0');
    await page.getByTestId('recalibrate-physical').click();
    await expect(morph).toHaveAttribute('data-kind', 'shrink');
    await expect(morph).toHaveAttribute('data-phase', 'done');
    await page.getByTestId('task-morph-close').click();
    await expect(morph).toHaveCount(0);
    await expect(page.getByTestId('win-level-physical')).toContainText('Level 1');
    await expect(page.getByTestId('win-recal-physical')).toContainText(
      'Made lighter 1x · No penalty',
    );
    await expect(page.getByTestId('win-previous-physical')).toBeVisible();

    // 7. Toggle all 3 wins to completed
    // Each Done pops a mascot celebration; the third one shows the whole crew, then the
    // Milestone Paths. A tap closes it once the animation has played out.
    const celebration = page.getByTestId('win-celebration');
    await page.getByTestId('win-toggle-physical').click();
    await expect(celebration).toHaveAttribute('data-kind', 'win');
    await expect(celebration).toHaveAttribute('data-ready', 'true');
    await celebration.click();
    await expect(celebration).toBeHidden();
    await expect(page.getByTestId('wins-progress-badge')).toContainText('1 / 3');

    await page.getByTestId('win-toggle-work').click();
    await expect(celebration).toHaveAttribute('data-ready', 'true');
    await celebration.click();
    await expect(celebration).toBeHidden();
    await expect(page.getByTestId('wins-progress-badge')).toContainText('2 / 3');

    await page.getByTestId('win-toggle-soul').click();
    await expect(celebration).toHaveAttribute('data-kind', 'all');
    await expect(celebration).toHaveAttribute('data-beat', 'path');
    await expect(page.getByTestId('celebration-path-soul')).toContainText('1 win');
    await expect(celebration).toHaveAttribute('data-ready', 'true');
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
    await expect(page.getByTestId('stat-total_daily_wins')).toContainText('3');
    await expect(page.getByTestId('stat-total_checkpoints')).toContainText('0');

    // Milestone Path: one step on each pillar, no checkpoint yet (the first opens at 3 wins).
    // Each pillar has its own tab; the mascot stands at today's step.
    await expect(page.getByRole('tab', { name: /Physical/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('milestone-physical-marker')).toHaveText('Today you got here');
    for (const name of ['Physical', 'Work', 'Soul']) {
      await page.getByRole('tab', { name: new RegExp(name) }).click();
      await expect(
        page.getByRole('group', { name: `${name}: 1 win, 0 checkpoints` }),
      ).toBeVisible();
      await expect(page.getByTestId(`milestone-${name.toLowerCase()}-mascot`)).toBeVisible();
      await expect(page.getByRole('button', { name: /^Checkpoint/ })).toHaveCount(0);
    }

    // "Match colors to my day" switches the atmosphere off and back on, without a request
    const atmosphere = page.getByRole('switch', { name: 'Match colors to my day' });
    await expect(atmosphere).toHaveAttribute('aria-checked', 'true');
    await atmosphere.click();
    await expect(page.locator('html')).not.toHaveAttribute('data-atmosphere');
    await atmosphere.click();
    await expect(page.locator('html')).toHaveAttribute('data-atmosphere', 'gentle');

    // 9. After checking in, the first tab becomes "Today" and opens the day overview
    await expect(page.getByTestId('nav-checkin')).toContainText('Today');
    await page.getByTestId('nav-checkin').click();
    await expect(page).toHaveURL(/\/checkin$/);
    await expect(page.getByTestId('today-summary')).toBeVisible();
    await expect(page.getByTestId('today-wins-count')).toContainText('3 / 3');

    // 10. Signing back in opens on the welcome screen, which knows today is answered
    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill('SafePassw0rd123!');
    await submitAuthForm(page, 'login');
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByTestId('welcome-title')).toContainText('Welcome back');
    await page.getByTestId('welcome-to-wins').click();
    await expect(page).toHaveURL(/\/wins$/);
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
    await submitAuthForm(page, 'register');

    // "Answer later" right on the welcome screen
    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByTestId('welcome-later').click();

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
    await submitAuthForm(page, 'register');

    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByTestId('welcome-start').click();
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
      (res) => res.url().includes('/api/v1/auth/refresh') && res.request().method() === 'POST',
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

  test('habits: the check-in asks for them, wins are built from them, and a win can be swapped for today', async ({
    page,
  }) => {
    await page.goto('/register');
    await page.getByTestId('register-fullname').fill('Habit Flow User');
    await page.getByTestId('register-email').fill(uniqueEmail('e2e-habits'));
    await page.getByTestId('register-password').fill('HabitPassw0rd123!');
    await page.getByTestId('register-timezone').fill('Asia/Jakarta');
    await page.getByTestId('register-ai-consent').check();
    await submitAuthForm(page, 'register');
    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByTestId('welcome-start').click();
    await page.getByTestId('checkin-guide-skip').click();

    // Answer all 9 questions, stepping through each pillar's read and the conclusion.
    // Picking an answer moves on by itself, so there is no Next to press.
    await expect(page.getByTestId('checkin-next')).toHaveCount(0);
    for (let i = 0; i < 9; i++) {
      const label = page.getByTestId('checkin-step-label');
      await expect(label).toHaveText(`${i + 1} of 9`);
      const key = await page.locator('fieldset input[type=radio]').first().getAttribute('name');
      await page.getByTestId(`answer-${key}-2`).click();
      if (i === 2 || i === 6 || i === 8) await page.getByTestId('reading-continue').click();
    }
    await expect(page.getByTestId('conclusion-tier')).toBeVisible();
    await page.getByTestId('conclusion-continue').click();

    // First time: the habits form, one activity per pillar plus what gets in the way
    await expect(page.getByTestId('habits-form')).toBeVisible();
    await page.getByTestId('habit-physical-activity').fill('morning run');
    await page.getByTestId('habit-physical-struggle').fill('too sleepy');
    // A quick pick fills the soul habit in one tap
    await page.getByTestId('checkin-habit-soul-pick-0').click();
    await expect(page.getByTestId('habit-soul-activity')).toHaveValue('Reading');
    await page.getByTestId('habits-save').click();

    await page.getByTestId('fun-pick-0').click();
    await expect(page.getByTestId('checkin-fun-cope')).toHaveValue(
      'Listening to my favorite playlist',
    );
    await page.getByTestId('checkin-submit').click();
    await expect(page).toHaveURL(/\/cope$/);
    await page.getByTestId('welcome-skip').click();
    await expect(page.getByTestId('welcome-tour')).toHaveCount(0);

    await page.getByTestId('nav-wins').click();
    await page.getByTestId('wins-skip-recovery').click();

    // Physical and soul come from the habits; work, without one, is picked for the user
    await expect(page.getByTestId('win-habit-physical')).toContainText('morning run');
    await expect(page.getByTestId('win-title-physical')).toContainText('morning run');
    await expect(page.getByTestId('win-habit-soul')).toContainText(/reading/i);
    await expect(page.getByTestId('win-habit-work')).toHaveCount(0);

    // Swap the physical win for today only
    await page.getByTestId('swap-open-physical').click();
    await page.getByTestId('swap-pick-physical-0').click();
    await expect(page.getByTestId('swap-input-physical')).toHaveValue('Yoga in my room');
    await page.getByTestId('swap-submit-physical').click();
    await expect(page.getByTestId('task-morph-result')).toContainText(/yoga in my room/i);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('win-habit-physical')).toContainText('Just for today');
    await expect(page.getByTestId('win-title-physical')).toContainText(/yoga/i);

    // The standing habit is unchanged on the profile
    await page.getByTestId('nav-profile').click();
    await expect(page.getByTestId('habits-summary')).toContainText('morning run');
    await expect(page.getByTestId('habits-summary')).toContainText('too sleepy');
  });
});
