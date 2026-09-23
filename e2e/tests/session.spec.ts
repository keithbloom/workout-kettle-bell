import { expect, test, type Page } from '@playwright/test';

/**
 * Signing out and back in again.
 *
 * This is the sequence that broke in production. Signing out wrote "nobody"
 * into the persisted query cache, and because the user query was considered
 * fresh for minutes, the next load restored that answer, never asked the
 * server, and showed the sign-in screen to somebody holding a valid session.
 *
 * Google cannot be driven from a test, but the failure had nothing to do with
 * Google: any valid session arriving after a sign-out reproduced it.
 */

async function signIn(page: Page): Promise<string> {
  const email = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await page.request.post('/api/auth/sign-up/email', {
    data: { email, name: 'Session', password: 'correct-horse-battery' },
  });
  expect(res.status(), await res.text()).toBe(200);
  return email;
}

test('a session acquired after browsing signed out is honoured', async ({ page }) => {
  // Arriving signed out is what poisoned the cache: the app recorded "nobody"
  // and, on the next load, believed it without asking.
  await page.goto('/');
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();

  // The persister throttles writes; let the signed-out answer reach disk.
  await page.waitForTimeout(2500);

  // Now a session appears, exactly as it does on the way back from Google.
  await signIn(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeHidden();
});

test('signing out clears the session and the screen', async ({ page }) => {
  await signIn(page);
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  // And it is a real sign-out, not just a screen change.
  expect((await page.request.get('/api/me')).status()).toBe(401);
});

test('a reload keeps you signed in', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();
});
