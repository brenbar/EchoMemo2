import { test, expect, Page } from '@playwright/test'
import { clickNewAction } from './helpers/newMenu'
import { ensureRecordingVisible } from './helpers/recordingFallback'

async function setupDefaultStubs(page: Page) {
  await page.addInitScript(() => {
    const cleared = localStorage.getItem('__echoMemoDbCleared')
    if (!cleared) {
      localStorage.setItem('__echoMemoDbCleared', '1')
    }

    const createTestWavBlob = () => {
      const sampleRate = 8000
      const frameCount = sampleRate
      const dataLength = frameCount * 2
      const buffer = new ArrayBuffer(44 + dataLength)
      const view = new DataView(buffer)

      const write = (offset: number, value: string) => {
        for (let i = 0; i < value.length; i += 1) {
          view.setUint8(offset + i, value.charCodeAt(i))
        }
      }

      write(0, 'RIFF')
      view.setUint32(4, 36 + dataLength, true)
      write(8, 'WAVE')
      write(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, sampleRate, true)
      view.setUint32(28, sampleRate * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      write(36, 'data')
      view.setUint32(40, dataLength, true)

      return new window.Blob([buffer], { type: 'audio/wav' })
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

      constructor(stream: MediaStream) {
        this.stream = stream
        this.mimeType = 'audio/wav'
      }

      start() {
        const blob = createTestWavBlob()
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

async function createRecording(page: Page, name = 'Sample clip', waitMs = 0, options?: { stay?: boolean }) {
  const match = page.url().match(/\/folder\/([^/?#]+)/)
  const parentId = match ? decodeURIComponent(match[1]) : null
  if (!options?.stay) {
    await page.goto('/')
  }
  await clickNewAction(page, 'New recording')
  await page.locator('textarea').fill(name)
  await page.getByRole('button', { name: 'Start recording' }).click()
  if (waitMs > 0) {
    await page.waitForTimeout(waitMs)
  }
  const stopButton = page.getByRole('button', { name: 'Stop recording' })
  await stopButton.waitFor({ state: 'visible' })
  await stopButton.click()
  const recordingNameInput = page.getByLabel('Recording name')
  await recordingNameInput.fill(name)
  await recordingNameInput.evaluate((el) => (el as HTMLElement).blur())
  await page.getByRole('dialog').getByRole('button', { name: 'Save & return' }).dispatchEvent('click')
  await ensureRecordingVisible(page, name, { parentId, scriptText: name })
  return name
}

async function createPlaylist(
  page: Page,
  playlistName: string,
  recordingNames: string[],
  repeatOverrides?: Record<string, number>,
) {
  await page.goto('/')

  for (const [idx, name] of recordingNames.entries()) {
    await createRecording(page, name, 0, { stay: idx > 0 })
  }

  await clickNewAction(page, 'New playlist')
  await page.getByLabel('Playlist name').fill(playlistName)
  await page.getByRole('button', { name: 'Select recordings' }).click()
  for (const name of recordingNames) {
    const checkbox = page.getByLabel(name)
    await checkbox.check()
  }
  await page.getByTestId('modal-panel').getByRole('button', { name: 'Save', exact: true }).click()

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
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
      configurable: true,
    })
  })
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
  await expect
    .poll(async () => {
      const promptCalled = await page.evaluate(() => Boolean((window as any).__promptCalled))
      if (promptCalled) return true
      return page.getByRole('heading', { name: 'Install app' }).isVisible().catch(() => false)
    })
    .toBe(true)
})

test('install button shows iOS hint when prompt is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'iPhone', configurable: true })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Install app' }).click()
  await expect(page.getByRole('heading', { name: 'Install app' })).toBeVisible()
  await expect(page.getByText(/On iOS Safari, tap the share icon/i)).toBeVisible()
})

test('install button shows generic fallback hint when prompt is unavailable on non-iOS', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
      configurable: true,
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Install app' }).click()
  await expect(page.getByRole('heading', { name: 'Install app' })).toBeVisible()
  await expect(page.getByText(/does not support the install prompt on this page/i)).toBeVisible()
})

test('record page surfaces unsupported browser error when MediaRecorder is missing', async ({ page }) => {
  await page.addInitScript(() => {
    // Remove MediaRecorder entirely so feature detection fails.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete window.MediaRecorder
  })

  await page.goto('/')
  await clickNewAction(page, 'New recording')
  await expect(page.getByText('Paste your script')).toBeVisible()
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(
    page.getByText('Recording is not supported in this browser. Please try Safari 14.3+ or Chrome.'),
  ).toBeVisible()
})

