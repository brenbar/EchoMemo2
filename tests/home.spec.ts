import { test, expect, Page } from '@playwright/test'

async function setupBrowserStubs(page: Page) {
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
        // Provide a tiny blob to simulate captured audio.
        const blob = new Blob(['test-audio'], { type: this.mimeType })
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
  await page.getByLabel('Recording name').fill(name)
  await page.getByRole('button', { name: 'Save & return' }).click()

  await expect(page.getByText('Your library')).toBeVisible()
  await expect(page.getByText(name)).toBeVisible()
  return name
}

test.beforeEach(async ({ page }) => {
  await setupBrowserStubs(page)
})

test('library shows empty state', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('No items yet. Add a folder or create a recording.')).toBeVisible()
})

test('user can record and see entry in library', async ({ page }) => {
  const name = 'My memory aid'
  await createRecording(page, name)
  await expect(page.getByText(name)).toBeVisible()
})

test('user can rename a recording from the library', async ({ page }) => {
  const original = 'Original name'
  const updated = 'Renamed recording'
  await createRecording(page, original)

  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  await page.getByLabel('Item name').fill(updated)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText(updated)).toBeVisible()
  await expect(page.getByText(original)).toHaveCount(0)
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

test('user can delete a recording', async ({ page }) => {
  const name = 'Delete me'
  await createRecording(page, name)

  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByText('No items yet. Add a folder or create a recording.')).toBeVisible()
})
