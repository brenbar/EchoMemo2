import { test, expect, Page } from '@playwright/test'

async function setupDefaultStubs(page: Page) {
  await page.addInitScript(() => {
    const cleared = localStorage.getItem('__echoMemoDbCleared')
    if (!cleared) {
      indexedDB.deleteDatabase('EchoMemoDB')
      indexedDB.deleteDatabase('EchoMemoNewDB')
      localStorage.setItem('__echoMemoDbCleared', '1')
    }

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

async function createRecording(page: Page, name = 'Sample clip', waitMs = 0, options?: { stay?: boolean }) {
  if (!options?.stay) {
    await page.goto('/')
  }
  await page.getByRole('button', { name: 'New recording' }).click()
  await page.locator('textarea').fill(name)
  await page.getByRole('button', { name: 'Start recording' }).click()
  if (waitMs > 0) {
    await page.waitForTimeout(waitMs)
  }
  const stopButton = page.getByRole('button', { name: 'Stop & save' })
  await stopButton.waitFor({ state: 'visible' })
  await stopButton.click()
  await page.getByLabel('Recording name').fill(name)
  await page.getByRole('button', { name: 'Save & return' }).click()
  await expect(page.getByText(name)).toBeVisible()
  return name
}

async function createPlaylist(
  page: Page,
  playlistName: string,
  recordingNames: string[],
  repeatOverrides?: Record<string, number>,
) {
  await page.goto('/')
  await page.evaluate(() => {
    indexedDB.deleteDatabase('EchoMemoDB')
    indexedDB.deleteDatabase('EchoMemoNewDB')
  })
  await page.reload()

  for (const [idx, name] of recordingNames.entries()) {
    await createRecording(page, name, 0, { stay: idx > 0 })
  }

  await page.getByRole('button', { name: 'New playlist' }).click()
  await page.getByLabel('Playlist name').fill(playlistName)
  await page.getByRole('button', { name: 'Add recordings' }).click()
  for (const name of recordingNames) {
    const checkbox = page.getByLabel(name)
    await checkbox.check()
  }
  await page.getByRole('button', { name: 'Add selected' }).click()

  if (repeatOverrides) {
    for (const [name, repeats] of Object.entries(repeatOverrides)) {
      const input = page.getByRole('textbox', { name: `Repeats for ${name}` })
      if (await input.count()) {
        await input.fill(String(repeats))
      }
    }
  }
  await page.getByRole('button', { name: 'Save playlist' }).click()
  await expect(page.getByText(playlistName)).toBeVisible()
  await page.getByRole('button', { name: playlistName }).click()
  await expect(page).toHaveURL(/\/playlist\//)
}

test('install button triggers beforeinstallprompt prompt when available', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    ;(window as any).__promptCalled = false
    const event = new Event('beforeinstallprompt') as any
    event.prompt = () => {
      ;(window as any).__promptCalled = true
      return Promise.resolve()
    }
    event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' })
    window.dispatchEvent(event)
  })
  await page.getByRole('button', { name: 'Install app' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__promptCalled)).toBe(true)
})

test('install button shows iOS hint when prompt is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'iPhone', configurable: true })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Install app' }).click()
  await expect(page.getByText('Install on iOS')).toBeVisible()
})

test('record page surfaces unsupported browser error when MediaRecorder is missing', async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('EchoMemoDB')
    indexedDB.deleteDatabase('EchoMemoNewDB')
    // Remove MediaRecorder entirely so feature detection fails.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete window.MediaRecorder
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'New recording' }).click()
  await expect(page.getByText('Paste your script')).toBeVisible()
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(
    page.getByText('Recording is not supported in this browser. Please try Safari 14.3+ or Chrome.'),
  ).toBeVisible()
})

test('record page surfaces microphone failure error when getUserMedia rejects', async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('EchoMemoDB')
    indexedDB.deleteDatabase('EchoMemoNewDB')
    class DummyRecorder {
      stream: MediaStream
      mimeType = 'audio/webm'
      ondataavailable: ((evt: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      constructor(stream: MediaStream) {
        this.stream = stream
      }
      start() {}
      stop() {}
    }
    ;(DummyRecorder as any).isTypeSupported = () => false
    Object.defineProperty(window, 'MediaRecorder', { value: DummyRecorder, configurable: true })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => Promise.reject(new Error('denied')) },
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'New recording' }).click()
  await expect(page.getByText('Paste your script')).toBeVisible()
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(
    page.getByText('Microphone access failed. Ensure the mic permission is allowed and you are on HTTPS.'),
  ).toBeVisible()
})

