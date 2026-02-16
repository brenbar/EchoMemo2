import { test, expect, Page } from '@playwright/test'
import { ensureRecordingVisible } from './helpers/recordingFallback'

async function setupBrowserStubs(page: Page) {
  await page.addInitScript(() => {
    // Always start fresh data for deterministic UI tests.

    // Minimal media stubs to allow recording flow without real devices.
    class FakeMediaStreamTrack {
      stop() {}
    }

    class FakeMediaStream {
      getTracks() {
        return [new FakeMediaStreamTrack()]
      }
    }

    class FakeMediaRecorder {
      stream: MediaStream
      mimeType: string
      ondataavailable: ((evt: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null

      constructor(stream: MediaStream, options?: { mimeType?: string }) {
        this.stream = stream
        this.mimeType = options?.mimeType ?? 'audio/webm'
      }

      start() {
        const payload = new Uint8Array(32 * 1024)
        const blob = new window.Blob([payload], { type: this.mimeType })
        queueMicrotask(() => this.ondataavailable?.({ data: blob }))
      }

      stop() {
        queueMicrotask(() => this.onstop?.())
      }

      addEventListener() {}
      removeEventListener() {}
    }

    // Support feature detection in the app code.
    ;(FakeMediaRecorder as any).isTypeSupported = () => true

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      writable: true,
      value: {
        getUserMedia: async () => new FakeMediaStream(),
      },
    })

    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    })
  })
}

async function createRecording(page: Page, name = 'Sample script for testing') {
  await page.goto('/')
  await page.getByRole('button', { name: 'New recording' }).click()

  await page.locator('textarea').fill(name)
  await page.getByRole('button', { name: 'Start recording' }).click()
  const stopButton = page.getByRole('button', { name: 'Stop & save' })
  await stopButton.waitFor({ state: 'visible' })
  await stopButton.click()
  // Ensure the save modal is present before proceeding.
  const recordingNameInput = page.getByLabel('Recording name')
  await recordingNameInput.fill(name)
  await recordingNameInput.evaluate((el) => (el as HTMLElement).blur())
  await page.getByRole('dialog').getByRole('button', { name: 'Save & return' }).dispatchEvent('click')
  await ensureRecordingVisible(page, name, { scriptText: name })
  return name
}

test.beforeEach(async ({ page }) => {
  await setupBrowserStubs(page)
})

test('library preloads free samples', async ({ page }) => {
  await page.goto('/')
  const freeFolder = page.getByRole('button', { name: '_free' })
  await expect(freeFolder).toBeVisible()

  await freeFolder.click()
  await expect(page).toHaveURL(/\/folder\/_free/)
  await expect(page.getByText('Free 440 Hz')).toBeVisible()
  await expect(page.getByText('Free 660 Hz')).toBeVisible()
  await expect(page.getByText('Free 880 Hz')).toBeVisible()
})

test('install header shows the real app icon', async ({ page }) => {
  await page.goto('/')
  const appIcon = page.getByRole('img', { name: 'EchoMemo' })
  await expect(appIcon).toBeVisible()
  await expect(appIcon).toHaveAttribute('src', /EchoMemo192\.png/)
})

test('user can record and see entry in library', async ({ page }) => {
  const name = 'My memory aid'
  await createRecording(page, name)
  await expect(page.locator('div[role="button"]', { hasText: name }).first()).toBeVisible()
})

test('user can rename a recording from the library', async ({ page }) => {
  const original = 'Original name'
  const updated = 'Renamed recording'
  await createRecording(page, original)

  const targetRow = page.locator('div[role="button"]', { hasText: original }).first()
  await targetRow.getByRole('button', { name: 'Item actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await page.getByLabel('Item name').fill(updated)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText(updated)).toBeVisible()
  await expect(page.getByText(original)).toHaveCount(0)
})

test('row actions menu shows move, edit, and delete', async ({ page }) => {
  const name = 'Actions demo'
  await createRecording(page, name)

  const row = page.locator('div[role="button"]', { hasText: name }).first()
  await row.getByRole('button', { name: 'Item actions', exact: true }).click()

  const menu = page.getByRole('menu', { name: 'Item actions' })
  await expect(menu.getByRole('menuitem', { name: 'Move' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Edit' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeVisible()

  await menu.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(page.getByLabel('Item name')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('user can open playback page and see script', async ({ page }) => {
  const script = 'Playback script content for testing'
  await createRecording(page, script)

  await page.getByRole('button', { name: new RegExp(script) }).click()
  await expect(page.getByRole('heading', { name: script })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Script', exact: true })).toBeVisible()
  await expect(page.locator('p', { hasText: script }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Play|Pause/ })).toBeVisible()
})

test('user can play a free sample without saving to IndexedDB', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '_free' }).click()
  await page.getByRole('button', { name: 'Free 440 Hz' }).click()

  await expect(page.getByRole('heading', { name: 'Free 440 Hz' })).toBeVisible()
  await expect(page.getByText('Free 440 Hz (2 second test tone)')).toBeVisible()
  await expect(page.getByRole('button', { name: /Play|Pause/ })).toBeVisible()
})

test('user can delete a recording', async ({ page }) => {
  const name = 'Delete me'
  await createRecording(page, name)

  const targetRow = page.locator('div[role="button"]', { hasText: name }).first()
  await targetRow.getByRole('button', { name: 'Item actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByText(name)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '_free' })).toBeVisible()
})
