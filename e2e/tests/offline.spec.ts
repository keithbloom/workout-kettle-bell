import { expect, test, type Page } from '@playwright/test';

/**
 * The reason this app exists on a phone: a gym with no signal.
 *
 * These drive the real browser with the network genuinely switched off, so
 * they cover the whole chain — the precached shell, the query cache in
 * IndexedDB, the outbox, and the flush on reconnect.
 */

async function signUp(page: Page): Promise<void> {
  const email = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { email, name: 'Offline', password: 'correct-horse-battery' },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/** Wait for the cache to hold what a session needs before cutting the network. */
async function warmTheCache(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Kettlebell and mat')).toBeVisible();

  await page.getByRole('link', { name: /Kettlebell and mat/ }).click();
  await expect(page.getByRole('button', { name: /Warm-up/ })).toBeVisible();

  // The persister throttles writes; give it its window before going offline.
  await page.waitForTimeout(2500);
}

test.beforeEach(async ({ page }) => {
  await signUp(page);
});

test('starts a workout with no connection', async ({ page, context }) => {
  await warmTheCache(page);
  await context.setOffline(true);

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Kettlebell and mat' })).toBeVisible();
  await page.getByRole('button', { name: 'Start workout' }).click();

  const player = page.getByRole('dialog', { name: 'Session in progress' });
  await expect(player).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();
});

test('keeps a session finished offline, and syncs it on reconnect', async ({ page, context }) => {
  await warmTheCache(page);
  await context.setOffline(true);
  await page.reload();

  // Skip to the end rather than waiting out thirty minutes.
  await page.getByRole('button', { name: 'Start workout' }).click();
  const player = page.getByRole('dialog', { name: 'Session in progress' });
  await expect(player).toBeVisible();

  for (let i = 0; i < 60; i++) {
    if (await page.getByText('Session complete').isVisible()) break;
    await player.getByRole('button', { name: 'Skip' }).click();
  }
  await expect(page.getByText('Session complete')).toBeVisible();
  await page.getByRole('button', { name: 'Back to the app' }).click();

  // Nothing reached the server, but the session is not lost.
  await expect(page.getByText(/waiting for a connection/)).toBeVisible();

  await context.setOffline(false);
  await page.reload();

  await expect(page.getByText(/waiting for a connection/)).toBeHidden();
  await expect(page.getByText(/1 session this week/)).toBeVisible();
});

/*
 * The builder is a lazily loaded chunk, so it is the one screen that needs a
 * second request to appear. The service worker precaches every chunk, which is
 * what makes that safe — this test is here to keep it that way.
 */
test('opens the builder with no connection', async ({ page, context }) => {
  await warmTheCache(page);
  await context.setOffline(true);
  await page.reload();

  await page.goto('/workouts/new');

  await expect(page.getByRole('heading', { name: 'New workout' })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
});

test('does not lose a session when the tab is closed before reconnecting', async ({
  page,
  context,
}) => {
  await warmTheCache(page);
  await context.setOffline(true);
  await page.reload();

  await page.getByRole('button', { name: 'Start workout' }).click();
  const player = page.getByRole('dialog', { name: 'Session in progress' });
  for (let i = 0; i < 60; i++) {
    if (await page.getByText('Session complete').isVisible()) break;
    await player.getByRole('button', { name: 'Skip' }).click();
  }
  await expect(page.getByText('Session complete')).toBeVisible();

  // Close the tab mid-session rather than tidying up, then come back online.
  const revisit = await context.newPage();
  await page.close();
  await context.setOffline(false);

  await revisit.goto('/');
  await expect(revisit.getByText(/1 session this week/)).toBeVisible();
});
