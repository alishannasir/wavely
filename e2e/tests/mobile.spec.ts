import { expect, test } from '@playwright/test';
import { guestPage, pressStart, resetRuntime, startAsGuest, newContext, waitInCall } from './helpers';

test.beforeEach(async () => {
  await resetRuntime();
});

test('phone layout: bottom tab bar, profile tab, no sideways scrolling', async ({ browser }) => {
  const page = await guestPage(browser, 'mobile');
  const nav = page.getByRole('navigation', { name: 'App' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link')).toHaveText(['Chat', 'Friends', 'Premium', 'Profile']);

  await nav.getByRole('link', { name: 'Profile' }).click();
  await expect(page).toHaveURL(/\/me/);
  await expect(page.getByText('Create a free account').first()).toBeVisible();

  for (const path of ['/', '/faq', '/rules', '/me', '/chat', '/login']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
});

test('phone layout: the tab bar hides during a call and the report button is always visible', async ({ browser }) => {
  const phone = await guestPage(browser, 'mobile');
  const desktop = await guestPage(browser, 'desktop');
  await pressStart(phone);
  await expect(phone.getByText('Looking for someone')).toBeVisible();
  await expect(phone.getByRole('navigation', { name: 'App' })).toHaveCount(0);
  await pressStart(desktop);
  await waitInCall(phone);
  await expect(phone.getByRole('navigation', { name: 'App' })).toHaveCount(0);
  await expect(phone.getByRole('button', { name: '⚑ Report' })).toBeVisible();
  await expect(phone.getByRole('button', { name: 'Next' })).toBeVisible();
  void startAsGuest;
  void newContext;
});
