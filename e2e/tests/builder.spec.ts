import { expect, test, type Page } from '@playwright/test';

/**
 * Building a workout and then running it.
 *
 * The point of the round trip is that the builder's promise and the session
 * are the same thing: the minutes it quotes come from the same compiler the
 * player runs, so a workout that says four minutes had better take four.
 */

async function signUp(page: Page): Promise<void> {
  const email = `builder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { email, name: 'Builder', password: 'correct-horse-battery' },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/** Add an exercise to the first block through the picker. */
async function addExercise(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Add an exercise' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Choose an exercise' });
  await sheet.getByLabel('Search exercises').fill(name);
  await sheet
    .getByRole('button', { name: new RegExp(name) })
    .first()
    .click();
  await expect(sheet).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await signUp(page);
});

test('builds a workout, then runs it', async ({ page }) => {
  await page.goto('/workouts/new');

  await page.getByLabel('Name', { exact: true }).fill('Quick and nasty');
  await page.getByLabel('Description', { exact: true }).fill('Two moves, three rounds.');

  await addExercise(page, 'Goblet squat');
  await addExercise(page, 'Kettlebell swing');

  // Two moves at 40s work and 20s rest, three rounds: 5 minutes and 40 seconds.
  await page.getByLabel('Rounds', { exact: true }).fill('3');
  await expect(page.getByText(/5:40 in \d+ steps/)).toBeVisible();

  await page.getByRole('button', { name: 'Save workout' }).click();

  await expect(page.getByRole('heading', { name: 'Quick and nasty' })).toBeVisible();
  await expect(page.getByText('Two moves, three rounds.')).toBeVisible();

  await page.getByRole('button', { name: 'Start workout' }).click();
  const player = page.getByRole('dialog', { name: 'Session in progress' });

  await expect(player.getByText('Goblet squat')).toBeVisible();
  await expect(player.getByText('Round 1 of 3')).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText('40');
});

test('keeps the workout after a reload', async ({ page }) => {
  await page.goto('/workouts/new');
  await page.getByLabel('Name', { exact: true }).fill('Persisted');
  await addExercise(page, 'Goblet squat');
  await page.getByRole('button', { name: 'Save workout' }).click();

  await expect(page.getByRole('heading', { name: 'Persisted' })).toBeVisible();
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Persisted' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Persisted')).toBeVisible();
});

test('will not save a workout without a name', async ({ page }) => {
  await page.goto('/workouts/new');
  await addExercise(page, 'Goblet squat');

  await page.getByRole('button', { name: 'Save workout' }).click();

  await expect(page.getByText('Give the workout a name.')).toBeVisible();
});

test('will not save a block with no exercises', async ({ page }) => {
  await page.goto('/workouts/new');
  await page.getByLabel('Name', { exact: true }).fill('Empty');

  await page.getByRole('button', { name: 'Save workout' }).click();

  await expect(page.getByText('Every block needs at least one exercise.')).toBeVisible();
});

test('edits a workout it already saved', async ({ page }) => {
  await page.goto('/workouts/new');
  await page.getByLabel('Name', { exact: true }).fill('First name');
  await addExercise(page, 'Goblet squat');
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByRole('heading', { name: 'First name' })).toBeVisible();

  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Second name');
  await page.getByRole('button', { name: 'Save workout' }).click();

  await expect(page.getByRole('heading', { name: 'Second name' })).toBeVisible();
});

test('copies the built-in workout so it can be changed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Kettlebell and mat/ }).click();

  // A built-in cannot be edited, only copied.
  await expect(page.getByRole('link', { name: 'Edit' })).toBeHidden();
  await page.getByRole('link', { name: 'Make my own copy' }).click();

  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Kettlebell and mat (copy)');
  await page.getByRole('button', { name: 'Save workout' }).click();

  await expect(page.getByRole('heading', { name: 'Kettlebell and mat (copy)' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible();
});

test('deletes a workout', async ({ page }) => {
  await page.goto('/workouts/new');
  await page.getByLabel('Name', { exact: true }).fill('Throwaway');
  await addExercise(page, 'Goblet squat');
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByRole('heading', { name: 'Throwaway' })).toBeVisible();

  // Deleting asks twice, in case of a mis-tap mid-session.
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Tap again to delete' }).click();

  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();
  await expect(page.getByText('Throwaway')).toBeHidden();
});
