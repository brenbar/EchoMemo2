import { test, expect } from '@playwright/test'

test('library page renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Saved recordings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New recording' })).toBeVisible()
})
