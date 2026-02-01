import { test, expect, Page } from '@playwright/test'

async function setupBrowserStubs(page: Page) {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('EchoMemoDB')
    indexedDB.deleteDatabase('EchoMemoNewDB')

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

async function createRecordingInCurrentView(page: Page, name: string) {
  await page.getByRole('button', { name: 'New recording' }).click()

  await page.locator('textarea').fill(name)
  await page.getByRole('button', { name: 'Start recording' }).click()
  const stopButton = page.getByRole('button', { name: 'Stop & save' })
  await stopButton.waitFor({ state: 'visible' })
  await stopButton.click()

  await page.getByLabel('Recording name').fill(name)
  await page.getByRole('button', { name: 'Save & return' }).click()

  await expect(page.getByText(name)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await setupBrowserStubs(page)
})

test('warns and updates playlists when deleting a recording', async ({ page }) => {
  await page.goto('/')

  await createRecordingInCurrentView(page, 'Keep Clip')
  await createRecordingInCurrentView(page, 'Remove Clip')

  await page.getByRole('button', { name: 'New playlist' }).click()
  await page.getByLabel('Playlist name').fill('Mix One')
  await page.getByRole('button', { name: 'Add recordings' }).click()
  await page.getByLabel('Keep Clip').check()
  await page.getByLabel('Remove Clip').check()
  await page.getByRole('button', { name: 'Add selected' }).click()
  await page.getByRole('button', { name: 'Save playlist' }).click()

  await expect(page.getByText('Mix One')).toBeVisible()

  const recordingRow = page.locator('div[role="button"]', { hasText: 'Remove Clip' }).first()
  await recordingRow.getByRole('button', { name: 'Item actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()

  const dialog = page.getByRole('dialog').last()
  await expect(dialog.getByTestId('playlist-warning-list')).toContainText('Mix One')

  await dialog.getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Remove Clip')).toHaveCount(0)

  await page.getByRole('button', { name: 'Mix One' }).click()
  await expect(page).toHaveURL(/\/playlist\//)
  await expect(page.getByText('Remove Clip')).toHaveCount(0)
  const items = page.locator('li')
  await expect(items).toHaveCount(1)
  await expect(items.first().getByText('Keep Clip', { exact: true })).toBeVisible()
})
