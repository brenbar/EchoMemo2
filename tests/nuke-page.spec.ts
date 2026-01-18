import { test, expect } from '@playwright/test'

test('nuke recovery page loads', async ({ page }) => {
  await page.goto('/nuke.html')

  // Vite dev server can be configured with a public base path (e.g. /EchoMemo3/).
  // When that happens, visiting /nuke.html returns a helpful redirect page.
  const basePathHint = page.getByText('The server is configured with a public base URL')
  if (await basePathHint.isVisible()) {
    await page.getByRole('link').click()
  }

  await expect(page).toHaveTitle(/EchoMemo Recovery/i)
  await expect(page.getByRole('heading', { name: /EchoMemo Recovery/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Run cleanup/i })).toBeVisible()
})
