import { expect, test } from './fixtures';
import { connectedPair, resetRuntime, signedInPage, sql } from './helpers';

test.beforeEach(async () => {
  await resetRuntime();
  await sql(`delete from reports`);
});

// Banning a user also bans their IP, and every test here shares one IP: lift bans so later tests can run.
test.afterEach(async () => {
  await sql(`delete from bans`);
});

test('only moderators can open the moderation area', async ({ browser, request }) => {
  const { page } = await signedInPage(browser, request, { name: 'Plain' + Date.now() });
  await page.goto('/admin');
  await expect(page.getByText('Moderators only')).toBeVisible();
});

test('a report travels from a call to the moderator, who escalates and bans', async ({ browser, request }) => {
  const { a, b } = await connectedPair(browser);
  await b.getByLabel('Chat message').fill('evidence line from the reported user');
  await b.keyboard.press('Enter');
  await expect(a.getByText('evidence line from the reported user')).toBeVisible();
  await a.getByRole('button', { name: '⚑ Report' }).click();
  await a.getByRole('button', { name: 'Nudity / sexual content' }).click();
  await expect.poll(async () => (await sql(`select count(*)::int as n from reports`))[0].n).toBe(1);

  const { page: mod } = await signedInPage(browser, request, { name: 'Mod' + Date.now(), role: 'ADMIN' });
  await mod.goto('/admin');
  await expect(mod.getByRole('link', { name: /Nudity \/ sexual/ })).toBeVisible();
  await mod.getByRole('link', { name: /reported/ }).first().click();

  // evidence: the frame from the reported person's video and the chat before the report
  await expect(mod.getByAltText("Frame of the reported user's video")).toBeVisible();
  await expect(mod.getByText('evidence line from the reported user')).toBeVisible();

  // escalate: legal hold
  await mod.getByRole('button', { name: 'Escalate (legal hold)' }).click();
  await mod.getByRole('dialog').getByPlaceholder('Note for the record (optional)').fill('preserve');
  await mod.getByRole('button', { name: 'Escalate and hold' }).click();
  await expect(mod.getByText('LEGAL HOLD', { exact: true })).toBeVisible();
  expect((await sql(`select "legalHold", "evidenceExpiresAt" is null as no_expiry from reports`))[0]).toEqual({ legalHold: true, no_expiry: true });

  // ban (keyboard shortcut opens the confirmation)
  await mod.keyboard.press('b');
  await expect(mod.getByRole('heading', { name: 'Ban this user?' })).toBeVisible();
  await mod.getByRole('dialog').getByRole('button', { name: 'Ban', exact: true }).click();
  await expect(mod).toHaveURL(/\/admin$/);

  const [row] = await sql(`select u.status, r.status as rstatus, r."legalHold" from reports r join users u on u.id = r."reportedUserId"`);
  expect(row).toEqual({ status: 'BANNED', rstatus: 'RESOLVED', legalHold: true });
  expect((await sql(`select count(*)::int as n from audit_logs`))[0].n).toBeGreaterThanOrEqual(2); // escalated + resolved
  void b;
});

test('the audit log shows what moderators did', async ({ browser, request }) => {
  const { page: mod } = await signedInPage(browser, request, { name: 'Auditor' + Date.now(), role: 'ADMIN' });
  await mod.goto('/admin/audit');
  await expect(mod.getByRole('heading', { name: 'Audit log' })).toBeVisible();
});
