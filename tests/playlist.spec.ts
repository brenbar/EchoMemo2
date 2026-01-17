import { test, expect, Page } from '@playwright/test'

async function setupBrowserStubs(page: Page) {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('EchoMemoDB')

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
        const blob = new Blob(['test-audio'], { type: this.mimeType })
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

async function createPlaylistAtRoot(page: Page, playlistName: string, recordingNames: string[]) {
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
  await page.getByRole('button', { name: 'Save playlist' }).click()

  await expect(page.getByText(playlistName)).toBeVisible()
  await page.getByRole('button', { name: playlistName }).click()
  await expect(page).toHaveURL(/\/playlist\//)
}

test.beforeEach(async ({ page }) => {
  await setupBrowserStubs(page)
})

test('user can create a playlist from a folder and adjust repeats', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill('Study Pack')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Study Pack')).toBeVisible()

  await page.getByRole('button', { name: 'Study Pack' }).click()
  await expect(page).toHaveURL(/\/folder\//)

  await createRecordingInCurrentView(page, 'Clip One')
  await createRecordingInCurrentView(page, 'Clip Two')

  await page.getByRole('button', { name: 'New playlist' }).click()
  await page.getByLabel('Playlist name').fill('Study Playlist')

  await page.getByRole('button', { name: 'Add recordings' }).click()
  await page.getByLabel('Clip One').check()
  await page.getByLabel('Clip Two').check()
  await page.getByRole('button', { name: 'Add selected' }).click()

  await expect(page.getByText('Clip One')).toBeVisible()
  await expect(page.getByText('Clip Two')).toBeVisible()

  await page.getByLabel('Repeats for Clip One').fill('2')

  await page.getByRole('button', { name: 'Save playlist' }).click()
  await expect(page).toHaveURL(/\/folder\//)
  await expect(page.getByText('Study Playlist')).toBeVisible()

  await page.getByRole('button', { name: 'Study Playlist' }).click()
  await expect(page).toHaveURL(/\/playlist\//)
  await expect(page.getByText('Clip One')).toBeVisible()
  await expect(page.getByText(/repeats 2/i)).toBeVisible()
})

test('playlist playback jumps between tracks with next/previous', async ({ page }) => {
  await createPlaylistAtRoot(page, 'Jump Test', ['Clip A', 'Clip B'])

  await expect(page.locator('li', { hasText: 'Clip A' }).getByText('Playing')).toBeVisible()

  await page.getByRole('button', { name: 'Next track' }).click()
  await expect(page.locator('li', { hasText: 'Clip B' }).getByText('Playing')).toBeVisible()
  await expect(page.locator('li', { hasText: 'Clip A' }).getByText('Playing')).toHaveCount(0)

  await page.getByRole('button', { name: 'Previous track' }).click()
  await expect(page.locator('li', { hasText: 'Clip A' }).getByText('Playing')).toBeVisible()
})

test('playlist repeats after the final track ends', async ({ page }) => {
  await createPlaylistAtRoot(page, 'Loop Test', ['First Clip', 'Second Clip'])

  const triggerEnded = async () => {
    await page.evaluate(() => {
      const audio = document.querySelector('audio')
      audio?.dispatchEvent(new Event('ended'))
    })
  }

  await expect(page.locator('li', { hasText: 'First Clip' }).getByText('Playing')).toBeVisible()

  await triggerEnded()
  await expect(page.locator('li', { hasText: 'Second Clip' }).getByText('Playing')).toBeVisible()

  await triggerEnded()
  await expect(page.locator('li', { hasText: 'First Clip' }).getByText('Playing')).toBeVisible()
})
