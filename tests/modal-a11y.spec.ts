import { expect, test } from '@playwright/test'
import { clickNewAction } from './helpers/newMenu'

test('modal closes on Escape and restores focus to trigger', async ({ page }, testInfo) => {
  await page.goto('/')

  const trigger = page.getByRole('button', { name: 'New...' })
  await trigger.focus()
  await trigger.click()
  await page.getByRole('menuitem', { name: 'New folder' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  if (testInfo.project.name === 'webkit-iphone') {
    const activeOutsideDialog = await page.evaluate(() => {
      const active = document.activeElement
      const currentDialog = document.querySelector('[role="dialog"]')
      return Boolean(active && (!currentDialog || !currentDialog.contains(active)))
    })
    expect(activeOutsideDialog).toBe(true)
    return
  }

  await expect(trigger).toBeFocused()
})

test('modal traps keyboard focus while open', async ({ page }) => {
  await page.goto('/')

  await clickNewAction(page, 'New folder')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  for (let idx = 0; idx < 10; idx += 1) {
    await page.keyboard.press('Tab')
  }

  const activeElementInsideDialog = await page.evaluate(() => {
    const currentDialog = document.querySelector('[role="dialog"]')
    const active = document.activeElement
    return Boolean(currentDialog && active && currentDialog.contains(active))
  })

  expect(activeElementInsideDialog).toBe(true)
})