test('playback loops after ended event and allows seeking', async ({ page }) => {
  await setupDefaultStubs(page)
  const name = await createRecording(page, 'Loop Clip', 800)

  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(page).toHaveURL(/\/play\//)

  const playToggle = page.getByRole('button', { name: /Play audio|Pause audio/ })
  const initialLabel = await playToggle.getAttribute('aria-label')
  if (initialLabel === 'Play audio') {
    await playToggle.click()
  }
  await page.evaluate(() => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null
    if (audio) {
      audio.currentTime = 1
      audio.dispatchEvent(new Event('timeupdate'))
      audio.dispatchEvent(new Event('ended'))
    }
  })

  await expect
    .poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement | null)?.currentTime || 0))
    .toBeLessThan(0.2)

  const slider = page.getByRole('slider', { name: 'Seek audio' })
  await page.evaluate(() => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null
    if (audio) {
      Object.defineProperty(audio, 'duration', { value: 5, configurable: true })
      audio.dispatchEvent(new Event('loadedmetadata'))
    }
  })
  const box = await slider.boundingBox()
  if (!box) throw new Error('Slider not found')
  await slider.click({ position: { x: box.width * 0.7, y: box.height / 2 } })

  await expect
    .poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement | null)?.currentTime || 0))
    .toBeGreaterThan(0)
})

test('playback shows autoplay banner when play() is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('blocked'))
    ;(window as any).__origPlay = original
  })
  await setupDefaultStubs(page)
  const name = await createRecording(page, 'Autoplay Blocked')

  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(page.getByText('Tap play to start audio on Safari.')).toBeVisible()
})

test('playlist playback repeats current track before advancing and handles blocked autoplay', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error('blocked'))
    ;(window as any).__origPlay = original
  })
  await setupDefaultStubs(page)
  await createPlaylist(page, 'Repeat List', ['First Clip', 'Second Clip'])

  await expect(page.getByText('Tap play to start audio on Safari.')).toBeVisible()
})

test('playlist playback honours repeat counts before jumping to next track', async ({ page }) => {
  await setupDefaultStubs(page)
  await createPlaylist(page, 'Repeats OK', ['Clip One', 'Clip Two'], { 'Clip One': 2 })

  await expect(page.locator('li', { hasText: 'Clip One' }).getByText('Playing')).toBeVisible()

  await page.evaluate(() => {
    const audio = document.querySelector('audio')
    audio?.dispatchEvent(new Event('ended'))
  })
  await expect(page.getByText(/Now playing: Clip One \(2\/2\)/)).toBeVisible()

  // Wait for the repeat restart guard window to expire; the real second iteration
  // would end much later than this in practice.
  await page.waitForTimeout(450)
  await page.evaluate(() => {
    const audio = document.querySelector('audio')
    audio?.dispatchEvent(new Event('ended'))
  })
  await expect(page.locator('li', { hasText: 'Clip Two' }).getByText('Playing')).toBeVisible()
})

test('playlist editor disables save without entries and re-disables after removal', async ({ page }) => {
  await setupDefaultStubs(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill('Nest')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: 'Nest' }).click()
  await createRecording(page, 'Nested Clip', 0, { stay: true })
  await createRecording(page, 'Nested Clip 2', 0, { stay: true })
  await page.getByRole('button', { name: 'Nest', exact: true }).click()

  await page.getByRole('button', { name: 'New playlist' }).click()
  const saveButton = page.getByRole('button', { name: 'Save playlist' })
  await expect(saveButton).toBeDisabled()

  await page.getByRole('button', { name: 'Add recordings' }).click()
  await page.getByRole('button', { name: 'Nest' }).click()
  await page.getByLabel('Nested Clip', { exact: true }).check()
  await page.getByLabel('Nested Clip 2').check()
  await page.getByRole('button', { name: 'Add selected' }).click()
  await expect(page.getByText('Nested Clip', { exact: true })).toBeVisible()
  await expect(page.getByText('Nested Clip 2')).toBeVisible()
  await expect(saveButton).toBeEnabled()

  await swipeDeleteRecording(page, 'Nested Clip')
  await expect(saveButton).toBeDisabled()
})

test('move modal prevents staying put and can move item to root', async ({ page }) => {
  await setupDefaultStubs(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill('Parent')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: 'Parent' }).click()
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill('Child')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: 'Child' }).click()

    await createRecording(page, 'Move me', 0, { stay: true })

  const actionsButton = page.getByRole('button', { name: 'Item actions', exact: true }).last()
  await actionsButton.click()
  await page.getByRole('menuitem', { name: 'Move' }).click()
  const dialog = page.getByRole('dialog').last()
  const action = dialog.getByRole('button', { name: /Move to '.*'|Stay/ })
  await expect(action).toBeDisabled()
  await expect(action).toHaveText('Stay')

  await dialog.getByRole('button', { name: 'Root' }).click()
  await expect(action).toBeEnabled()
  await expect(action).toHaveText("Move to 'Root'")
  await action.click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('Move me')).toHaveCount(0)

  await page.getByRole('button', { name: 'Child' }).click()
  await page.getByRole('button', { name: 'Parent' }).click()
  await expect(page.getByText('Move me')).toBeVisible()
})
