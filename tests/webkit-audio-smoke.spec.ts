import { expect, test, type Page } from '@playwright/test'

async function setupAudioStubs(page: Page) {
  await page.addInitScript(() => {

    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      writable: true,
      value() {
        return Promise.resolve()
      },
    })
  })
}

async function createPlaylistFromFreeSamples(page: Page, playlistName: string) {
  await page.getByRole('button', { name: 'New playlist' }).click()
  await page.getByLabel('Playlist name').fill(playlistName)
  await page.getByRole('button', { name: 'Select recordings' }).click()

  const modal = page.getByTestId('modal-panel')
  await modal.getByRole('button', { name: '_free' }).click()
  await modal.getByLabel('Free 440 Hz').check()
  await modal.getByLabel('Free 660 Hz').check()
  await modal.getByRole('button', { name: 'Save', exact: true }).click()

  await page.getByRole('button', { name: 'Save playlist' }).click()
  await expect(page.locator('div[role="button"]', { hasText: playlistName }).first()).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await setupAudioStubs(page)
})

test('webkit smoke: free recording playback loops when ended fires', async ({ page }) => {
  await page.goto('/')
  await page.locator('div[role="button"]', { hasText: '_free' }).first().click()
  await page.locator('div[role="button"]', { hasText: 'Free 440 Hz' }).first().click()
  await expect(page).toHaveURL(/\/play\//)

  await page.evaluate(() => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null
    if (!audio) return
    audio.currentTime = 1
    audio.dispatchEvent(new Event('timeupdate'))
    audio.dispatchEvent(new Event('ended'))
  })

  await expect
    .poll(() =>
      page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement | null)?.currentTime ?? 0),
    )
    .toBeLessThan(0.2)
})

test('webkit smoke: playlist repeat count is honored before advancing', async ({ page }) => {
  const playlistName = 'WebKit Repeat List'
  await page.goto('/')
  await createPlaylistFromFreeSamples(page, playlistName)

  await page.locator('div[role="button"]', { hasText: playlistName }).first().click()
  await expect(page).toHaveURL(/\/playlist\//)
  await expect(page.getByText(/Now playing: Free 440 Hz \(1\/1\)/)).toBeVisible()

  await page.evaluate(() => {
    const audio = document.querySelector('audio')
    audio?.dispatchEvent(new Event('ended'))
  })
  await expect(page.locator('li', { hasText: 'Free 660 Hz' }).getByText('Playing')).toBeVisible()
})
