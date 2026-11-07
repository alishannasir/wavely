import { expect, test } from './fixtures';
import { API, apiRegister, clearMail, linkIn, mailTo, newContext, signedIn, signedInPage, sql, uniq } from './helpers';

test.beforeEach(async () => {
  await clearMail();
});

test('sign up, confirm the email from the link, and the banner goes away', async ({ browser }) => {
  const page = await (await newContext(browser)).newPage();
  const name = uniq('Newbie');
  const email = `${name.toLowerCase()}@e2e.test`;
  await page.goto('/signup');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill('password123');
  await page.getByPlaceholder('Display name').fill(name);
  await page.getByLabel('Date of birth (18+ required)').fill('1990-01-01');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/chat/);

  await page.goto('/me');
  await expect(page.getByText('Confirm your email')).toBeVisible();

  const mail = await mailTo(email, 'Confirm your email');
  await page.goto(linkIn(mail));
  await expect(page.getByText('Your email is confirmed')).toBeVisible();
  await page.goto('/me');
  await expect(page.getByText('Confirm your email')).toHaveCount(0);

  // the link works once
  await page.goto(linkIn(mail));
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
});

test('forgot password: reset by email, old password stops working', async ({ browser, request }) => {
  const user = await apiRegister(request, { name: uniq('Forgetful') });
  const page = await (await newContext(browser)).newPage();
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await page.getByPlaceholder('Email').fill(user.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your inbox')).toBeVisible();

  const mail = await mailTo(user.email, 'Reset your');
  await page.goto(linkIn(mail));
  await page.getByPlaceholder('New password (8+ characters)').fill('brandnewpass1');
  await page.getByPlaceholder('Repeat the new password').fill('brandnewpass1');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Your password was changed')).toBeVisible();
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

  await page.getByPlaceholder('Email').fill(user.email);
  await page.getByPlaceholder('Password').fill(user.password); // the old one
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Invalid credentials')).toBeVisible();
  await page.getByPlaceholder('Password').fill('brandnewpass1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/chat/);
});

test('account page: change password, download my data, delete the account', async ({ browser, request }) => {
  const user = await apiRegister(request, { name: uniq('Keeper') });
  const context = await newContext(browser);
  await signedIn(context, user);
  const page = await context.newPage();
  await page.goto('/account');

  await page.getByPlaceholder('Current password').fill(user.password);
  await page.getByPlaceholder('New password (8+ characters)').fill('changedpass12');
  await page.getByPlaceholder('Repeat the new password').fill('changedpass12');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  // this device stays signed in with a fresh token, the old token is dead
  const stale = await request.get(`${API}/users/me`, { headers: { authorization: `Bearer ${user.access_token}` } });
  expect(stale.status()).toBe(401);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my data' }).click()]);
  expect(download.suggestedFilename()).toBe('my-data.json');

  await page.getByRole('button', { name: 'Delete my account…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Your password').fill('wrong-password');
  await dialog.getByRole('button', { name: 'Delete forever' }).click();
  await expect(dialog.getByText('Your password is not correct')).toBeVisible();
  await dialog.getByPlaceholder('Your password').fill('changedpass12');
  await dialog.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page).toHaveURL(/localhost:5190\/$/);
  expect((await sql(`select count(*)::int as n from users where email = $1`, [user.email]))[0].n).toBe(0);
});

test('a page for a signed-out visitor sends them to log in', async ({ browser }) => {
  const page = await (await newContext(browser)).newPage();
  await page.goto('/account');
  await expect(page).toHaveURL(/localhost:5190\/$/);
});

test('the login is an HttpOnly cookie: scripts and saved page data never hold the token', async ({ browser, request }) => {
  const { page } = await signedInPage(browser, request);
  await page.goto('/me');
  await expect(page.getByRole('link', { name: 'Chat' }).first()).toBeVisible(); // signed in via the cookie alone
  await expect(page).toHaveURL(/\/me$/);
  const seen = await page.evaluate(() => ({ cookies: document.cookie, saved: localStorage.getItem('ovc-auth') ?? '' }));
  expect(seen.cookies).not.toContain('ovc_session'); // HttpOnly: invisible to scripts
  expect(seen.saved).not.toMatch(/eyJ/); // no JWT in storage
  const cookie = (await page.context().cookies()).find((c) => c.name === 'ovc_session');
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
  // sign out clears it on the server side
  await page.evaluate(() => fetch('http://localhost:3990/api/auth/logout', { method: 'POST', credentials: 'include' }));
  expect((await page.context().cookies()).find((c) => c.name === 'ovc_session')).toBeUndefined();
});
