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

async function swipeDeleteRecording(page: Page, recordingName: string) {
  const row = page.locator(`[data-playlist-row-name="${recordingName}"]`).first()
  const box = await row.boundingBox()
  if (!box) throw new Error(`Playlist row not found for ${recordingName}`)

  const startX = box.x + box.width - 8
  const endX = startX - Math.min(140, box.width - 16)
  const y = box.y + box.height / 2

  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(endX, y, { steps: 6 })
  await page.mouse.up()
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

  await page.getByRole('textbox', { name: 'Repeats for Clip One' }).fill('2')

  await page.getByRole('button', { name: 'Save playlist' }).click()
  await expect(page).toHaveURL(/\/folder\//)
  await expect(page.getByText('Study Playlist')).toBeVisible()

  await page.getByRole('button', { name: 'Study Playlist' }).click()
  await expect(page).toHaveURL(/\/playlist\//)
  await expect(page.locator('li', { hasText: 'Clip One' }).first()).toBeVisible()
  await expect(page.getByText(/repeats 2/i)).toBeVisible()
})

test('user can edit a playlist from the dedicated editor view', async ({ page }) => {
  await createPlaylistAtRoot(page, 'Editable List', ['Track A', 'Track B'])

  await page.getByLabel('Back to list').click()
  const playlistRow = page.locator('div[role="button"]', { hasText: 'Editable List' }).first()
  await playlistRow.getByRole('button', { name: 'Item actions', exact: true }).click()
  await playlistRow.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(page).toHaveURL(/\/playlist\/.*\/edit/)
  await expect(page.getByLabel('Playlist name')).toHaveValue('Editable List')

  await page.getByLabel('Playlist name').fill('Edited List')
  await page.getByRole('textbox', { name: 'Repeats for Track B' }).fill('3')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Edited List')).toBeVisible()

  await page.getByRole('button', { name: 'Edited List' }).click()
  await expect(page).toHaveURL(/\/playlist\//)
  await expect(page.getByText(/repeats 3/i)).toBeVisible()
})

test('playlist repeat controls respond to mouse clicks', async ({ page }) => {
  await createPlaylistAtRoot(page, 'Mouse Adjust', ['Mouse Track A', 'Mouse Track B'])

  await page.getByLabel('Back to list').click()
  const playlistRow = page.locator('div[role="button"]', { hasText: 'Mouse Adjust' }).first()
  await playlistRow.getByRole('button', { name: 'Item actions', exact: true }).click()
  await playlistRow.getByRole('menuitem', { name: 'Edit' }).click()

  const repeatsInput = page.getByRole('textbox', { name: 'Repeats for Mouse Track A' })
  await expect(repeatsInput).toHaveValue('1')

  await page.getByRole('button', { name: 'Increase repeats for Mouse Track A' }).click()
  await expect(repeatsInput).toHaveValue('2')

  await page.getByRole('button', { name: 'Decrease repeats for Mouse Track A' }).click()
  await expect(repeatsInput).toHaveValue('1')
})

test('new playlist requires at least two recordings', async ({ page }) => {
  await page.goto('/')

  await createRecordingInCurrentView(page, 'Single Clip')
  await createRecordingInCurrentView(page, 'Another Clip')

  await page.getByRole('button', { name: 'New playlist' }).click()
  await page.getByLabel('Playlist name').fill('Minimum Tracks')

  await page.getByRole('button', { name: 'Add recordings' }).click()
  await page.getByLabel('Single Clip').check()
  await page.getByRole('button', { name: 'Add selected' }).click()

  const saveButton = page.getByRole('button', { name: 'Save playlist' })
  await expect(saveButton).toBeDisabled()
  await expect(page.getByText(/add at least two recordings/i)).toBeVisible()

  await page.getByRole('button', { name: 'Add recordings' }).click()
  await page.getByLabel('Another Clip').check()
  await page.getByRole('button', { name: 'Add selected' }).click()

  await expect(saveButton).toBeEnabled()
  await saveButton.click()

  await expect(page.getByText('Minimum Tracks')).toBeVisible()
})

test('user can edit a playlist from the list row and return to its folder', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill('Study Pack')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: 'Study Pack' }).click()
  await expect(page).toHaveURL(/\/folder\//)

  await createRecordingInCurrentView(page, 'Snippet One')
  await createRecordingInCurrentView(page, 'Snippet Two')

  await page.getByRole('button', { name: 'New playlist' }).click()
  await page.getByLabel('Playlist name').fill('Folder Playlist')
  await page.getByRole('button', { name: 'Add recordings' }).click()
  await page.getByLabel('Snippet One').check()
  await page.getByLabel('Snippet Two').check()
  await page.getByRole('button', { name: 'Add selected' }).click()
  await page.getByRole('button', { name: 'Save playlist' }).click()

  await expect(page).toHaveURL(/\/folder\//)
  await expect(page.getByText('Folder Playlist')).toBeVisible()

  const playlistRow = page.locator('div[role="button"]', { hasText: 'Folder Playlist' }).first()
  await playlistRow.getByRole('button', { name: 'Item actions', exact: true }).click()
  await playlistRow.getByRole('menuitem', { name: 'Edit' }).click()

  await expect(page).toHaveURL(/\/playlist\/.*\/edit/)
  await expect(page.getByLabel('Playlist name')).toHaveValue('Folder Playlist')

  await page.getByLabel('Playlist name').fill('Folder Playlist Edited')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page).toHaveURL(/\/folder\//)
  await expect(page.getByText('Folder Playlist Edited')).toBeVisible()
})

test('edit playlist enforces minimum recordings', async ({ page }) => {
  await createPlaylistAtRoot(page, 'Edit Minimum', ['Track One', 'Track Two'])

  await page.getByLabel('Back to list').click()
  const playlistRow = page.locator('div[role="button"]', { hasText: 'Edit Minimum' }).first()
  await playlistRow.getByRole('button', { name: 'Item actions', exact: true }).click()
  await playlistRow.getByRole('menuitem', { name: 'Edit' }).click()

  const saveButton = page.getByRole('button', { name: 'Save changes' })
  await swipeDeleteRecording(page, 'Track One')

  await expect(saveButton).toBeDisabled()
  await expect(page.getByText(/add at least two recordings/i)).toBeVisible()

  await page.getByRole('button', { name: 'Add recordings' }).click()
  await page.getByLabel('Track One').check()
  await page.getByRole('button', { name: 'Add selected' }).click()

  await expect(saveButton).toBeEnabled()
  await saveButton.click()

  await expect(page.getByText('Edit Minimum')).toBeVisible()
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

test('playlist advances after exhausting a track\'s repeat count', async ({ page }) => {
  await createPlaylistAtRoot(page, 'Repeating Track', ['Repeat One', 'Repeat Two'], { 'Repeat One': 2 })

  const triggerEnded = async () => {
    await page.evaluate(() => {
      const audio = document.querySelector('audio')
      audio?.dispatchEvent(new Event('ended'))
    })
  }

  const firstTrack = page.locator('li', { hasText: 'Repeat One' })
  const secondTrack = page.locator('li', { hasText: 'Repeat Two' })

  await expect(firstTrack.getByText('Playing')).toBeVisible()

  await triggerEnded()
  await expect(firstTrack.getByText('Playing')).toBeVisible()

  await triggerEnded()
  await expect(secondTrack.getByText('Playing')).toBeVisible()
  await expect(firstTrack.getByText('Playing')).toHaveCount(0)
})

test('shows now playing subtext on first iteration', async ({ page }) => {
  await createPlaylistAtRoot(page, 'Now Playing Copy', ['Solo Clip', 'Second Solo'])

  await expect(page.getByText(/Now playing: Solo Clip \(1\/1\)/)).toBeVisible()
})
