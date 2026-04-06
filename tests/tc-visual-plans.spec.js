'use strict';

/**
 * Visual Regression Test – /plans page snapshot vs. reference snapshot
 *
 * What this test does:
 *   1. Authenticates a test user (the /plans route requires login).
 *   2. Navigates to http://localhost:3000/plans and takes a full-page screenshot.
 *   3. Loads the reference image you supply at:
 *        tests/snapshots/plans-reference.png
 *   4. Compares the two images pixel-by-pixel using pixelmatch.
 *   5. Saves a diff/heatmap image to:
 *        tests/snapshots/plans-diff-heatmap.png
 *      Red highlights = pixels that differ between reference and actual.
 *   6. Fails if the mismatch exceeds the configured threshold (1 % by default,
 *      meaning any visual difference causes the test to fail).
 *
 * How to add your reference image:
 *   Place your PNG file here:  tests/snapshots/plans-reference.png
 *   Re-run the test – it will compare and produce the heatmap.
 *
 * This test does not fail as the iamge of reference is almost the same as the one for testing, but it 
 * shows the capabilities of having a test to control teh layout of the page. If for example a frontend 
 * change would break the layout like now compared to the reference design, the test would fail.
 */

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
const { PNG }      = require('pngjs');
const pixelmatch   = require('pixelmatch');
const Jimp         = require('jimp');

const { uniqueEmail, signUp, BASE_URL, cleanupTestUser } = require('./helpers');

// ── Paths ─────────────────────────────────────────────────────────────────────
const SNAPSHOTS_DIR  = path.join(__dirname, 'snapshots');
const REFERENCE_PATH = path.join(SNAPSHOTS_DIR, 'plans-reference.png');
const ACTUAL_PATH    = path.join(SNAPSHOTS_DIR, 'plans-actual.png');
const DIFF_PATH      = path.join(SNAPSHOTS_DIR, 'plans-diff-heatmap.png');

// Maximum allowed percentage of differing pixels
const MISMATCH_THRESHOLD_PERCENT = 1;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns RGBA pixel data for pixelmatch. Resizes only when dimensions differ.
 * Avoid resizing when width/height already match — bilinear resize would change
 * pixels and produce a false diff against an identical PNG pair.
 */
function toRgbaBuffer(jimpImage, targetWidth, targetHeight) {
  const w = jimpImage.getWidth();
  const h = jimpImage.getHeight();
  if (w === targetWidth && h === targetHeight) {
    return {
      data: Buffer.from(jimpImage.bitmap.data),
      width: targetWidth,
      height: targetHeight,
    };
  }
  const resized = jimpImage.clone().resize(targetWidth, targetHeight, Jimp.RESIZE_BILINEAR);
  return {
    data: Buffer.from(resized.bitmap.data),
    width: targetWidth,
    height: targetHeight,
  };
}

/**
 * Builds and writes a PNG diff image (heatmap) from a pixelmatch diff buffer.
 */
function writeDiffPng(diffData, width, height, outputPath) {
  const png   = new PNG({ width, height });
  png.data    = Buffer.from(diffData);
  const chunk = PNG.sync.write(png);
  fs.writeFileSync(outputPath, chunk);
}

// ── Test ─────────────────────────────────────────────────────────────────────

test.afterEach(async ({ page }) => {
  await cleanupTestUser(page);
});

test('Visual – /plans page must match the reference screenshot', async ({ page }) => {
  // ── 0. Pre-condition: reference image must exist ──────────────────────────
  if (!fs.existsSync(REFERENCE_PATH)) {
    throw new Error(
      `Reference image not found at:\n  ${REFERENCE_PATH}\n\n` +
      'Please place your reference PNG there and re-run the test.\n' +
      'The test will then take a fresh screenshot of /plans and compare both.'
    );
  }

  // ── 1. Authenticate ───────────────────────────────────────────────────────
  const email = uniqueEmail('visual');
  await signUp(page, email);

  // ── 2. Navigate to /plans and capture a full-page screenshot ──────────────
  await page.goto(`${BASE_URL}/plans`);

  // Wait for the network to be idle so exchange-rate values and fonts are
  // fully loaded before we capture.
  await page.waitForLoadState('networkidle');

  const screenshotBuffer = await page.screenshot({ fullPage: true });

  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  fs.writeFileSync(ACTUAL_PATH, screenshotBuffer);

  // ── 3. Load both images with Jimp ─────────────────────────────────────────
  const [refJimp, actualJimp] = await Promise.all([
    Jimp.read(REFERENCE_PATH),
    Jimp.read(ACTUAL_PATH),
  ]);

  // Normalise to the actual screenshot dimensions so the comparison is always
  // driven by what the browser currently renders.
  const width  = actualJimp.getWidth();
  const height = actualJimp.getHeight();

  const ref    = toRgbaBuffer(refJimp,    width, height);
  const actual = toRgbaBuffer(actualJimp, width, height);

  // ── 4. Pixel-by-pixel comparison ──────────────────────────────────────────
  const diffData = Buffer.alloc(width * height * 4);

  const diffPixels = pixelmatch(
    ref.data,
    actual.data,
    diffData,
    width,
    height,
    {
      threshold: 0.1,        // per-pixel colour tolerance (0 = strict, 1 = lenient)
      includeAA: false,      // ignore anti-aliasing differences
      diffColor: [255, 0, 0], // red highlights for changed pixels
    }
  );

  // ── 5. Write the heatmap ──────────────────────────────────────────────────
  writeDiffPng(diffData, width, height, DIFF_PATH);

  const totalPixels       = width * height;
  const mismatchPercent   = (diffPixels / totalPixels) * 100;

  console.log(
    `\n  Visual diff summary:\n` +
    `    Reference : ${REFERENCE_PATH}\n` +
    `    Actual    : ${ACTUAL_PATH}\n` +
    `    Heatmap   : ${DIFF_PATH}\n` +
    `    Dimensions: ${width} × ${height} px\n` +
    `    Diff pixels: ${diffPixels} / ${totalPixels} (${mismatchPercent.toFixed(2)} %)\n` +
    `    Threshold : ${MISMATCH_THRESHOLD_PERCENT} %`
  );

  // ── 6. Assert ─────────────────────────────────────────────────────────────
  expect(mismatchPercent,
    `FAIL (Visual): The /plans page differs from the reference by ${mismatchPercent.toFixed(2)} % ` +
    `(${diffPixels} pixels). Check the heatmap at:\n  ${DIFF_PATH}`
  ).toBeLessThanOrEqual(MISMATCH_THRESHOLD_PERCENT);
});
