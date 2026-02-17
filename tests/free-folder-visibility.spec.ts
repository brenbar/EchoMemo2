import { test, expect, type BrowserContext } from '@playwright/test'
import { openNewMenu } from './helpers/newMenu'

const HOST_OVERRIDE = 'prod.example.com'

async function setupProdLikeHost(context: BrowserContext) {
  await context.addInitScript(({ hostOverride }) => {
    ;(window as any).__ECHO_MEMO_HOST_OVERRIDE__ = hostOverride
  }, { hostOverride: HOST_OVERRIDE })
}

test('prod-like host hides free folder and does not offer New playlist when there are no recordings', async ({
  page,
  context,
}) => {
  await setupProdLikeHost(context)
  await page.goto('/')

  await expect(page.getByRole('button', { name: '_free' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New…' })).toBeVisible()

  await openNewMenu(page)
  const newFolderAction = page.getByRole('menuitem', { name: 'New folder' })
  const newRecordingAction = page.getByRole('menuitem', { name: 'New recording' })

  await expect(newFolderAction).toBeVisible()
  await expect(newRecordingAction).toBeVisible()
  await expect(newFolderAction.locator('svg')).toBeVisible()
  await expect(newRecordingAction.locator('svg')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'New playlist' })).toHaveCount(0)
})
