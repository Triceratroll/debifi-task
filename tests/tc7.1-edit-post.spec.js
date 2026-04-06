'use strict';

/**
 * TC 7.1 – Edit post functionality does not work
 *
 * Bug description:
 *   The PostsController#update action never calls update/save on the post record.
 *   It finds the post and immediately redirects with "Post was saved" notice,
 *   leaving the original content unchanged in the database.
 *
 *   Broken controller code:
 *     def update
 *       @post = current_user.posts.find(params[:id])
 *       redirect_to post_url(@post), notice: 'Post was saved'   # ← no .update() call
 *     end
 *
 * Expected behaviour: After submitting the edit form, the post's title and body
 *   are persisted and the updated content is visible on the show page.
 *
 * This test FAILS because the bug is present.
 */

const { test, expect } = require('@playwright/test');
const { uniqueEmail, signUp, createPost, cleanupTestUser, BASE_URL } = require('./helpers');

// Runs after every test (pass or fail) – removes all posts and the user account.
test.afterEach(async ({ page }, testInfo) => {
  // The test body can consume most of the 30s budget, leaving cleanup with
  // almost no time. Bump the total budget so afterEach always has a full 30s.
  testInfo.setTimeout(testInfo.timeout + 30_000);
  await cleanupTestUser(page);
});

test('TC 7.1 – editing a post should persist the new content', async ({ page }) => {
  const email = uniqueEmail('tc71');
  await signUp(page, email);

  // ── 1. Create a post to edit later ────────────────────────────────────────
  const originalTitle = 'Original Title – Do Not Change';
  const originalBody  = 'Original body content that should be replaced.';
  const postUrl = await createPost(page, originalTitle, originalBody);

  // ── 2. Navigate to the edit form ──────────────────────────────────────────
  await page.locator('a', { hasText: 'Edit post' }).click();
  await page.waitForURL(/\/posts\/\d+\/edit$/);

  // Confirm the form is pre-filled with the original data
  await expect(page.locator('#post_title')).toHaveValue(originalTitle);
  await expect(page.locator('#post_html_body')).toHaveValue(originalBody);

  // ── 3. Change both fields and submit ──────────────────────────────────────
  const updatedTitle = 'UPDATED Title – Persistence Check';
  const updatedBody  = 'UPDATED body content – this must be saved to the database.';

  await page.locator('#post_title').fill(updatedTitle);
  await page.locator('#post_html_body').fill(updatedBody);
  await page.locator('input[type="submit"]').click();

  // The controller redirects back to the show page with "Post was saved" notice
  await page.waitForURL(/\/posts\/\d+$/);

  // ── 4. Assert the updated content is now displayed ───────────────────────
  // Reload the show page via a fresh GET to bypass any client-side caching
  await page.goto(postUrl);

  // Title – rendered inside <h3> in the _post partial
  await expect(page.locator('h3').first()).toContainText(updatedTitle, {
    message: 'Post title was NOT updated in the database – TC 7.1 bug confirmed.',
  });

  // Body – rendered inside .mb-4 via `raw post.html_body`
  await expect(page.locator('.mb-4').first()).toContainText(updatedBody, {
    message: 'Post body was NOT updated in the database – TC 7.1 bug confirmed.',
  });
});
