import { devices, expect, test } from '@playwright/test'

// iOS Safari auto-zooms inputs with font-size < 16px.
// We can’t simulate Safari zoom directly in Chromium, but we *can* assert the
// computed font-size is >= 16px on mobile-sized viewports.

// Playwright's built-in iPhone device descriptors default to WebKit.
// We only want the viewport/touch/UA bits while staying in the Chromium project.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { defaultBrowserType: _defaultBrowserType, ...iphone13 } = devices['iPhone 13'] as any

test.use(iphone13)

test.describe('mobile folder creation input', () => {
  test('folder name input is at least 16px (prevents iOS auto-zoom)', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'New folder' }).click()

    const input = page.getByLabel('Folder name')
    await expect(input).toBeVisible()

    const fontSize = await input.evaluate((el) => getComputedStyle(el).fontSize)
    const px = Number.parseFloat(fontSize)

    expect(px).toBeGreaterThanOrEqual(16)
  })
})
