import { test, expect, type BrowserContext } from '@playwright/test'

const HOST_OVERRIDE = 'prod.example.com'

async function setupProdLikeHost(context: BrowserContext) {
  await context.addInitScript(({ hostOverride }) => {
    indexedDB.deleteDatabase('EchoMemoDB')
    indexedDB.deleteDatabase('EchoMemoNewDB')
    ;(window as any).__ECHO_MEMO_HOST_OVERRIDE__ = hostOverride
  }, { hostOverride: HOST_OVERRIDE })
}

test('hides the free folder when host is production-like', async ({ page, context }) => {
  await setupProdLikeHost(context)
  await page.goto('/')

  await expect(page.getByRole('button', { name: '_free' })).toHaveCount(0)
  await expect(page.getByText('Your library')).toBeVisible()
})
