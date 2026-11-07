import { expect, test } from '@playwright/test';
import { connectedPair, resetRuntime, sql } from './helpers';

test.beforeEach(async () => {
  await resetRuntime();
  await sql(`delete from reports`);
});

test('reporting someone saves evidence and moves on to the next person', async ({ browser }) => {
  const { a, b } = await connectedPair(browser);
  await b.getByLabel('Chat message').fill('this is the message that gets reported');
  await b.keyboard.press('Enter');
  await expect(a.getByText('this is the message that gets reported')).toBeVisible();

  await a.getByRole('button', { name: '⚑ Report' }).click();
  await expect(a.getByRole('heading', { name: 'Report this person' })).toBeVisible();
  await a.getByRole('button', { name: 'Harassment' }).click();

  await expect(a.getByText('Looking for someone')).toBeVisible();
  await expect(b.getByText('Stranger left')).toBeVisible();

  await expect
    .poll(async () => (await sql(`select count(*)::int as n from reports`))[0].n)
    .toBe(1);
  const [r] = await sql(`select "reasonCode", source, "evidenceImage" is not null as has_image, "chatLog" from reports`);
  expect(r.reasonCode).toBe('HARASSMENT');
  expect(r.source).toBe('USER');
  expect(r.has_image).toBe(true); // a frame of the reported person's video
  expect(JSON.stringify(r.chatLog)).toContain('this is the message that gets reported'); // recorded by the server
});

test('blocking someone ends the call and they are never matched again', async ({ browser }) => {
  const { a, b } = await connectedPair(browser);
  await a.getByRole('button', { name: 'Block' }).click();
  await expect(a.getByRole('heading', { name: /^Block / })).toBeVisible();
  await a.getByRole('button', { name: 'Block and skip' }).click();

  await expect(a.getByText('Looking for someone')).toBeVisible();
  await expect(b.getByText('Stranger left')).toBeVisible();
  expect((await sql(`select count(*)::int as n from blocks`))[0].n).toBe(1);

  // both are searching and are the only two people around: they must not meet
  await a.waitForTimeout(6000);
  await expect(a.getByText('Connection established')).toHaveCount(0);
  await expect(b.getByText('Connection established')).toHaveCount(0);

  // the block shows up in Profile and can be undone
  await a.goto('/me');
  await a.getByRole('button', { name: 'Blocked people' }).click();
  await expect(a.getByRole('dialog').getByText(/^Guest\d+/)).toBeVisible();
  await a.getByRole('button', { name: 'Unblock' }).click();
  await expect(a.getByText('You have not blocked anyone.')).toBeVisible();
  expect((await sql(`select count(*)::int as n from blocks`))[0].n).toBe(0);
});

test('free minutes run out: countdown, then the call ends with the upgrade prompt', async ({ browser }) => {
  test.setTimeout(180_000);
  await sql(`update plan_limits set "dailyMinutes" = 1 where plan = 'FREE'`);
  try {
    const { a, b } = await connectedPair(browser);
    await expect(a.getByTitle('Free chat time left today')).toHaveText(/^[01]:\d\d left$/);

    // within about a minute the server ends the call; the person who ran out sees the prompt
    await expect
      .poll(
        async () =>
          (await a.getByRole('heading', { name: 'Daily limit reached' }).count()) + (await b.getByRole('heading', { name: 'Daily limit reached' }).count()),
        { timeout: 100_000, intervals: [1000] },
      )
      .toBeGreaterThan(0);
    const limited = (await a.getByRole('heading', { name: 'Daily limit reached' }).count()) > 0 ? a : b;
    const other = limited === a ? b : a;
    await expect(other.getByText('Stranger left')).toBeVisible();
    await expect(limited.getByRole('link', { name: 'Create an account' })).toBeVisible(); // guests are sent to sign up

    // a new search is refused
    await limited.getByRole('button', { name: 'Maybe later' }).click();
    await limited.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(limited.getByRole('heading', { name: 'Daily limit reached' })).toBeVisible();
  } finally {
    await sql(`update plan_limits set "dailyMinutes" = 30 where plan = 'FREE'`);
  }
});
