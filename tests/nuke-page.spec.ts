import { test, expect, type Page } from '@playwright/test'

async function openNukePage(page: Page, query = '') {
  await page.goto(`/nuke.html${query}`)

  // Vite dev server can be configured with a public base path (e.g. /EchoMemo3/).
  // When that happens, visiting /nuke.html returns a helpful redirect page.
  const basePathHint = page.getByText('The server is configured with a public base URL')
  if (await basePathHint.isVisible()) {
    await page.getByRole('link').click()
  }
}

test('nuke recovery page loads', async ({ page }) => {
  await openNukePage(page)

  await expect(page).toHaveTitle(/EchoMemo Recovery/i)
  await expect(page.getByRole('heading', { name: /EchoMemo Recovery/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Run cleanup/i })).toBeVisible()
})

test('nuke recovery page ignores autorun query param', async ({ page }) => {
  await openNukePage(page, '?autorun=1')

  await expect(page).toHaveURL(/nuke\.html(?:\?|$)/)
  await expect(page.getByText(/Auto-run via URL is disabled for safety/i)).toBeVisible()
})
