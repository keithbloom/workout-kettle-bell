import { expect, test, type Page } from '@playwright/test';

/**
 * The journey that matters: sign in, pick a workout, run some of it.
 *
 * Signing in uses email and password, which the Worker only enables when
 * TEST_AUTH_ENABLED is set. That keeps Google — and its consent screen — out of
 * the test path entirely, while still exercising the real session cookie.
 */

/** A fresh account per test, so tests never see each other's history. */
async function signUp(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { email, name: 'End to end', password: 'correct-horse-battery' },
  });
  expect(response.status(), await response.text()).toBe(200);

  return email;
}

test.describe('signed out', () => {
  test('asks you to sign in', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Kettlebell and mat' })).toBeVisible();
    await expect(page.getByRole('link', { name: /continue with google/i })).toBeVisible();
  });
});

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test('lists the built-in workout', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();
    await expect(page.getByText('Kettlebell and mat')).toBeVisible();
  });

  test('shows the sections of a workout', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Kettlebell and mat/ }).click();

    await expect(page.getByRole('button', { name: /Warm-up/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Strength/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cool-down/ })).toBeVisible();
  });

  test('opens a section to reveal the moves', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Kettlebell and mat/ }).click();
    await page.getByRole('button', { name: /Strength/ }).click();

    await expect(page.getByText('Goblet squat').first()).toBeVisible();
    await expect(page.getByText(/Hold the bell at your chest/)).toBeVisible();
  });

  test('runs a workout', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Kettlebell and mat/ }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();

    const player = page.getByRole('dialog', { name: 'Session in progress' });
    await expect(player).toBeVisible();

    // The workout opens with a five-second get-ready, then the first move.
    await expect(player.getByText('Get ready')).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(player.getByText('Cat-cow')).toBeVisible({ timeout: 10_000 });
  });

  test('skips through and shows the instructions', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Kettlebell and mat/ }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();

    const player = page.getByRole('dialog', { name: 'Session in progress' });
    await player.getByRole('button', { name: 'Skip' }).click();

    await expect(player.getByText(/Arch your back/)).toBeVisible();
  });

  test('confirms before abandoning a session', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Kettlebell and mat/ }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();

    const player = page.getByRole('dialog', { name: 'Session in progress' });
    await player.getByRole('button', { name: 'End session' }).click();

    await expect(page.getByText('End this session?')).toBeVisible();
    await page.getByRole('button', { name: 'Keep going' }).click();
    await expect(page.getByText('End this session?')).toBeHidden();
  });
});

test.describe('the interval timer', () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test('runs to the end and reports it', async ({ page }) => {
    await page.goto('/timer');

    // The shortest settings the controls allow, so the test is quick: 5s of
    // work, no rest, one round, no prep.
    await page.getByRole('button', { name: 'Decrease work' }).click({ clickCount: 10 });
    await page.getByRole('button', { name: 'Decrease rest' }).click({ clickCount: 10 });
    await page.getByRole('button', { name: 'Decrease rounds' }).click({ clickCount: 10 });
    await page.getByRole('button', { name: 'Decrease get ready' }).click({ clickCount: 10 });

    await page.getByRole('button', { name: 'Start timer' }).click();

    await expect(page.getByText('Timer finished')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Back to the app' }).click();
    await expect(page.getByRole('heading', { name: 'Interval timer' })).toBeVisible();
  });
});
