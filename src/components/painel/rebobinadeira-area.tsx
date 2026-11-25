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
  Bell,
  BellOff,
  History,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listarEstoqueMinimoVirgem, salvarParametroEstoqueMinimoVirgem } from '@/lib/admin.functions'
import { carregarIndicadoresEstoqueMinimoRebobinadeira } from '@/lib/rebobinadeira-indicadores.functions'
import { HistoricoProducao } from '@/components/painel/historico-producao'
import type { RebobinadeiraEstoqueMinimoRow } from '@/lib/database.types'

type Props = {
  onChangeArea: () => void
  isDeveloper: boolean
  onOpenEstoqueAtual?: () => void
  onOpenCadastro?: () => void
  onOpenHistorico?: () => void
  onOpenLixeira?: () => void
}

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const chaveAlertaEstoque = (valor: string) => valor.trim().toLocaleLowerCase('pt-BR')
function formatar(valor: number | null | undefined, casas = false) {
  if (valor == null || !Number.isFinite(Number(valor))) return '—'
  return (casas ? numero : inteiro).format(Number(valor))
}

export function RebobinadeiraArea({ onChangeArea, isDeveloper }: Props) {
  const [tela, setTela] = React.useState<'historico' | 'cadastro' | 'indicadores' | 'lixeira' | 'estoque-minimo'>('historico')
  if (tela === 'estoque-minimo') {
    return <EstoqueMinimoView
      onChangeArea={onChangeArea}
      isDeveloper={isDeveloper}
      onOpenEstoqueAtual={() => setTela('indicadores')}
      onOpenCadastro={() => setTela('cadastro')}
      onOpenHistorico={() => setTela('historico')}
      onOpenLixeira={() => setTela('lixeira')}
    />
  }
  return <HistoricoProducao
    key={tela}
    onChangeArea={onChangeArea}
    isDeveloper={isDeveloper}
    initialTela={tela}
    onOpenEstoqueMinimo={() => setTela('estoque-minimo')}
  />
}

type EstoqueMinimoVirgemRow = {
  referencia: string
  bobinas_estoque: number
  peso_estoque_kg: number
  peso_medio_bobina_kg: number | null
  consumo_periodo_kg: number
  meses_periodo: number
  consumo_mensal_kg: number
  consumo_diario_kg: number
  lead_time_dias: number
  minimo_calculado_kg: number
  minimo_calibrado_kg: number | null
  minimo_calibrado_bobinas: number | null
  kg_bopp_por_jumbo: number | null
  capacidade_jumbos: number | null
  folga_calibrada_kg: number
  status_estoque: string
  primeira_producao: string | null
  ultima_producao: string | null
  registros_producao: number
}

type EstoqueMinimoVirgemDraft = {
  lead_time_dias: string
  minimo_calibrado_kg: string
  kg_bopp_por_jumbo: string
}

