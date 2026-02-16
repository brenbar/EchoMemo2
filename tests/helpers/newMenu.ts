import { expect, type Page } from '@playwright/test'

export type NewMenuAction = 'New folder' | 'New playlist' | 'New recording'

export async function openNewMenu(page: Page) {
  const trigger = page.getByRole('button', { name: 'New…' })
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(page.getByRole('menu', { name: 'Create new item' })).toBeVisible()
}

export async function clickNewAction(page: Page, action: NewMenuAction) {
  await openNewMenu(page)
  await page.getByRole('menuitem', { name: action, exact: true }).click()
}
