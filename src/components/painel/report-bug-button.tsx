import * as React from 'react'
import { Bug, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { enviarRelatorioBug } from '@/lib/admin.functions'

export function ReportBugButton({ area }: { area: string }) {
  const [aberto, setAberto] = React.useState(false)
  const [descricao, setDescricao] = React.useState('')
  const [enviando, setEnviando] = React.useState(false)

  async function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const texto = descricao.trim()
    if (texto.length < 10) {
      toast.error('Descreva o problema com pelo menos 10 caracteres.')
      return
    }
    setEnviando(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Sua sessão expirou. Entre novamente no ERP.')
      }
      await enviarRelatorioBug({
        data: {
          accessToken: sessionData.session.access_token,
          area,
          descricao: texto,
          pagina: window.location.pathname,
        },
      })
      toast.success('Relatório enviado diretamente pelo ERP para pcp.sp@embalando.com.br.')
      setDescricao('')
      setAberto(false)
    } catch (error) {
      toast.error('Não foi possível enviar o relatório.', {
        description: error instanceof Error ? error.message : 'Erro inesperado no envio.',
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 bg-transparent p-0 text-xs font-semibold text-red-600 underline-offset-4 hover:text-red-700 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        <Bug className="size-3.5" />
        Reportar um bug
      </button>

      {aberto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !enviando) setAberto(false)
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reportar-bug-titulo"
            className="w-full max-w-lg rounded-xl border border-border bg-background p-5 text-foreground shadow-2xl sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="reportar-bug-titulo" className="text-lg font-semibold">Reportar um bug</h2>
                <p className="mt-1 text-sm text-muted-foreground">O relato será enviado pelo ERP, sem abrir outro aplicativo.</p>
              </div>
              <button type="button" disabled={enviando} onClick={() => setAberto(false)} className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50" aria-label="Fechar">✕</button>
            </div>

            <form onSubmit={enviar} className="grid gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="bug-setor" className="text-sm font-medium">Setor</label>
                <input id="bug-setor" value={area} readOnly className="h-10 rounded-md border border-border bg-muted px-3 text-sm text-foreground" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="bug-destinatario" className="text-sm font-medium">Destino</label>
                <input id="bug-destinatario" value="pcp.sp@embalando.com.br" readOnly className="h-10 rounded-md border border-border bg-muted px-3 text-sm text-foreground" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="bug-descricao" className="text-sm font-medium">Descreva o bug</label>
                <textarea id="bug-descricao" required minLength={10} maxLength={5000} rows={5} value={descricao} onChange={(event) => setDescricao(event.target.value)} placeholder="Explique o que aconteceu, em qual tela e quais passos causaram o problema..." className="resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <p className="text-xs text-muted-foreground">O ERP incluirá seu usuário, setor, página e horário automaticamente.</p>
              <div className="flex justify-end gap-2">
                <button type="button" disabled={enviando} onClick={() => setAberto(false)} className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-accent disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={enviando} className="inline-flex h-10 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {enviando && <LoaderCircle className="size-4 animate-spin" />}
                  {enviando ? 'Enviando...' : 'Enviar relatório'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  )
}
