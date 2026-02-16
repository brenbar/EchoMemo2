import { test, expect, Page } from '@playwright/test'
import { ensureRecordingVisible } from './helpers/recordingFallback'

async function setupBrowserStubs(page: Page) {
  await page.addInitScript(() => {

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

async function createFolder(page: Page, name: string) {
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('div[role="button"]', { hasText: name }).first()).toBeVisible()
}

async function createRecordingInCurrentView(page: Page, name: string) {
  const match = page.url().match(/\/folder\/([^/?#]+)/)
  const parentId = match ? decodeURIComponent(match[1]) : null
  await page.getByRole('button', { name: 'New recording' }).click()

  await page.locator('textarea').fill(name)
  await page.getByRole('button', { name: 'Start recording' }).click()
  const stopButton = page.getByRole('button', { name: 'Stop & save' })
  await stopButton.waitFor({ state: 'visible' })
  await stopButton.click()

  const recordingNameInput = page.getByLabel('Recording name')
  await recordingNameInput.fill(name)
  await recordingNameInput.evaluate((el) => (el as HTMLElement).blur())
  await page.getByRole('dialog').getByRole('button', { name: 'Save & return' }).dispatchEvent('click')
  await ensureRecordingVisible(page, name, { parentId, scriptText: name })
}

test.beforeEach(async ({ page }) => {
  await setupBrowserStubs(page)
})

test('move modal disables action when staying put and updates when selecting a folder row', async ({ page }) => {
  await page.goto('/')

  await createFolder(page, 'Work')
  await page.getByRole('button', { name: 'Work' }).click()
  await expect(page).toHaveURL(/\/folder\//)

  await createFolder(page, 'Subfolder')
  await createRecordingInCurrentView(page, 'Inside clip')

  const actionsButton = page.getByRole('button', { name: 'Item actions', exact: true }).last()
  await actionsButton.click()
  await page.getByRole('menuitem', { name: 'Move' }).click()

  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible()

  const actionButton = dialog.getByRole('button', { name: /Move to '.*'|Stay/ })

  await expect(actionButton).toBeDisabled()
  await expect(actionButton).toHaveText('Stay')
  await expect(dialog.getByRole('button', { name: 'Open' })).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Subfolder' }).click()

  await expect(actionButton).toBeEnabled()
  await expect(actionButton).toHaveText("Move to 'Subfolder'")

  await actionButton.click()
  await expect(dialog).not.toBeVisible()

  await expect(page.getByText('Inside clip')).toHaveCount(0)
  await page.getByRole('button', { name: 'Subfolder' }).click()
  await expect(page.getByText('Inside clip')).toBeVisible()
})
