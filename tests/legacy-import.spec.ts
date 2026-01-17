import { test, expect, Page } from '@playwright/test'

async function resetDatabases(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__echoMemoResetApplied')) return
    sessionStorage.setItem('__echoMemoResetApplied', 'true')
    indexedDB.deleteDatabase('EchoMemoDB')
    indexedDB.deleteDatabase('EchoMemoNewDB')
    localStorage.removeItem('__echoMemoDbCleared')
    localStorage.removeItem('__echoMemoLegacyMigrated')
  })
}

async function seedLegacyDb(page: Page) {
  await resetDatabases(page)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__echoMemoLegacySeeded')) return
    sessionStorage.setItem('__echoMemoLegacySeeded', 'true')
    const request = indexedDB.open('EchoMemoDB', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('recordings')) {
        db.createObjectStore('recordings', { keyPath: 'id' })
      }
    }

    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('recordings', 'readwrite')
      const store = tx.objectStore('recordings')

      store.put({
        id: 101,
        name: 'Legacy Clip',
        createdAt: Date.now() - 10_000,
        duration: '1500',
        size: '12',
        scriptText: 'Legacy script',
        blob: new Blob(['legacy'], { type: 'audio/webm' }),
      })

      store.put({
        id: 'legacy-folder',
        name: 'Old Folder',
        createdAt: Date.now() - 20_000,
        isFolder: true,
        kind: 'folder',
        parent: null,
      })

      store.put({
        id: 'legacy-playlist',
        name: 'Old Playlist',
        createdAt: Date.now() - 15_000,
        isPlaylist: true,
        entries: [{ recordingId: 101, repeats: '2' }],
        parent: null,
      })

      tx.oncomplete = () => db.close()
    }
  })
}

test('shows import banner and copies legacy data', async ({ page }) => {
  await seedLegacyDb(page)
  await page.goto('/')

  await expect(page.getByText('Found data from an older EchoMemo')).toBeVisible()

  await page.getByRole('button', { name: 'Copy to new app' }).click()
  await expect(page.getByText(/Copied .* items/)).toBeVisible()

  await expect(page.getByText('Legacy Clip')).toBeVisible()
  await expect(page.getByText('Old Playlist')).toBeVisible()

  await page.getByRole('button', { name: 'Old Playlist' }).click()
  await expect(page).toHaveURL(/\/playlist\//)
  await expect(page.getByText('Legacy Clip')).toBeVisible()
})

test('does not show banner when no legacy data exists', async ({ page }) => {
  await resetDatabases(page)
  await page.goto('/')
  await expect(page.getByText('Found data from an older EchoMemo')).toHaveCount(0)
})

test('does not prompt again after importing once', async ({ page }) => {
  await seedLegacyDb(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'Copy to new app' }).click()
  await expect(page.getByText(/Copied .* items/)).toBeVisible()

  await page.reload()
  await expect(page.getByText('Found data from an older EchoMemo')).toHaveCount(0)
  await expect(page.getByText('Legacy Clip')).toBeVisible()
})

test('does not prompt again after dismissing', async ({ page }) => {
  await seedLegacyDb(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'Dismiss' }).click()

  await page.reload()
  await expect(page.getByText('Found data from an older EchoMemo')).toHaveCount(0)
})
