import * as React from 'react'
import {
  ArrowLeft,
  ChartNoAxesCombined,
  Clock3,
  PackageCheck,
  RefreshCw,
  Ruler,
  Search,
  Save,
  FileUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { importarCsvRebobinadeira } from '@/lib/admin.functions'
import type { RebobinadeiraEstoqueMinimoRow } from '@/lib/database.types'

type Props = {
  onChangeArea: () => void
  isDeveloper: boolean
}

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

function formatar(valor: number | null | undefined, casas = false) {
  if (valor == null || !Number.isFinite(Number(valor))) return '—'
  return (casas ? numero : inteiro).format(Number(valor))
}

export function RebobinadeiraArea({ onChangeArea, isDeveloper }: Props) {
  const [registros, setRegistros] = React.useState<RebobinadeiraEstoqueMinimoRow[]>([])
  const [leadTimes, setLeadTimes] = React.useState<Record<string, string>>({})
  const [busca, setBusca] = React.useState('')
  const [carregando, setCarregando] = React.useState(true)
  const [atualizando, setAtualizando] = React.useState(false)
  const [salvando, setSalvando] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState('')
  const [arquivo, setArquivo] = React.useState<File | null>(null)
  const [importando, setImportando] = React.useState(false)
  const [resultadoImportacao, setResultadoImportacao] = React.useState<{
    recebidas: number
    validas: number
    rejeitadas: number
    gravadas: number
    rejeicoes: { linha: number; motivo: string }[]
  } | null>(null)
  const inputArquivoRef = React.useRef<HTMLInputElement>(null)

  const carregar = React.useCallback(async (silencioso = false) => {
    if (silencioso) setAtualizando(true)
    else setCarregando(true)
    setErro('')
    const { data, error } = await supabase
      .schema('rebobinadeira')
      .from('vw_estoque_minimo')
      .select('*')
      .order('descricao', { ascending: true })
    if (error) {
      setErro(error.message)
      toast.error('Não foi possível carregar os indicadores da Rebobinadeira.', {
        description: error.message,
      })
    } else {
      setRegistros((data ?? []) as RebobinadeiraEstoqueMinimoRow[])
      setLeadTimes({})
    }
    setCarregando(false)
    setAtualizando(false)
  }, [])

  React.useEffect(() => {
    void carregar()
  }, [carregar])

  async function salvarLeadTime(registro: RebobinadeiraEstoqueMinimoRow) {
    const texto = leadTimes[registro.codigo] ??
      (registro.lead_time_dias == null ? '' : String(registro.lead_time_dias))
    const valor = texto.trim() === '' ? null : Number(texto)
    if (valor !== null && (!Number.isInteger(valor) || valor < 0)) {
      toast.error('Informe um lead time válido em dias inteiros.')
      return
    }
    setSalvando(registro.codigo)
    const { error } = await supabase
      .schema('rebobinadeira')
      .from('produtos_jumbo')
      .update({ lead_time_dias: valor })
      .eq('codigo', registro.codigo)
    if (error) {
      toast.error('Não foi possível salvar o lead time.', { description: error.message })
    } else {
      toast.success('Lead time atualizado.')
      await carregar(true)
    }
    setSalvando(null)
  }


  async function importarArquivo() {
    if (!arquivo) {
      toast.error('Selecione um arquivo CSV primeiro.')
      return
    }
    setImportando(true)
    setResultadoImportacao(null)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Sua sessão expirou. Entre novamente no sistema.')
      }
      const csv = await arquivo.text()
      const resultado = await importarCsvRebobinadeira({
        data: {
          accessToken: sessionData.session.access_token,
          csv,
          nomeArquivo: arquivo.name,
        },
      })
      setResultadoImportacao(resultado)
      setArquivo(null)
      if (inputArquivoRef.current) inputArquivoRef.current.value = ''
      toast.success('Importação concluída.', {
        description: `${resultado.gravadas} bobinas gravadas; ${resultado.rejeitadas} linhas rejeitadas.`,
      })
      await carregar(true)
    } catch (error) {
      toast.error('Não foi possível importar o CSV.', {
        description: error instanceof Error ? error.message : 'Verifique o arquivo e tente novamente.',
      })
    } finally {
      setImportando(false)
    }
  }

  const filtrados = registros.filter((item) => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    return !termo || [item.descricao, item.material, item.cor, item.tipo_produto]
      .some((valor) => valor?.toLocaleLowerCase('pt-BR').includes(termo))
  })

  const totalJumbos = filtrados.reduce((total, item) => total + Number(item.estoque_minimo_jumbos || 0), 0)
  const totalKg = filtrados.reduce((total, item) => total + Number(item.estoque_minimo_kg || 0), 0)
  const totalMetros = filtrados.reduce((total, item) => total + Number(item.estoque_minimo_m || 0), 0)

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[96rem] flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/embalando-logo.svg" alt="Embalando Fitas Adesivas" className="h-12 w-48 object-contain" />
              <div>
                <h1 className="text-lg font-semibold leading-tight">Rebobinadeira</h1>
                <p className="text-xs text-muted-foreground">Indicadores de produção e estoque</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onChangeArea}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-black bg-black px-3 text-xs font-semibold text-white transition hover:bg-zinc-800"
            >
              <ArrowLeft className="size-4" /> Trocar de setor
            </button>
          </div>
          <nav aria-label="Menu principal" className="flex items-center gap-2 border-t border-border pt-3">
            <span className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
              <ChartNoAxesCombined className="size-4" /> Indicadores
            </span>
          </nav>
          <nav aria-label="Indicadores" className="flex items-center gap-2 pl-3">
            <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-foreground">
              <PackageCheck className="size-4" /> Estoque Mínimo
            </span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[96rem] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Indicadores / Estoque Mínimo</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Comparativo de estoque mínimo</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Compare o estoque calculado pelo peso e lead time com a cobertura recomendada por metragem de 1,5 semana útil.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void carregar(true)}
            disabled={atualizando || carregando}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium transition hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${atualizando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>


        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Importar dados da Rebobinadeira</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Selecione o CSV exportado da planilha. O arquivo deve usar ponto e vírgula e conter 31 colunas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputArquivoRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => setArquivo(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputArquivoRef.current?.click()}
              disabled={importando}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent disabled:opacity-50"
            >
              <FileUp className="size-4" />
              {arquivo ? arquivo.name : 'Selecionar CSV'}
            </button>
            <button
              type="button"
              onClick={() => void importarArquivo()}
              disabled={!arquivo || importando}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              <FileUp className={`size-4 ${importando ? 'animate-pulse' : ''}`} />
              {importando ? 'Importando...' : 'Importar arquivo'}
            </button>
          </div>
        </section>

        {resultadoImportacao && (
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">Resultado da última importação</h3>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>Recebidas: <strong>{resultadoImportacao.recebidas}</strong></span>
              <span>Válidas: <strong>{resultadoImportacao.validas}</strong></span>
              <span>Gravadas: <strong>{resultadoImportacao.gravadas}</strong></span>
              <span>Rejeitadas: <strong>{resultadoImportacao.rejeitadas}</strong></span>
            </div>
            {resultadoImportacao.rejeicoes.length > 0 && (
              <ul className="mt-3 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-muted-foreground">
                {resultadoImportacao.rejeicoes.map((item) => (
                  <li key={item.linha}>Linha {item.linha}: {item.motivo}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><PackageCheck className="size-4" /> Mínimo total em jumbos</div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{inteiro.format(totalJumbos)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Soma dos pisos e necessidades por produto filtrado</p>
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><ScaleIcon /> Mínimo total por peso</div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatar(totalKg, true)} kg</p>
            <p className="mt-1 text-xs text-muted-foreground">Calculado pelo consumo móvel e lead time individual</p>
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Ruler className="size-4" /> Mínimo total por metragem</div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{inteiro.format(Math.ceil(totalMetros))} m</p>
            <p className="mt-1 text-xs text-muted-foreground">Cobertura recomendada de 1,5 semana útil</p>
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">Produtos e parâmetros</h3>
              <p className="text-xs text-muted-foreground">Janela móvel dos últimos 90 dias. Perdas não são somadas novamente ao consumo.</p>
            </div>
            <label className="relative block w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar produto, cor ou material"
                className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          {carregando ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Carregando indicadores...</div>
          ) : erro ? (
            <div className="p-8 text-center text-sm text-destructive">{erro}</div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <PackageCheck className="size-8 text-muted-foreground" />
              <p className="font-medium">{registros.length === 0 ? 'Ainda não há produtos para calcular' : 'Nenhum produto encontrado'}</p>
              <p className="max-w-lg text-sm text-muted-foreground">
                {registros.length === 0
                  ? 'Quando as bobinas da Rebobinadeira forem importadas, os produtos e os dois estoques mínimos aparecerão aqui.'
                  : 'Tente buscar por outro nome, cor ou material.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Produto</th>
                    <th className="px-4 py-3 font-semibold">Consumo médio kg/mês</th>
                    <th className="px-4 py-3 font-semibold">Lead time</th>
                    <th className="px-4 py-3 font-semibold">Mínimo kg</th>
                    <th className="px-4 py-3 font-semibold">Mínimo (jumbos)</th>
                    <th className="px-4 py-3 font-semibold">Consumo semanal m</th>
                    <th className="px-4 py-3 font-semibold">Recomendado m</th>
                    {isDeveloper && <th className="px-4 py-3 font-semibold">Ajustar lead time</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((item) => {
                    const lead = leadTimes[item.codigo] ?? (item.lead_time_dias == null ? '' : String(item.lead_time_dias))
                    return (
                      <tr key={item.codigo} className="border-t border-border align-middle">
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.descricao}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{item.tipo_produto} · {item.material}</div>
                          {!item.possui_consumo && <span className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Piso mínimo: {item.piso_minimo_jumbos} jumbo</span>}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{formatar(item.consumo_mensal_kg, true)}</td>
                        <td className="px-4 py-3 tabular-nums">{item.lead_time_dias == null ? 'Não definido' : `${item.lead_time_dias} dias`}</td>
                        <td className="px-4 py-3 tabular-nums font-medium">{formatar(item.estoque_minimo_kg, true)} kg</td>
                        <td className="px-4 py-3 tabular-nums font-semibold">{formatar(item.estoque_minimo_jumbos)} un.</td>
                        <td className="px-4 py-3 tabular-nums">{formatar(item.consumo_semanal_m, true)} m</td>
                        <td className="px-4 py-3 tabular-nums font-semibold">{formatar(item.estoque_minimo_m)} m</td>
                        {isDeveloper && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <Clock3 className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  aria-label={`Lead time de ${item.descricao}`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={lead}
                                  onChange={(event) => setLeadTimes((state) => ({ ...state, [item.codigo]: event.target.value }))}
                                  className="h-9 w-24 rounded-md border border-input bg-background pl-7 pr-2 text-sm"
                                />
                              </div>
                              <button
                                type="button"
                                aria-label={`Salvar lead time de ${item.descricao}`}
                                disabled={salvando === item.codigo}
                                onClick={() => void salvarLeadTime(item)}
                                className="inline-flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                              >
                                <Save className="size-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs leading-5 text-muted-foreground">
          Peso: consumo dos últimos 90 dias ÷ 3 meses ÷ 22 dias úteis, multiplicado pelo lead time do produto; a quantidade de jumbos é arredondada para cima e respeita o piso mínimo. Metragem: soma móvel dos jumbos consumidos ÷ 13 semanas × 1,5. A metragem usada é a do jumbo que entrou na Rebobinadeira; refilo e perdas ficam fora do consumo.
        </p>
      </main>
    </div>
  )
}

function ScaleIcon() {
  return <span className="inline-flex size-4 items-center justify-center text-xs font-bold">kg</span>
}