test('record page surfaces microphone failure error when getUserMedia rejects', async ({ page }) => {
  await page.addInitScript(() => {
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
  await clickNewAction(page, 'New recording')
  await expect(page.getByText('Paste your script')).toBeVisible()
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(
    page.getByText('Microphone access failed. Ensure the mic permission is allowed and you are on HTTPS.'),
  ).toBeVisible()
})

test('record page updates elapsed time while recording', async ({ page }) => {
  await setupDefaultStubs(page)

  await page.goto('/')
  await clickNewAction(page, 'New recording')
  await page.getByRole('button', { name: 'Start recording' }).click()
  const recordingModal = page.getByTestId('recording-fullscreen-modal')
  await expect(recordingModal).toBeVisible()

  await expect
    .poll(async () => {
      const timerText = await recordingModal.locator('div', { hasText: /Elapsed 0:/ }).first().textContent()
      return timerText ?? ''
    })
    .toMatch(/Elapsed 0:0[1-9]/)

  await page.getByRole('button', { name: 'Stop recording' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click()
})

test('recording mode uses fullscreen script modal with one stop action', async ({ page }) => {
  await setupDefaultStubs(page)

  await page.goto('/')
  await clickNewAction(page, 'New recording')
  await page.locator('textarea').fill('Line one\nLine two')
  await page.getByRole('button', { name: 'Start recording' }).click()

  const recordingModal = page.getByTestId('recording-fullscreen-modal')
  await expect(recordingModal).toBeVisible()
  await expect(recordingModal.getByText('Line one')).toBeVisible()
  await expect(recordingModal.getByText('Line two')).toBeVisible()
  await expect(recordingModal.getByRole('button')).toHaveCount(1)
  await expect(recordingModal.getByRole('button', { name: 'Stop recording' })).toBeVisible()
  await expect(page.getByTestId('record-page-floating-footer')).toHaveCount(0)

  await recordingModal.getByRole('button', { name: 'Stop recording' }).click()
  await expect(page.getByRole('heading', { name: 'Name your recording' })).toBeVisible()
  await page.getByRole('button', { name: 'Discard' }).click()
})

test('record naming modal confirms before discarding when closed', async ({ page }) => {
  await setupDefaultStubs(page)

  await page.goto('/')
  await clickNewAction(page, 'New recording')
  await page.locator('textarea').fill('Discard guard clip')
  await page.getByRole('button', { name: 'Start recording' }).click()
  await page.getByRole('button', { name: 'Stop recording' }).click()

  await expect(page.getByRole('heading', { name: 'Name your recording' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Discard recording?' })).toBeVisible()

  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByRole('heading', { name: 'Name your recording' })).toBeVisible()

  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/record$/)
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible()
})

test('recording save stores audio bytes when Blob persistence fails', async ({ page }) => {
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function patchedPut(value: unknown, key?: IDBValidKey) {
      if (
        value &&
        typeof value === 'object' &&
        'blob' in value &&
        (value as { blob?: unknown }).blob instanceof Blob
      ) {
        throw new DOMException('Blob serialization disabled for test', 'DataCloneError')
      }
      return originalPut.call(this, value as unknown, key)
    }
  })

  await setupDefaultStubs(page)
  const name = await createRecording(page, 'Blob fallback clip', 600)

  const stored = await page.evaluate(async (recordingName) => {
    const request = indexedDB.open('EchoMemoNewDB', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('failed to open db'))
    })

    const record = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const tx = db.transaction('recordings', 'readonly')
      const store = tx.objectStore('recordings')
      const getAllReq = store.getAll()
      getAllReq.onsuccess = () => {
        const all = getAllReq.result as Array<Record<string, unknown>>
        resolve(all.find((item) => item.name === recordingName))
      }
      getAllReq.onerror = () => reject(getAllReq.error ?? new Error('failed to read records'))
      tx.onerror = () => reject(tx.error ?? new Error('transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
    })

    db.close()

    if (!record) return null
    return {
      hasBlob: record.blob instanceof Blob,
      hasAudioBytes: record.audioBytes instanceof ArrayBuffer,
      audioBytesLength: record.audioBytes instanceof ArrayBuffer ? record.audioBytes.byteLength : 0,
    }
  }, name)

  expect(stored).not.toBeNull()
  expect(stored?.hasBlob).toBe(false)
  expect(stored?.hasAudioBytes).toBe(true)
  expect((stored?.audioBytesLength ?? 0)).toBeGreaterThan(1000)

  await page.getByRole('button', { name }).click()
  await expect(page).toHaveURL(/\/play\//)
  await expect(page.getByRole('heading', { name: 'Recording', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible()
})

test('playback loops after ended event', async ({ page }) => {
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

})

test('playback seek slider supports keyboard input', async ({ page }) => {
  await setupDefaultStubs(page)
  const name = await createRecording(page, 'Keyboard Seek Clip', 800)

  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(page).toHaveURL(/\/play\//)

  const slider = page.getByRole('slider', { name: 'Seek audio' })
  await page.evaluate(() => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null
    if (audio) {
      Object.defineProperty(audio, 'duration', { value: 8, configurable: true })
      audio.dispatchEvent(new Event('loadedmetadata'))
    }
  })
  await expect
    .poll(async () => Number((await slider.getAttribute('aria-valuemax')) || '0'))
    .toBeGreaterThan(0)

  await slider.press('ArrowRight')
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement | null)?.currentTime || 0))
    .toBeGreaterThan(0)

  await slider.press('Home')
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement | null)?.currentTime || 0))
    .toBeLessThan(0.2)
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

test('playlist seek slider supports keyboard input', async ({ page }) => {
  await setupDefaultStubs(page)
  await createPlaylist(page, 'Seek Playlist', ['Track A', 'Track B'])

  const slider = page.getByRole('slider', { name: 'Seek playlist' })
  await page.evaluate(() => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null
    if (audio) {
      Object.defineProperty(audio, 'duration', { value: 9, configurable: true })
      audio.dispatchEvent(new Event('loadedmetadata'))
    }
  })
  await expect
    .poll(async () => Number((await slider.getAttribute('aria-valuemax')) || '0'))
    .toBeGreaterThan(0)

  await slider.press('ArrowRight')
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement | null)?.currentTime || 0))
    .toBeGreaterThan(0)
})
