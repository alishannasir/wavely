import { expect, test } from '@playwright/test';
import { apiRegister, newContext, signedInPage, sql, uniq } from './helpers';

test('a banned user appeals and a moderator restores the account', async ({ browser, request }) => {
  const user = await apiRegister(request, { name: uniq('Appealer') });
  await sql(`update users set status = 'BANNED' where email = $1`, [user.email]);

  const page = await (await newContext(browser)).newPage();
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(user.email);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText(/suspended or banned/)).toBeVisible();
  await page.getByRole('link', { name: 'Appeal this decision' }).click();

  await expect(page).toHaveURL(/\/appeal\?email=/);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: 'Check my account' }).click();
  await expect(page.getByText('Your account is banned')).toBeVisible();
  await page.getByRole('textbox').fill('Please look again: my cousin used my laptop that night, it was not me at all.');
  await page.getByRole('button', { name: 'Send appeal' }).click();
  await expect(page.getByText('Your appeal was sent')).toBeVisible();

  // a moderator approves it
  const { page: mod } = await signedInPage(browser, request, { name: uniq('Mod'), role: 'MODERATOR' });
  await mod.goto('/admin/appeals');
  await expect(mod.getByText('my cousin used my laptop')).toBeVisible();
  await mod.getByRole('button', { name: 'Approve and restore' }).click();
  await mod.getByRole('dialog').getByPlaceholder('Note for the user (optional)').fill('Verified, welcome back');
  await mod.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(mod.getByText('No appeals here.')).toBeVisible();

  expect((await sql(`select status from users where email = $1`, [user.email]))[0].status).toBe('ACTIVE');
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(user.email);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/chat/);
});
