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

async function createFolder(page: Page, name: string) {
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText(name)).toBeVisible()
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

test('deleting a non-empty folder requires acknowledgement and removes nested contents', async ({ page }) => {
  await page.goto('/')

  await createFolder(page, 'Parent Folder')
  await page.getByRole('button', { name: 'Parent Folder' }).click()
  await expect(page).toHaveURL(/\/folder\//)

  await createFolder(page, 'Child Folder')
  await page.getByRole('button', { name: 'Child Folder' }).click()
  await expect(page).toHaveURL(/\/folder\//)

  await createRecordingInCurrentView(page, 'Nested Clip')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/folder\//)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/(EchoMemo3\/)?$/)

  const parentRow = page.locator('div[role="button"]', { hasText: 'Parent Folder' }).first()
  await parentRow.getByRole('button', { name: 'Item actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()

  const dialog = page.getByRole('dialog').last()
  await expect(dialog.getByText(/2 items inside will also be deleted/i)).toBeVisible()

  const deleteButton = dialog.getByRole('button', { name: 'Delete' })
  await expect(deleteButton).toBeDisabled()

  await dialog.getByLabel(/permanently delete this folder/i).check()
  await expect(deleteButton).toBeEnabled()

  await deleteButton.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await expect(page.getByText('Parent Folder')).toHaveCount(0)
  await expect(page.getByText('Nested Clip')).toHaveCount(0)
})
