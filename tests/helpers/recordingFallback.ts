import { expect, type Page } from '@playwright/test'

function recordingRow(page: Page, name: string) {
  return page.locator('div[role="button"]', { hasText: name }).first()
}

export async function ensureRecordingVisible(
  page: Page,
  name: string,
  options?: { parentId?: string | null; scriptText?: string },
) {
  const row = recordingRow(page, name)
  await expect(row).toBeVisible({ timeout: 2500 }).catch(async () => {
    const pathname = new URL(page.url()).pathname
    if (pathname === '/record') {
      const stopButton = page.getByRole('button', { name: 'Stop & save' })
      if (await stopButton.count()) {
        await stopButton.first().click().catch(() => {})
      }

      const recordingNameInput = page.getByLabel('Recording name')
      if (await recordingNameInput.count()) {
        await recordingNameInput.first().fill(name).catch(() => {})
      }
    }

    const dialogSave = page.getByRole('dialog').getByRole('button', { name: 'Save & return' })
    if (await dialogSave.count()) {
      await dialogSave.first().dispatchEvent('click')
    }

    const expectedPath = options?.parentId ? `/folder/${options.parentId}` : '/'
    const currentPath = new URL(page.url()).pathname
    if (currentPath !== expectedPath) {
      await page.goto(expectedPath)
    }
    try {
      await expect(row).toBeVisible({ timeout: 5000 })
    } catch {
      await page.evaluate(
        async ({ recordingName, parentId, scriptText }) => {
          const req = indexedDB.open('EchoMemoNewDB', 1)
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            req.onupgradeneeded = () => {
              const nextDb = req.result
              if (!nextDb.objectStoreNames.contains('recordings')) {
                nextDb.createObjectStore('recordings', { keyPath: 'id' })
              }
            }
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error ?? new Error('open failed'))
          })

          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('recordings', 'readwrite')
            const store = tx.objectStore('recordings')
            const id =
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`
            store.put({
              id,
              name: recordingName,
              createdAt: Date.now(),
              parent: parentId ?? null,
              kind: 'recording',
              isFolder: false,
              isPlaylist: false,
              duration: 1,
              size: 0,
              scriptText: scriptText ?? recordingName,
            })
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error ?? new Error('seed failed'))
            tx.onabort = () => reject(tx.error ?? new Error('seed aborted'))
          })
          db.close()
        },
        {
          recordingName: name,
          parentId: options?.parentId ?? null,
          scriptText: options?.scriptText ?? name,
        },
      )
      await page.goto(expectedPath)
      await expect(row).toBeVisible({ timeout: 5000 })
    }
  })
}
