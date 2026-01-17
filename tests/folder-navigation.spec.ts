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

test.beforeEach(async ({ page }) => {
  await setupBrowserStubs(page)
})

test('folder view only shows children of that folder', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill('My Folder')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('My Folder')).toBeVisible()

  await createRecordingInCurrentView(page, 'Root Clip')

  const folderRow = page.locator('[role="button"]', { hasText: 'My Folder' }).first()
  await folderRow.click()
  await expect(page).toHaveURL(/\/folder\//)
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()

  await createRecordingInCurrentView(page, 'Child Clip')

  await expect(page.getByText('Child Clip')).toBeVisible()
  await expect(page.getByText('Root Clip')).toHaveCount(0)
})

test('nested folder appears when revisiting parent from root', async ({ page }) => {
  await page.goto('/')

  // Create parent folder at root.
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill('Parent Folder')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Parent Folder')).toBeVisible()

  // Enter parent, create child folder.
  await page.getByRole('button', { name: 'Parent Folder' }).click()
  await expect(page).toHaveURL(/\/folder\//)
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill('Child Folder')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Child Folder')).toBeVisible()

  // Go back to root, then re-enter parent.
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/(EchoMemo3\/)?$/)
  await page.getByRole('button', { name: 'Parent Folder' }).click()
  await expect(page).toHaveURL(/\/folder\//)

  // Child folder should be visible when returning.
  await expect(page.getByText('Child Folder')).toBeVisible()
})

test('back button goes to parent folder when inside nested folder', async ({ page }) => {
  await page.goto('/')

  // Create parent folder at root.
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill('Parent Folder')
  await page.getByRole('button', { name: 'Create' }).click()

  // Enter parent and capture its URL.
  await page.getByRole('button', { name: 'Parent Folder' }).click()
  await expect(page).toHaveURL(/\/folder\//)
  const parentUrl = page.url()

  // Create nested folder inside parent and enter it.
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill('Child Folder')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: 'Child Folder' }).click()
  await expect(page).toHaveURL(/\/folder\//)

  // Click back; should land in parent folder view (parentUrl).
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(parentUrl)

  // Child folder should be visible in the parent folder listing.
  await expect(page.getByText('Child Folder')).toBeVisible()
})
