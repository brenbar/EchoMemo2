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

async function createPlaylistAtRoot(page: Page, playlistName: string, recordingNames: string[], repeatOverrides: Record<string, number> = {}) {
  if (recordingNames.length < 2) throw new Error('Playlists require at least two recordings')
  await page.goto('/')

  for (const name of recordingNames) {
    await createRecordingInCurrentView(page, name)
  }

  await page.getByRole('button', { name: 'New playlist' }).click()
  await page.getByLabel('Playlist name').fill(playlistName)
  await page.getByRole('button', { name: 'Add recordings' }).click()
  for (const name of recordingNames) {
    await page.getByLabel(name).check()
  }
  await page.getByRole('button', { name: 'Add selected' }).click()
  for (const [name, repeats] of Object.entries(repeatOverrides)) {
    await page.getByRole('textbox', { name: `Repeats for ${name}` }).fill(String(repeats))
  }
  await page.getByRole('button', { name: 'Save playlist' }).click()

  await expect(page.getByText(playlistName)).toBeVisible()
  await page.getByRole('button', { name: playlistName }).click()
  await expect(page).toHaveURL(/\/playlist\//)
}

test.beforeEach(async ({ page }) => {
  await setupBrowserStubs(page)
})

test('playlist playback publishes track + repeat count via Media Session metadata', async ({ page }) => {
  await createPlaylistAtRoot(page, 'Media Session List', ['Track A', 'Track B'], { 'Track A': 3 })

  const readTitle = async () => {
    return await page.evaluate(() => {
      const anyNav = navigator as Navigator & { mediaSession?: MediaSession }
      return anyNav.mediaSession?.metadata?.title ?? null
    })
  }

  await expect.poll(readTitle, { timeout: 10_000 }).toContain('1/2')
  await expect.poll(readTitle, { timeout: 10_000 }).toContain('Track A')
  await expect.poll(readTitle, { timeout: 10_000 }).toContain('(1/3)')

  await page.getByRole('button', { name: 'Next track' }).click()

  await expect.poll(readTitle, { timeout: 10_000 }).toContain('2/2')
  await expect.poll(readTitle, { timeout: 10_000 }).toContain('Track B')
  await expect.poll(readTitle, { timeout: 10_000 }).toContain('(1/1)')
})