export function EstoqueMinimoCobrideira({ isDeveloper }: { isDeveloper: boolean }) {
  const [registros, setRegistros] = React.useState<EstoqueMinimoVirgemRow[]>([])
  const [rascunhos, setRascunhos] = React.useState<Record<string, EstoqueMinimoVirgemDraft>>({})
  const [busca, setBusca] = React.useState('')
  const [carregando, setCarregando] = React.useState(true)
  const [atualizando, setAtualizando] = React.useState(false)
  const [salvando, setSalvando] = React.useState<string | null>(null)

  const carregar = React.useCallback(async (silencioso = false) => {
    if (silencioso) setAtualizando(true)
    else setCarregando(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (sessionError || !accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      const resultado = await listarEstoqueMinimoVirgem({ data: { accessToken } })
      const linhas = (resultado ?? []) as EstoqueMinimoVirgemRow[]
      setRegistros(linhas)
      setRascunhos(Object.fromEntries(linhas.map((item) => [item.referencia, {
        lead_time_dias: String(item.lead_time_dias ?? 90),
        minimo_calibrado_kg: item.minimo_calibrado_kg == null ? '' : String(item.minimo_calibrado_kg),
        kg_bopp_por_jumbo: item.kg_bopp_por_jumbo == null ? '' : String(item.kg_bopp_por_jumbo),
      }])))
    } catch (error) {
      toast.error('Não foi possível carregar o estoque mínimo virgem.', {
        description: error instanceof Error ? error.message : 'Erro inesperado.',
      })
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }, [])

  React.useEffect(() => { void carregar() }, [carregar])

  function alterarRascunho(referencia: string, campo: keyof EstoqueMinimoVirgemDraft, valor: string) {
    setRascunhos((atuais) => ({
      ...atuais,
      [referencia]: { ...(atuais[referencia] ?? { lead_time_dias: '90', minimo_calibrado_kg: '', kg_bopp_por_jumbo: '' }), [campo]: valor },
    }))
  }

  async function salvar(item: EstoqueMinimoVirgemRow) {
    const rascunho = rascunhos[item.referencia] ?? {
      lead_time_dias: String(item.lead_time_dias ?? 90),
      minimo_calibrado_kg: item.minimo_calibrado_kg == null ? '' : String(item.minimo_calibrado_kg),
      kg_bopp_por_jumbo: item.kg_bopp_por_jumbo == null ? '' : String(item.kg_bopp_por_jumbo),
    }
    const leadTime = Number(rascunho.lead_time_dias)
    const minimoTexto = rascunho.minimo_calibrado_kg.trim()
    const jumboTexto = rascunho.kg_bopp_por_jumbo.trim()
    const minimo = minimoTexto ? Number(minimoTexto.replace(',', '.')) : null
    const kgPorJumbo = jumboTexto ? Number(jumboTexto.replace(',', '.')) : null
    if (!Number.isInteger(leadTime) || leadTime < 0 || leadTime > 3650) {
      toast.error('Informe um lead time inteiro entre 0 e 3.650 dias.')
      return
    }
    if (minimo !== null && (!Number.isFinite(minimo) || minimo < 0)) {
      toast.error('Informe um mínimo calibrado válido em kg.')
      return
    }
    if (kgPorJumbo !== null && (!Number.isFinite(kgPorJumbo) || kgPorJumbo <= 0)) {
      toast.error('Informe um fator kg por jumbo maior que zero.')
      return
    }
    setSalvando(item.referencia)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      await salvarParametroEstoqueMinimoVirgem({
        data: {
          accessToken,
          referencia: item.referencia,
          lead_time_dias: leadTime,
          minimo_calibrado_kg: minimo,
          kg_bopp_por_jumbo: kgPorJumbo,
        },
      })
      toast.success(`Parâmetros de ${item.referencia} atualizados.`)
      await carregar(true)
    } catch (error) {
      toast.error('Não foi possível salvar os parâmetros.', {
        description: error instanceof Error ? error.message : 'Erro inesperado.',
      })
    } finally {
      setSalvando(null)
    }
  }

  const filtrados = registros.filter((item) => item.referencia.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR')))
  const totalBobinas = filtrados.reduce((total, item) => total + Number(item.bobinas_estoque ?? 0), 0)
  const totalKg = filtrados.reduce((total, item) => total + Number(item.peso_estoque_kg ?? 0), 0)
  const capacidadeConhecida = filtrados.reduce((total, item) => total + Number(item.capacidade_jumbos ?? 0), 0)
  const abaixo = filtrados.filter((item) => item.status_estoque === 'ABAIXO' || item.status_estoque === 'ZERADO').length

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Estoque Mínimo Virgem</h2>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            O consumo real vem do peso de filme BOPP calculado nos lançamentos da Cobrideira.
            Consumo mensal = consumo do período ÷ meses com produção; diário = mensal ÷ 30;
            mínimo calculado = diário × lead time. O mínimo calibrado é independente e editável.
          </p>
        </div>
        <button type="button" onClick={() => void carregar(true)} disabled={atualizando || carregando}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#e3262e] px-3 text-sm font-semibold text-white hover:bg-[#c91f27] disabled:opacity-50">
          <RefreshCw className={`size-4 ${atualizando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-background p-4"><p className="text-xs text-muted-foreground">Bobinas disponíveis</p><p className="mt-1 text-2xl font-semibold tabular-nums">{inteiro.format(totalBobinas)}</p></div>
        <div className="rounded-lg border border-border bg-background p-4"><p className="text-xs text-muted-foreground">Peso em estoque</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatar(totalKg, true)} kg</p></div>
        <div className="rounded-lg border border-border bg-background p-4"><p className="text-xs text-muted-foreground">Capacidade calculável</p><p className="mt-1 text-2xl font-semibold tabular-nums">{inteiro.format(capacidadeConhecida)} jumbos</p></div>
        <div className="rounded-lg border border-border bg-background p-4"><p className="text-xs text-muted-foreground">Referências abaixo do calibrado</p><p className="mt-1 text-2xl font-semibold tabular-nums">{inteiro.format(abaixo)}</p></div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-semibold">Consumo e parâmetros por medida</h3><p className="text-xs text-muted-foreground">O consumo é calculado apenas para medidas que tenham registros de produção compatíveis.</p></div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar medida ou referência" className="h-9 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm" />
      </div>

      {carregando ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando estoque mínimo virgem...</p>
      ) : filtrados.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma referência encontrada.</p>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {filtrados.map((item) => {
            const draft = rascunhos[item.referencia] ?? { lead_time_dias: '90', minimo_calibrado_kg: '', kg_bopp_por_jumbo: '' }
            const minimoAtivo = item.minimo_calibrado_kg ?? item.minimo_calculado_kg
            const percentual = minimoAtivo > 0 ? ((Number(item.peso_estoque_kg ?? 0) - Number(minimoAtivo)) / Number(minimoAtivo)) * 100 : null
            const status = percentual === null ? 'ATENÇÃO' : percentual < 0 ? 'COMPRAR' : percentual <= 20 ? 'ATENÇÃO' : 'OK'
            const statusClass = status === 'COMPRAR' ? 'bg-red-100 text-red-800' : status === 'ATENÇÃO' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
            return (
              <article key={item.referencia} className="min-w-0 rounded-lg border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold">{item.referencia}</h3>
                    <p className="text-[10px] text-muted-foreground">{item.registros_producao} lançamentos · {item.meses_periodo} mês(es) com produção</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass}`}>{status}</span>
                    {percentual !== null && <span className={`text-xs font-bold tabular-nums ${percentual < 0 ? 'text-red-700' : percentual <= 20 ? 'text-amber-700' : 'text-emerald-700'}`}>{percentual >= 0 ? '+' : ''}{percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-muted/60 p-2"><p className="text-muted-foreground">Estoque atual</p><p className="font-bold tabular-nums">{formatar(item.peso_estoque_kg, true)} kg · {inteiro.format(item.bobinas_estoque)} bob.</p></div>
                  <div className="rounded-md bg-muted/60 p-2"><p className="text-muted-foreground">Consumo mensal</p><p className="font-bold tabular-nums">{formatar(item.consumo_mensal_kg, true)} kg</p></div>
                  <div className="rounded-md bg-muted/60 p-2"><p className="text-muted-foreground">Mínimo calculado</p><p className="font-bold tabular-nums">{formatar(item.minimo_calculado_kg, true)} kg</p></div>
                  <div className="rounded-md bg-muted/60 p-2"><p className="text-muted-foreground">Mínimo calibrado</p><p className="font-bold tabular-nums">{formatar(item.minimo_calibrado_kg, true)} kg</p></div>
                  <div className="rounded-md bg-muted/60 p-2"><p className="text-muted-foreground">Capacidade de produção</p><p className="font-bold tabular-nums">{item.capacidade_jumbos == null ? 'Não calculável' : `${inteiro.format(Number(item.capacidade_jumbos))} jumbos`}</p></div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="grid gap-1 text-[10px] font-semibold text-muted-foreground">Lead time (dias)
                    <input aria-label={`Lead time de ${item.referencia}`} value={draft.lead_time_dias} onChange={(e) => alterarRascunho(item.referencia,'lead_time_dias',e.target.value)} disabled={!isDeveloper} className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:opacity-70"/>
                  </label>
                  <label className="grid gap-1 text-[10px] font-semibold text-muted-foreground">Mínimo calibrado kg
                    <input aria-label={`Mínimo calibrado de ${item.referencia}`} value={draft.minimo_calibrado_kg} onChange={(e) => alterarRascunho(item.referencia,'minimo_calibrado_kg',e.target.value)} placeholder="Automático" disabled={!isDeveloper} className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:opacity-70"/>
                  </label>
                  <label className="grid gap-1 text-[10px] font-semibold text-muted-foreground">Kg por jumbo
                    <input aria-label={`Kg por jumbo de ${item.referencia}`} value={draft.kg_bopp_por_jumbo} onChange={(e) => alterarRascunho(item.referencia,'kg_bopp_por_jumbo',e.target.value)} placeholder="Configurar" disabled={!isDeveloper} className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:opacity-70"/>
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
                  <span>Consumo diário: {formatar(item.consumo_diario_kg, true)} kg · mínimo: {item.minimo_calibrado_bobinas == null ? '—' : inteiro.format(item.minimo_calibrado_bobinas)} bob.</span>
                  {isDeveloper && <button type="button" onClick={() => void salvar(item)} disabled={salvando===item.referencia} className="inline-flex h-8 items-center gap-1 rounded-md bg-[#e3262e] px-2.5 text-xs font-semibold text-white hover:bg-[#c91f27] disabled:opacity-50"><Save className="size-3.5"/>{salvando===item.referencia ? 'Salvando...' : 'Salvar'}</button>}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function EstoqueMinimoView({ onChangeArea, isDeveloper, embedded = false, onOpenEstoqueAtual }: Props & { embedded?: boolean }) {
  const [registros, setRegistros] = React.useState<RebobinadeiraEstoqueMinimoRow[]>([])
  const [leadTimes, setLeadTimes] = React.useState<Record<string, string>>({})
  const [ajustes, setAjustes] = React.useState<Record<string, number>>({})
  const [alertasDesativados, setAlertasDesativados] = React.useState<string[]>([])
  const [busca, setBusca] = React.useState('')
  const [carregando, setCarregando] = React.useState(true)
  const [atualizando, setAtualizando] = React.useState(false)
  const [salvando, setSalvando] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState('')
  const carregar = React.useCallback(async (silencioso = false) => {
    if (silencioso) setAtualizando(true)
    else setCarregando(true)
    setErro('')
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (sessionError || !accessToken) throw new Error('Sua sessão expirou. Entre novamente para consultar o estoque mínimo adesivado.')
      const resultado = await carregarIndicadoresEstoqueMinimoRebobinadeira({ data: { accessToken } })
      setRegistros((resultado.registros ?? []) as RebobinadeiraEstoqueMinimoRow[])
      const ajustesData = resultado.produtos ?? []
      setAjustes(Object.fromEntries(ajustesData.map((produto) => [produto.codigo, Number(produto.ajuste_estoque_percentual ?? 0)])))
      setAlertasDesativados(ajustesData.filter((produto) => produto.alerta_estoque_baixo_ativo === false).map((produto) => chaveAlertaEstoque(produto.descricao)))
      setLeadTimes({})
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Erro inesperado ao consultar os parâmetros.'
      setErro(mensagem)
      toast.error('Não foi possível carregar os indicadores da Rebobinadeira.', { description: mensagem })
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }, [])

  React.useEffect(() => {
    void carregar()
  }, [carregar])

  async function alternarAlertaEstoque(codigo: string, descricao: string) {
    const chave = chaveAlertaEstoque(descricao)
    const estavaDesativado = alertasDesativados.includes(chave)
    const novoAtivo = estavaDesativado
    setAlertasDesativados((atuais) => novoAtivo ? atuais.filter((item) => item !== chave) : [...atuais, chave])
    const { error } = await supabase.schema('rebobinadeira').from('produtos_jumbo')
      .update({ alerta_estoque_baixo_ativo: novoAtivo }).eq('codigo', codigo)
    if (error) {
      setAlertasDesativados((atuais) => estavaDesativado ? [...atuais, chave] : atuais.filter((item) => item !== chave))
      toast.error('Não foi possível salvar a preferência de alerta.', { description: error.message })
    } else {
      toast.success(novoAtivo ? 'Aviso de estoque baixo ativado.' : 'Aviso de estoque baixo desativado.')
    }
  }

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


  async function salvarAjuste(codigo: string, valor: string) {
    const percentual = Number(valor)
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 300) {
      toast.error('O aumento deve ficar entre 0% e 300%.')
      return
    }
    setAjustes((estado) => ({ ...estado, [codigo]: percentual }))
    const { error } = await supabase.schema('rebobinadeira').from('produtos_jumbo').update({ ajuste_estoque_percentual: percentual }).eq('codigo', codigo)
    if (error) {
      toast.error('Não foi possível salvar o aumento do estoque mínimo adesivado.', { description: error.message })
      await carregar(true)
    } else {
      toast.success('Aumento do estoque mínimo adesivado salvo.')
    }
  }

  const filtrados = registros.filter((item) => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    return !termo || [item.descricao, item.material, item.cor, item.tipo_produto]
      .some((valor) => valor?.toLocaleLowerCase('pt-BR').includes(termo))
  })

  const multiplicador = (item: RebobinadeiraEstoqueMinimoRow) => 1 + (ajustes[item.codigo] ?? 0) / 100
  const totalJumbos = filtrados.reduce((total, item) => total + Math.ceil(Number(item.estoque_minimo_jumbos || 0) * multiplicador(item)), 0)
  const totalKg = filtrados.reduce((total, item) => total + Number(item.estoque_minimo_kg || 0) * multiplicador(item), 0)
  const totalMetros = filtrados.reduce((total, item) => total + Number(item.estoque_minimo_m || 0) * multiplicador(item), 0)

  return (
    <div className="min-h-screen">
      {!embedded && <header className="sticky top-0 z-30 border-b border-[#e2e8f0] bg-white">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-3 px-7 pt-[18px] pb-4">
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
          <nav aria-label="Menus da Rebobinadeira" className="grid grid-cols-2 gap-2 border-t border-border pt-3 pb-0 sm:flex sm:flex-wrap">
            <button type="button" onClick={onOpenCadastro} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-[#c91d26] px-3 text-center text-xs font-semibold text-white whitespace-nowrap hover:bg-[#e3262e] sm:gap-2 sm:px-4 sm:text-sm">
              <PackageCheck className="size-4" /> Cadastrar produção
            </button>
            <button type="button" onClick={onOpenHistorico} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-[#c91d26] px-3 text-center text-xs font-semibold text-white whitespace-nowrap hover:bg-[#e3262e] sm:gap-2 sm:px-4 sm:text-sm">
              <History className="size-4" /> Histórico de produção
            </button>
            <span aria-current="page" className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-[#e3262e] px-3 text-center text-xs font-semibold text-white whitespace-nowrap shadow-sm sm:gap-2 sm:px-4 sm:text-sm">
              <ChartNoAxesCombined className="size-4" /> Indicadores
            </span>
            <button type="button" onClick={onOpenLixeira} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-[#c91d26] px-3 text-center text-xs font-semibold text-white whitespace-nowrap hover:bg-[#e3262e] sm:gap-2 sm:px-4 sm:text-sm">
              <Trash2 className="size-4" /> Lixeira
            </button>
          </nav>
          <nav aria-label="Submenus de Indicadores" className="flex flex-wrap items-center gap-2 pl-3">
            {onOpenEstoqueAtual && <button type="button" onClick={onOpenEstoqueAtual} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#e3262e] bg-white px-3 text-sm font-medium text-[#c91d26] transition hover:bg-red-50"><PackageCheck className="size-4" /> Estoque Atual Adesivado</button>}
            <span aria-current="page" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#e3262e]/30 bg-[#e3262e]/10 px-3 text-sm font-medium text-[#9f1720]"><PackageCheck className="size-4" /> Estoque Mínimo Adesivado</span>
          </nav>
        </div>
      </header>}
      {!embedded && <div className="h-3 w-full bg-[#4b4642]" />}

      <main className={embedded ? "mx-auto max-w-[96rem] space-y-6 px-1 py-2 sm:px-2" : "mx-auto w-full max-w-[96rem] space-y-4 rounded-2xl bg-white p-3 sm:p-4"}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Indicadores / Estoque Mínimo Adesivado</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Comparativo de estoque mínimo adesivado</h2>
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
                <thead className="sticky top-0 z-20 bg-muted text-left text-xs text-muted-foreground shadow-sm">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Produto</th>
                    <th className="px-4 py-3 font-semibold">Consumo médio kg/mês</th>
                    <th className="px-4 py-3 font-semibold">Lead time</th>
                    {isDeveloper && <th className="px-4 py-3 font-semibold">Aumento do mínimo</th>}
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
                        {isDeveloper && <td className="px-4 py-3">
                            <select aria-label={`Aumento do estoque mínimo adesivado de ${item.descricao}`} value={String(ajustes[item.codigo] ?? 0)} onChange={(event) => void salvarAjuste(item.codigo, event.target.value)} className="h-9 min-w-24 rounded-md border border-input bg-background px-2 text-sm">
                              {[0, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300].map((percentual) => <option key={percentual} value={percentual}>{percentual}%</option>)}
                            </select>
                          </td>}
                        <td className="px-4 py-3 tabular-nums font-medium">
                          {item.lead_time_dias == null
                            ? 'Lead time não definido'
                            : item.peso_medio_jumbo_kg <= 0
                              ? 'Aguardando histórico'
                              : `${formatar(item.estoque_minimo_kg * multiplicador(item), true)} kg`}
                        </td>
                        <td className="px-4 py-3 tabular-nums font-semibold">{formatar(Math.ceil(item.estoque_minimo_jumbos * multiplicador(item)))} un.</td>
                        <td className="px-4 py-3 tabular-nums">{formatar(item.consumo_semanal_m, true)} m</td>
                        <td className="px-4 py-3 tabular-nums font-semibold">
                          {item.metragem_media_jumbo_m <= 0
                            ? 'Aguardando histórico'
                            : `${formatar(item.estoque_minimo_m * multiplicador(item))} m`}
                        </td>
                        {isDeveloper && (
                          <>
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
                              <button type="button" aria-label={`${alertasDesativados.includes(chaveAlertaEstoque(item.descricao)) ? 'Ativar' : 'Desativar'} aviso de estoque baixo de ${item.descricao}`} title={alertasDesativados.includes(chaveAlertaEstoque(item.descricao)) ? 'Ativar aviso de estoque baixo' : 'Desativar aviso de estoque baixo'} onClick={() => void alternarAlertaEstoque(item.codigo, item.descricao)} className={`inline-flex size-9 items-center justify-center rounded-md border transition hover:brightness-95 ${alertasDesativados.includes(chaveAlertaEstoque(item.descricao)) ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-border bg-background text-muted-foreground hover:bg-accent'}`}>
                                {alertasDesativados.includes(chaveAlertaEstoque(item.descricao)) ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                              </button>
                            </div>
                          </td>
                          
                          </>
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
          Peso: consumo dos últimos 90 dias ÷ 3 meses ÷ 22 dias úteis, multiplicado pelo lead time do produto; a quantidade de jumbos é arredondada para cima e respeita o piso mínimo. Metragem: soma móvel dos jumbos consumidos ÷ 13 semanas × 1,5. A metragem usada é a metragem única efetivamente produzida/consumida (metragem_unica_m), sem duplicar bobinas; refilo e perdas ficam fora do consumo. O aumento percentual é aplicado sobre os mínimos calculados por produto.
        </p>
      </main>
    </div>
  )
}

function ScaleIcon() {
  return <span className="inline-flex size-4 items-center justify-center text-xs font-bold">kg</span>
}
