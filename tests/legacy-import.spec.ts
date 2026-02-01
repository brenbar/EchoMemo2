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
  await seedLegacyDbNoReset(page)
}

async function seedLegacyDbNoReset(page: Page) {
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

async function seedCurrentDbWithCollision(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__echoMemoNewSeeded')) return
    sessionStorage.setItem('__echoMemoNewSeeded', 'true')

    const request = indexedDB.open('EchoMemoNewDB', 1)
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
        name: 'Existing Clip',
        createdAt: Date.now() - 5_000,
        duration: 800,
        size: 8,
        scriptText: 'Existing script',
        blob: new Blob(['existing'], { type: 'audio/webm' }),
        kind: 'recording',
        isFolder: false,
        isPlaylist: false,
        parent: null,
      })

      tx.oncomplete = () => db.close()
    }
  })
}

async function getLegacyRecordCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const canListDatabases = typeof (indexedDB as any).databases === 'function'
    const databases = canListDatabases ? await (indexedDB as any).databases() : []
    const legacyDbExists = Array.isArray(databases)
      ? databases.some((db: { name?: string }) => db?.name === 'EchoMemoDB')
      : false

    if (!legacyDbExists) return 0

    return await new Promise<number>((resolve) => {
      const request = indexedDB.open('EchoMemoDB')
      request.onupgradeneeded = () => {
        request.transaction?.abort()
        resolve(0)
      }
      request.onerror = () => resolve(0)
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('recordings')) {
          db.close()
          resolve(0)
          return
        }

        const tx = db.transaction('recordings', 'readonly')
        const countRequest = tx.objectStore('recordings').count()
        countRequest.onsuccess = () => {
          const count = countRequest.result ?? 0
          db.close()
          resolve(count)
        }
        countRequest.onerror = () => {
          db.close()
          resolve(0)
        }
      }
    })
  })
}

test('automatically imports legacy data on load', async ({ page }) => {
  await seedLegacyDb(page)
  await page.goto('/')
  await expect(page.getByText('Found data from an older EchoMemo')).toHaveCount(0)

  await expect(page.getByText('Legacy Clip', { exact: true })).toBeVisible()
  await expect(page.getByText('Old Playlist')).toBeVisible()

  const legacyCount = await getLegacyRecordCount(page)
  expect(legacyCount).toBe(0)

  await page.getByRole('button', { name: 'Old Playlist' }).click()
  await expect(page).toHaveURL(/\/playlist\//)
  await expect(page.getByText('Legacy Clip', { exact: true })).toBeVisible()
})

test('does not reimport or prompt on reload', async ({ page }) => {
  await seedLegacyDb(page)
  await page.goto('/')

  await expect(page.getByText('Legacy Clip', { exact: true })).toBeVisible()
  await page.reload()

  await expect(page.getByText('Found data from an older EchoMemo')).toHaveCount(0)
  await expect(page.getByText('Legacy Clip', { exact: true })).toBeVisible()

  const legacyCount = await getLegacyRecordCount(page)
  expect(legacyCount).toBe(0)
})

test('imports legacy data even when ids collide', async ({ page }) => {
  await resetDatabases(page)
  await seedCurrentDbWithCollision(page)
  await seedLegacyDbNoReset(page)

  await page.goto('/')

  await expect(page.getByText('Existing Clip')).toBeVisible()
  await expect(page.getByText('Legacy Clip', { exact: true })).toBeVisible()
  await expect(page.getByText('Old Playlist')).toBeVisible()

  await page.getByRole('button', { name: 'Old Playlist' }).click()
  await expect(page).toHaveURL(/\/playlist\//)
  await expect(page.getByText('Legacy Clip', { exact: true })).toBeVisible()

  const legacyCount = await getLegacyRecordCount(page)
  expect(legacyCount).toBe(0)
})

test('ignores migration flow when no legacy data exists', async ({ page }) => {
  await resetDatabases(page)
  await page.goto('/')

  await expect(page.getByText('Found data from an older EchoMemo')).toHaveCount(0)
})
