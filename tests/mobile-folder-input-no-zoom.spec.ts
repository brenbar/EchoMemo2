import { devices, expect, test } from '@playwright/test'

// iOS Safari auto-zooms inputs with font-size < 16px.
// We can’t simulate Safari zoom directly in Chromium, but we *can* assert the
// computed font-size is >= 16px on mobile-sized viewports.

// Playwright's built-in iPhone device descriptors default to WebKit.
// We only want the viewport/touch/UA bits while staying in the Chromium project.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { defaultBrowserType: _defaultBrowserType, ...iphone13 } = devices['iPhone 13'] as any

test.use(iphone13)

async function setupBrowserStubs(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    // Always start fresh data for deterministic UI tests.
    indexedDB.deleteDatabase('EchoMemoDB')
    indexedDB.deleteDatabase('EchoMemoNewDB')

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
        const blob = new Blob([payload], { type: this.mimeType })
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

async function expectFontSizeAtLeast16(locator: import('@playwright/test').Locator) {
  const fontSize = await locator.evaluate((el) => getComputedStyle(el).fontSize)
  const px = Number.parseFloat(fontSize)
  expect(px).toBeGreaterThanOrEqual(16)
}

test.describe('mobile folder creation input', () => {
  test.beforeEach(async ({ page }) => {
    await setupBrowserStubs(page)
  })

  test('folder name input is at least 16px (prevents iOS auto-zoom)', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'New folder' }).click()

    const input = page.getByLabel('Folder name')
    await expect(input).toBeVisible()

    await expectFontSizeAtLeast16(input)
  })

  test('recording textboxes are at least 16px on mobile', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'New recording' }).click()

    const script = page.locator('textarea')
    await expect(script).toBeVisible()
    await expectFontSizeAtLeast16(script)

    await script.fill('Mobile zoom check')
    await page.getByRole('button', { name: 'Start recording' }).click()
    const stopButton = page.getByRole('button', { name: 'Stop & save' })
    await stopButton.waitFor({ state: 'visible' })
    await stopButton.click()

    const nameInput = page.getByLabel('Recording name')
    await expect(nameInput).toBeVisible()
    await expectFontSizeAtLeast16(nameInput)
  })

  test('rename modal title matches item type (folder vs recording)', async ({ page }) => {
    await page.goto('/')

    // Folder rename should not say "Rename recording".
    await page.getByRole('button', { name: 'New folder' }).click()
    await page.getByLabel('Folder name').fill('Zoom Folder')
    await page.getByRole('button', { name: 'Create' }).click()

    const folderRow = page.locator('div[role="button"]', { hasText: 'Zoom Folder' }).first()
    await folderRow.getByRole('button', { name: 'Item actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page.getByRole('heading', { name: 'Rename folder' })).toBeVisible()
    await expectFontSizeAtLeast16(page.getByLabel('Item name'))
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Recording rename should say "Rename recording".
    await page.getByRole('button', { name: 'New recording' }).click()
    await page.locator('textarea').fill('Zoom Recording')
    await page.getByRole('button', { name: 'Start recording' }).click()
    const stopButton = page.getByRole('button', { name: 'Stop & save' })
    await stopButton.waitFor({ state: 'visible' })
    await stopButton.click()
    await page.getByLabel('Recording name').fill('Zoom Recording')
    await page.getByRole('button', { name: 'Save & return' }).click()

    const recRow = page.locator('div[role="button"]', { hasText: 'Zoom Recording' }).first()
    await recRow.getByRole('button', { name: 'Item actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page.getByRole('heading', { name: 'Rename recording' })).toBeVisible()
    await expectFontSizeAtLeast16(page.getByLabel('Item name'))
  })
})
