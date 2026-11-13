import { createFileRoute } from '@tanstack/react-router'
import {
  isGoogleSheetsSyncConfigured,
  syncGoogleSheets,
} from '@/lib/google-sheets-sync.server'

export const Route = createFileRoute('/api/cron/sync-google-sheets')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET
        const authorization = request.headers.get('authorization')

        if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
          return Response.json({ error: 'Não autorizado.' }, { status: 401 })
        }

        if (!isGoogleSheetsSyncConfigured()) {
          console.info('Google Sheets sync skipped: private configuration is incomplete.')
          return Response.json(
            { error: 'Configuração do Google Sheets incompleta.' },
            { status: 503 },
          )
        }

        try {
          const result = await syncGoogleSheets()
          console.info('Google Sheets sync completed.', result)
          return Response.json({ success: true, ...result })
        } catch (error) {
          console.error('Google Sheets sync failed.', error)
          return Response.json(
            { error: 'Falha ao sincronizar a planilha.' },
            { status: 500 },
          )
        }
      },
    },
  },
})
