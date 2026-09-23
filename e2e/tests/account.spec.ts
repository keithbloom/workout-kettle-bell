import { expect, test, type Page } from '@playwright/test';

/**
 * Being able to see whose account you are in, and get out of it.
 */

async function signIn(page: Page): Promise<{ email: string; name: string }> {
  const email = `account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const name = 'Keith Bloom';
  const res = await page.request.post('/api/auth/sign-up/email', {
    data: { email, name, password: 'correct-horse-battery' },
  });
  expect(res.status(), await res.text()).toBe(200);
  return { email, name };
}

test('shows who is signed in on every screen', async ({ page }) => {
  const { name } = await signIn(page);

  for (const path of ['/', '/timer', '/settings']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: `Account: ${name}` })).toBeVisible();
  }
});

test('the account element leads to the account page', async ({ page }) => {
  const { email, name } = await signIn(page);
  await page.goto('/');

  await page.getByRole('link', { name: `Account: ${name}` }).click();

  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();
});

/*
 * Initials must be on screen straight away, not after a round trip.
 *
 * The short timeout is the point: an earlier version rendered the image first
 * and fell back only once Gravatar had answered "no picture", which left an
 * empty circle for as long as that took. Playwright's usual five-second retry
 * window hid it completely.
 */
test('shows initials immediately when there is no picture', async ({ page }) => {
  await signIn(page);
  await page.goto('/account');

  await expect(page.locator('.avatar').first()).toHaveText('KB', { timeout: 250 });
});

test('signs you out from the account page', async ({ page }) => {
  await signIn(page);
  await page.goto('/account');

  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  expect((await page.request.get('/api/me')).status()).toBe(401);
});

test('settings points at the account page rather than holding sign out', async ({ page }) => {
  await signIn(page);
  await page.goto('/settings');

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden();
  await page.getByRole('link', { name: 'Go to your account' }).click();

  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
});

test('there is no account element when signed out', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  await expect(page.locator('.account-link')).toBeHidden();
});
