'use strict';

const BASE_URL = 'http://localhost:3000';
const PASSWORD = 'password123456';

/**
 * Generates a unique email address per test run to avoid DB conflicts.
 */
function uniqueEmail(prefix = 'testuser') {
  return `${prefix}+${Date.now()}+${Math.floor(Math.random() * 9999)}@example.com`;
}

/**
 * Signs up a new user and lands on the root page.
 */
async function signUp(page, email) {
  await page.goto(`${BASE_URL}/users/sign_up`);
  await page.locator('#user_email').fill(email);
  await page.locator('#user_password').fill(PASSWORD);
  await page.locator('#user_password_confirmation').fill(PASSWORD);
  await page.locator('input[type="submit"]').click();
  await page.waitForURL(`${BASE_URL}/`);
}

/**
 * Signs in an existing user and lands on the root page.
 */
async function signIn(page, email) {
  await page.goto(`${BASE_URL}/users/sign_in`);
  await page.locator('#user_email').fill(email);
  await page.locator('#user_password').fill(PASSWORD);
  await page.locator('input[type="submit"]').click();
  await page.waitForURL(`${BASE_URL}/`);
}

/**
 * Creates a new post and returns the URL of the created post's show page.
 */
async function createPost(page, title, body) {
  await page.goto(`${BASE_URL}/posts/new`);
  await page.locator('#post_title').fill(title);
  await page.locator('#post_html_body').fill(body);
  await page.locator('input[type="submit"]').click();
  // After create, the controller redirects to post_url(@post)
  await page.waitForURL(/\/posts\/\d+$/);
  return page.url();
}

/**
 * Deletes every post that belongs to the currently signed-in user.
 * Iterates the index page and clicks each "Delete post" button until none remain.
 * Requires a dialog handler to be registered before calling (see cleanupTestUser).
 */
async function deleteAllMyPosts(page) {
  await page.goto(`${BASE_URL}/`);

  // Keep deleting until no more delete buttons are visible for this user.
  // Uses waitForLoadState instead of waitForURL because Turbolinks may
  // redirect to the same URL (/), which would not trigger a URL-change event.
  while (true) {
    const deleteBtn = page.locator('a.btn-outline-danger').first();
    if ((await deleteBtn.count()) === 0) break;
    await deleteBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }
}

/**
 * Cancels (permanently deletes) the currently signed-in user account via
 * the Devise registration edit page.
 * Requires a dialog handler to be registered before calling (see cleanupTestUser).
 */
async function cancelAccount(page) {
  await page.goto(`${BASE_URL}/users/edit`);
  await page.locator('button', { hasText: 'Cancel my account' }).click();
  // Devise sends a DELETE /users and redirects to root. waitForLoadState is
  // more reliable than waitForURL here because the destination URL (/) is the
  // same one we may already be navigating through during the redirect chain.
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Full teardown: deletes all posts then removes the user account.
 * Safe to call regardless of test outcome – errors are logged but not re-thrown
 * so they never mask a real test failure.
 *
 * Usage (inside a spec file):
 *   const { cleanupTestUser } = require('./helpers');
 *   test.afterEach(async ({ page }) => { await cleanupTestUser(page); });
 */
async function cleanupTestUser(page) {
  // Auto-accept every browser confirm() dialog triggered by Rails UJS
  // (used for "Are you sure?" on delete-post and cancel-account actions).
  page.on('dialog', (dialog) => dialog.accept());

  try {
    await deleteAllMyPosts(page);
    await cancelAccount(page);
  } catch (error) {
    console.warn(`\n  [cleanup] Warning – could not fully clean up: ${error.message}`);
  }
}

module.exports = { BASE_URL, PASSWORD, uniqueEmail, signUp, signIn, createPost, cleanupTestUser };
