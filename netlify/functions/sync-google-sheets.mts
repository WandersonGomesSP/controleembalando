import {
  isGoogleSheetsSyncConfigured,
  syncGoogleSheets,
} from '../../src/lib/google-sheets-sync.server.ts'

export const config = {
  schedule: '0 9 * * 1-5',
}

export default async function handler() {
  if (!isGoogleSheetsSyncConfigured()) {
    console.info('Google Sheets sync skipped: private configuration is incomplete.')
    return new Response('Skipped: Google Sheets configuration is incomplete.', { status: 200 })
  }

  const result = await syncGoogleSheets()
  console.info('Google Sheets sync completed.', result)
  return new Response('Synchronized', { status: 200 })
}
