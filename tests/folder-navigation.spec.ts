import { test, expect, Page } from '@playwright/test'
import { clickNewAction } from './helpers/newMenu'
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

async function createRecordingInCurrentView(page: Page, name: string) {
  const match = page.url().match(/\/folder\/([^/?#]+)/)
  const parentId = match ? decodeURIComponent(match[1]) : null
  await clickNewAction(page, 'New recording')

  await page.locator('textarea').fill(name)
  await page.getByRole('button', { name: 'Start recording' }).click()
  const stopButton = page.getByRole('button', { name: 'Stop recording' })
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

test('folder view only shows children of that folder', async ({ page }) => {
  await page.goto('/')
  const header = page.locator('section').first()

  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('My Folder')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('My Folder')).toBeVisible()

  await createRecordingInCurrentView(page, 'Root Clip')

  const folderRow = page.locator('[role="button"]', { hasText: 'My Folder' }).first()
  await folderRow.click()
  await expect(page).toHaveURL(/\/folder\//)
  await expect(page.getByRole('heading', { name: 'My Folder' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to parent folder' })).toBeVisible()

  await createRecordingInCurrentView(page, 'Child Clip')

  await expect(page.getByText('Child Clip')).toBeVisible()
  await expect(page.getByText('Root Clip')).toHaveCount(0)
})

test('nested folder appears when revisiting parent from root', async ({ page }) => {
  await page.goto('/')

  // Create parent folder at root.
  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Parent Folder')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Parent Folder')).toBeVisible()

  // Enter parent, create child folder.
  await page.getByRole('button', { name: 'Parent Folder' }).click()
  await expect(page).toHaveURL(/\/folder\//)
  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Child Folder')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Child Folder')).toBeVisible()

  // Go back to root, then re-enter parent.
  await page.getByRole('button', { name: 'Back to parent folder' }).click()
  await expect(page).toHaveURL(/\/(EchoMemo3\/)?$/)
  await page.getByRole('button', { name: 'Parent Folder' }).click()
  await expect(page).toHaveURL(/\/folder\//)

  // Child folder should be visible when returning.
  await expect(page.getByText('Child Folder')).toBeVisible()
})

test('back button goes to parent folder when inside nested folder', async ({ page }) => {
  await page.goto('/')

  // Create parent folder at root.
  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Parent Folder')
  await page.getByRole('button', { name: 'Create' }).click()

  // Enter parent and capture its URL.
  await page.getByRole('button', { name: 'Parent Folder' }).click()
  await expect(page).toHaveURL(/\/folder\//)
  const parentUrl = page.url()

  // Create nested folder inside parent and enter it.
  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Child Folder')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: 'Child Folder' }).click()
  await expect(page).toHaveURL(/\/folder\//)

  // Click back; should land in parent folder view (parentUrl).
  await page.getByRole('button', { name: 'Back to parent folder' }).click()
  await expect(page).toHaveURL(parentUrl)

  // Child folder should be visible in the parent folder listing.
  await expect(page.getByText('Child Folder')).toBeVisible()
})

test('long folder title does not overlap the back button on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')

  const longName = 'Folder ' + 'very-long-name-'.repeat(10)

  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill(longName)
  await page.getByRole('button', { name: 'Create' }).click()

  await page.getByRole('button', { name: longName }).click()
  await expect(page).toHaveURL(/\/folder\//)

  const backButton = page.getByRole('button', { name: 'Back to parent folder' })
  const headerTitle = page.getByRole('heading', { name: longName })
  await expect(backButton).toBeVisible()
  await expect(headerTitle).toBeVisible()
  await expect(headerTitle).toHaveCSS('text-overflow', 'ellipsis')

  const backBox = await backButton.boundingBox()
  const titleBox = await headerTitle.boundingBox()
  expect(backBox).not.toBeNull()
  expect(titleBox).not.toBeNull()
  if (!backBox || !titleBox) return

  expect(titleBox.x).toBeGreaterThanOrEqual(backBox.x + backBox.width - 1)
})

test('cannot move a folder into itself (or its descendants)', async ({ page }) => {
  await page.goto('/')

  // Create a folder at root.
  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Move Source')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Move Source')).toBeVisible()

  // Create a child folder inside it.
  await page.getByRole('button', { name: 'Move Source' }).click()
  await expect(page).toHaveURL(/\/folder\//)
  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Move Source Child')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Move Source Child')).toBeVisible()

  // Go back to root.
  const header = page.locator('section').first()
  await header.getByRole('button', { name: 'Back to parent folder' }).click()
  await expect(page).toHaveURL(/\/(EchoMemo3\/)?$/)

  // Create a different destination folder.
  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Move Destination')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Move Destination')).toBeVisible()

  // Open move modal for the source folder.
  const row = page.locator('div[role="button"][tabindex="0"]').filter({ hasText: 'Move Source' }).first()
  await row.getByRole('button', { name: 'Item actions' }).click()
  await page.getByRole('menuitem', { name: 'Move' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // The source folder should never be offered as a destination (prevents moving into itself/descendants).
  const folderButtons = dialog.locator('div.divide-y button')
  await expect(folderButtons.filter({ hasText: 'Move Source' })).toHaveCount(0)

  // Moving into a different folder should still work.
  await folderButtons.filter({ hasText: 'Move Destination' }).click()
  const moveButton = dialog.getByRole('button', { name: /Move to/ })
  await expect(moveButton).toBeEnabled()
  await moveButton.click()

  // Source folder should now be inside the destination folder.
  await expect(page.getByText('Move Source')).toHaveCount(0)
  await page.getByRole('button', { name: 'Move Destination' }).click()
  await expect(page.getByText('Move Source')).toBeVisible()
})

test('folders and items are alphabetized with folders first', async ({ page }) => {
  await page.goto('/')

  // Folders (intentionally created out of order).
  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Zulu Folder')
  await page.getByRole('button', { name: 'Create' }).click()
  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Alpha Folder')
  await page.getByRole('button', { name: 'Create' }).click()

  // Recordings (also out of order).
  await createRecordingInCurrentView(page, 'Beta Recording')
  await createRecordingInCurrentView(page, 'Alpha Recording')

  const rows = page.locator('div[role="button"][tabindex="0"]')
  await expect(rows).toHaveCount(5)
  await expect(rows.nth(0)).toContainText('_free')
  await expect(rows.nth(1)).toContainText('Alpha Folder')
  await expect(rows.nth(2)).toContainText('Zulu Folder')
  await expect(rows.nth(3)).toContainText('Alpha Recording')
  await expect(rows.nth(4)).toContainText('Beta Recording')
})

test('move modal lists folders alphabetically', async ({ page }) => {
  await page.goto('/')

  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Zulu Folder')
  await page.getByRole('button', { name: 'Create' }).click()
  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Alpha Folder')
  await page.getByRole('button', { name: 'Create' }).click()
  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Beta Folder')
  await page.getByRole('button', { name: 'Create' }).click()

  await createRecordingInCurrentView(page, 'Move Target')

  const row = page.locator('div[role="button"][tabindex="0"]').filter({ hasText: 'Move Target' }).first()
  await row.getByRole('button', { name: 'Item actions' }).click()
  await page.getByRole('menuitem', { name: 'Move' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const folderButtons = dialog.locator('div.divide-y button')
  await expect(folderButtons).toHaveCount(4)
  await expect(folderButtons.nth(0)).toContainText('_free')
  await expect(folderButtons.nth(1)).toContainText('Alpha Folder')
  await expect(folderButtons.nth(2)).toContainText('Beta Folder')
  await expect(folderButtons.nth(3)).toContainText('Zulu Folder')

  await dialog.getByRole('button', { name: 'Cancel' }).click()
})

test('recording playback back button returns to the source folder', async ({ page }) => {
  await page.goto('/')

  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Playback Source')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: 'Playback Source' }).click()
  await expect(page).toHaveURL(/\/folder\//)
  const folderUrl = page.url()

  await createRecordingInCurrentView(page, 'Folder Clip')
  await page.getByRole('button', { name: 'Folder Clip' }).click()
  await expect(page).toHaveURL(/\/play\//)

  await page.getByRole('button', { name: 'Back to list' }).click()
  await expect(page).toHaveURL(folderUrl)
  await expect(page.getByRole('button', { name: 'Folder Clip' })).toBeVisible()
})

test('playlist playback back button returns to the source folder', async ({ page }) => {
  await page.goto('/')

  await clickNewAction(page, 'New folder')
  await page.getByLabel('Folder name').fill('Playlist Source')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: 'Playlist Source' }).click()
  await expect(page).toHaveURL(/\/folder\//)
  const folderUrl = page.url()

  await createRecordingInCurrentView(page, 'Track One')
  await createRecordingInCurrentView(page, 'Track Two')

  await clickNewAction(page, 'New playlist')
  await page.getByLabel('Playlist name').fill('Folder Playlist')
  await page.getByRole('button', { name: 'Select recordings' }).click()
  await page.getByLabel('Track One').check()
  await page.getByLabel('Track Two').check()
  await page.getByTestId('modal-panel').getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Save playlist' }).click()

  await expect(page).toHaveURL(folderUrl)
  await page.getByRole('button', { name: 'Folder Playlist' }).click()
  await expect(page).toHaveURL(/\/playlist\//)

  await page.getByRole('button', { name: 'Back to list' }).click()
  await expect(page).toHaveURL(folderUrl)
  await expect(page.getByRole('button', { name: 'Folder Playlist' })).toBeVisible()
})
