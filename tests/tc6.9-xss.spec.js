'use strict';

/**
 * TC 6.9 – Cross-Site Scripting (XSS) vulnerability on html_body field
 *
 * Bug description:
 *   The _post.html.erb partial renders post.html_body through Rails' `raw` helper,
 *   bypassing all HTML escaping:
 *
 *     <%= raw post.html_body %>
 *
 *   This allows any HTML/JS submitted in the body to be injected directly into the
 *   DOM for every visitor of the posts index page, making it a stored (second-order)
 *   XSS vulnerability.  The attacker does not need to be logged in when the script
 *   runs – it executes for all users including unauthenticated visitors.
 *
 * Expected behaviour:
 *   The html_body content should be sanitised (dangerous tags stripped or escaped)
 *   before being rendered.  A <script> payload must never appear as live DOM nodes
 *   in the page, and JS event-handler attributes (onerror, onload, …) must be stripped.
 *
 * This test FAILS because the bug is present.
 */

const { test, expect } = require('@playwright/test');
const { uniqueEmail, signUp, createPost, BASE_URL } = require('./helpers');

// ── Payloads ─────────────────────────────────────────────────────────────────

// Sets a detectable global when a <script> block executes.
const SCRIPT_PAYLOAD = '<script>window.__xss_script_executed = true;</script>';

// Sets a detectable global through an inline event handler (runs even when
// <script> tags are blocked by a CSP nonce policy).
const IMG_PAYLOAD =
  '<img src="x-does-not-exist" ' +
  'onerror="window.__xss_img_executed=true;this.setAttribute(\'data-xss-fired\',\'1\')" ' +
  'id="xss-probe-img" />';

// Combined payload used in the post body
const XSS_BODY = `${SCRIPT_PAYLOAD}${IMG_PAYLOAD}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Checks whether the raw (unescaped) XSS probe tags are present in the page DOM.
 * Returns an object with individual flags so assertions can report clearly.
 */
async function gatherXssEvidence(page) {
  return page.evaluate(() => {
    const bodyHtml = document.body.innerHTML;
    return {
      // Raw <script> block found in DOM
      rawScriptTagInDom: bodyHtml.includes('<script>window.__xss_script_executed'),
      // Event-handler injection element present in DOM
      xssImgNodeInDom: !!document.getElementById('xss-probe-img'),
      // JS onerror handler actually fired
      imgEventHandlerFired: document.getElementById('xss-probe-img')
        ? document.getElementById('xss-probe-img').getAttribute('data-xss-fired') === '1'
        : false,
      // <script> block executed
      scriptBlockExecuted: window.__xss_script_executed === true,
      // img onerror executed
      imgOnerrorExecuted: window.__xss_img_executed === true,
    };
  });
}

// ── Test ─────────────────────────────────────────────────────────────────────

test('TC 6.9 – XSS payload in html_body must be sanitised before rendering', async ({ page }) => {
  const email = uniqueEmail('tc69');
  await signUp(page, email);

  // ── 1. Submit a post containing the XSS payloads ─────────────────────────
  await createPost(page, 'XSS Vulnerability Test Post', XSS_BODY);

  // ── 2. Navigate to the public index page (full page load, no Turbolinks) ─
  //    All logged-in and logged-out users see this page.
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });

  // ── 3. Collect evidence ───────────────────────────────────────────────────
  const evidence = await gatherXssEvidence(page);

  // ── 4. Assertions – soft expects so every check is evaluated and reported ──
  //      even when an earlier one fails. The test is marked failed at the end
  //      if any soft assertion did not pass.

  // 4a. The raw <script> tag must NOT appear unescaped in the rendered DOM.
  //     If sanitised correctly, it would appear as &lt;script&gt;… instead.
  expect.soft(evidence.rawScriptTagInDom,
    'FAIL (TC 6.9): Unescaped <script> tag found in DOM – raw html_body is not sanitised.'
  ).toBe(false);

  // 4b. The XSS probe <img> element (carrying an onerror handler) must NOT
  //     be an active node in the document.
  expect.soft(evidence.xssImgNodeInDom,
    'FAIL (TC 6.9): XSS <img> node with onerror handler is present in the DOM.'
  ).toBe(false);

  // 4c. The onerror event must NOT have fired (JS execution via attribute injection).
  expect.soft(evidence.imgEventHandlerFired,
    'FAIL (TC 6.9): onerror event handler on injected <img> was executed – JS ran in browser.'
  ).toBe(false);

  // 4d. The <script> block must NOT have executed.
  expect.soft(evidence.scriptBlockExecuted,
    'FAIL (TC 6.9): Injected <script> block was executed in the browser context.'
  ).toBe(false);

  // 4e. img onerror JS must NOT have executed.
  expect.soft(evidence.imgOnerrorExecuted,
    'FAIL (TC 6.9): XSS via img onerror was executed – window.__xss_img_executed is true.'
  ).toBe(false);
});
