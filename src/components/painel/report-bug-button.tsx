import * as React from 'react'
import { Bug } from 'lucide-react'

const EMAIL_PADRAO = 'pcp.sp@embalando.com.br'

export function ReportBugButton({ area }: { area: string }) {
  const [aberto, setAberto] = React.useState(false)
  const [destinatario, setDestinatario] = React.useState(EMAIL_PADRAO)
  const [descricao, setDescricao] = React.useState('')

  function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = destinatario.trim()
    if (!email || !descricao.trim()) return
    const assunto = encodeURIComponent(`Relato de bug - ${area}`)
    const corpo = encodeURIComponent(
      `Setor: ${area}\n\nDescrição do problema:\n${descricao.trim()}\n\nEnviado pelo sistema Controle Embalando.`,
    )
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${assunto}&body=${corpo}`
    setAberto(false)
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
          if (event.target === event.currentTarget) setAberto(false)
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
                <p className="mt-1 text-sm text-muted-foreground">O setor atual será informado automaticamente.</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent" aria-label="Fechar">✕</button>
            </div>

            <form onSubmit={enviar} className="grid gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="bug-setor" className="text-sm font-medium">Setor</label>
                <input id="bug-setor" value={area} readOnly className="h-10 rounded-md border border-border bg-muted px-3 text-sm text-foreground" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="bug-destinatario" className="text-sm font-medium">Enviar para</label>
                <input id="bug-destinatario" type="email" required value={destinatario} onChange={(event) => setDestinatario(event.target.value)} className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="bug-descricao" className="text-sm font-medium">Descreva o bug</label>
                <textarea id="bug-descricao" required rows={5} value={descricao} onChange={(event) => setDescricao(event.target.value)} placeholder="Explique o que aconteceu, em qual tela e quais passos causaram o problema..." className="resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <p className="text-xs text-muted-foreground">Ao continuar, seu aplicativo de e-mail será aberto com o destinatário, o setor e a descrição preenchidos.</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAberto(false)} className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-accent">Cancelar</button>
                <button type="submit" className="h-10 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">Preparar e-mail</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  )
}
