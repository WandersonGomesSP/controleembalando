import * as React from 'react'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  History,
  LoaderCircle,
  Package,
  RotateCcw,
  Save,
  Trash2,
  Warehouse,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type {
  BobinaEstoqueVirgemHistoricoRow,
  BobinaEstoqueVirgemLixeiraRow,
  BobinaEstoqueVirgemRow,
  EstoqueMinimoVirgemRow,
} from '@/lib/database.types'
import {
  listVirginStock,
  listVirginStockHistory,
  listVirginStockTrash,
  moveVirginStockToTrash,
  permanentlyDeleteVirginStockBobina,
  restoreVirginStockBobina,
  updateVirginStockBobina,
} from '@/lib/virgin-stock.functions'

type Aba = 'estoque' | 'historico' | 'lixeira'
type Rascunho = {
  codigo: string
  medida_texto: string
  medida: string
  peso_kg: string
  metragem_m: string
  nf: string
  data_entrada: string
  fornecedor: string
  localizacao: 'ESTOQUE' | 'GALPAO_MARIO_COVAS'
  cor: string
  linha: string
  cliente: string
  observacoes: string
}

const LOCALIZACOES = [
  { value: 'ESTOQUE', label: 'Estoque' },
  { value: 'GALPAO_MARIO_COVAS', label: 'Mário Covas' },
] as const

function formatarKg(valor: number | null | undefined) {
  return `${Number(valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
}

function formatarNumero(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

function formatarData(valor: string | null | undefined) {
  if (!valor) return '—'
  const [ano, mes, dia] = valor.slice(0, 10).split('-')
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : valor
}

function referenciaDaBobina(row: BobinaEstoqueVirgemRow) {
  if (row.categoria.toUpperCase() === 'PEBD') return 'PEBD'
  if (row.medida_texto.trim()) return row.medida_texto.trim()
  return row.medida === null ? 'Sem medida' : Number(row.medida).toFixed(2)
}

function rascunhoDaBobina(row: BobinaEstoqueVirgemRow): Rascunho {
  return {
    codigo: row.codigo ?? '',
    medida_texto: row.medida_texto ?? '',
    medida: row.medida === null ? '' : String(row.medida),
    peso_kg: row.peso_kg === null ? '' : String(row.peso_kg),
    metragem_m: row.metragem_m === null ? '' : String(row.metragem_m),
    nf: row.nf ?? '',
    data_entrada: row.data_entrada ?? '',
    fornecedor: row.fornecedor ?? '',
    localizacao: row.localizacao ?? 'ESTOQUE',
    cor: row.cor ?? '',
    linha: row.linha ?? '',
    cliente: row.cliente ?? '',
    observacoes: row.observacoes ?? '',
  }
}

function numeroOuNulo(valor: string) {
  if (!valor.trim()) return null
  const numero = Number(valor.replace(',', '.'))
  return Number.isFinite(numero) ? numero : null
}

function resumoHistorico(item: BobinaEstoqueVirgemHistoricoRow) {
  const atual = item.dados_novos ?? item.dados_anteriores ?? {}
  const peso = atual.peso_kg
  const medida = atual.medida_texto
  return [
    typeof medida === 'string' ? medida : '',
    typeof peso === 'number' || typeof peso === 'string' ? formatarKg(Number(peso)) : '',
  ].filter(Boolean).join(' · ')
}

export function EstoqueBoppVirgemTab() {
  const [aba, setAba] = React.useState<Aba>('estoque')
  const [bobinas, setBobinas] = React.useState<BobinaEstoqueVirgemRow[]>([])
  const [dashboard, setDashboard] = React.useState<EstoqueMinimoVirgemRow[]>([])
  const [historico, setHistorico] = React.useState<BobinaEstoqueVirgemHistoricoRow[]>([])
  const [lixeira, setLixeira] = React.useState<BobinaEstoqueVirgemLixeiraRow[]>([])
  const [medidaAberta, setMedidaAberta] = React.useState<string | null>(null)
  const [bobinaAberta, setBobinaAberta] = React.useState<string | null>(null)
  const [selecionadas, setSelecionadas] = React.useState<Set<string>>(new Set())
  const [rascunhos, setRascunhos] = React.useState<Record<string, Rascunho>>({})
  const [accessToken, setAccessToken] = React.useState('')
  const [carregando, setCarregando] = React.useState(true)
  const [atualizando, setAtualizando] = React.useState(false)
  const [salvandoId, setSalvandoId] = React.useState<string | null>(null)
  const [excluindo, setExcluindo] = React.useState(false)

  const carregarEstoque = React.useCallback(async (token: string) => {
    const result = await listVirginStock({ data: { accessToken: token } })
    setBobinas(result.bobinas as BobinaEstoqueVirgemRow[])
    setDashboard(result.dashboard as EstoqueMinimoVirgemRow[])
  }, [])

  const iniciar = React.useCallback(async () => {
    setCarregando(true)
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.')
      setAccessToken(data.session.access_token)
      await carregarEstoque(data.session.access_token)
    } catch (error) {
      toast.error('Não foi possível carregar o estoque de BOPP virgem.', {
        description: error instanceof Error ? error.message : 'Verifique a conexão.',
      })
    } finally {
      setCarregando(false)
    }
  }, [carregarEstoque])

  React.useEffect(() => { void iniciar() }, [iniciar])

  async function atualizar() {
    if (!accessToken) return
    setAtualizando(true)
    try {
      if (aba === 'estoque') await carregarEstoque(accessToken)
      if (aba === 'historico') {
        const rows = await listVirginStockHistory({ data: { accessToken } })
        setHistorico(rows as BobinaEstoqueVirgemHistoricoRow[])
      }
      if (aba === 'lixeira') {
        const rows = await listVirginStockTrash({ data: { accessToken } })
        setLixeira(rows as BobinaEstoqueVirgemLixeiraRow[])
      }
    } catch (error) {
      toast.error('Não foi possível atualizar esta tela.', {
        description: error instanceof Error ? error.message : 'Verifique a conexão.',
      })
    } finally {
      setAtualizando(false)
    }
  }

  React.useEffect(() => {
    if (!accessToken || aba === 'estoque') return
    void atualizar()
    // A troca de aba deve carregar somente o conteúdo da aba selecionada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, accessToken])

  function alternarSelecao(id: string) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual)
      if (proxima.has(id)) proxima.delete(id)
      else proxima.add(id)
      return proxima
    })
  }

  function alternarMedida(referencia: string) {
    setMedidaAberta((atual) => atual === referencia ? null : referencia)
    setBobinaAberta(null)
  }

  function abrirBobina(row: BobinaEstoqueVirgemRow) {
    setBobinaAberta((atual) => atual === row.id ? null : row.id)
    setRascunhos((atual) => ({ ...atual, [row.id]: rascunhoDaBobina(row) }))
  }

  function atualizarRascunho(id: string, campo: keyof Rascunho, valor: string) {
    setRascunhos((atual) => ({
      ...atual,
      [id]: { ...atual[id]!, [campo]: valor },
    }))
  }

  async function salvarBobina(id: string) {
    const draft = rascunhos[id]
    if (!draft) return
    if (!draft.medida_texto.trim()) return toast.error('Informe a medida da bobina.')
    if (draft.peso_kg.trim() && !(Number(draft.peso_kg.replace(',', '.')) > 0)) {
      return toast.error('O peso deve ser maior que zero.')
    }
    setSalvandoId(id)
    try {
      await updateVirginStockBobina({
        data: {
          accessToken,
          id,
          changes: {
            codigo: draft.codigo.trim() || null,
            medida_texto: draft.medida_texto.trim(),
            medida: numeroOuNulo(draft.medida),
            peso_kg: numeroOuNulo(draft.peso_kg),
            metragem_m: numeroOuNulo(draft.metragem_m),
            nf: draft.nf.trim() || null,
            data_entrada: draft.data_entrada || null,
            fornecedor: draft.fornecedor.trim() || null,
            localizacao: draft.localizacao,
            cor: draft.cor.trim() || null,
            linha: draft.linha.trim() || null,
            cliente: draft.cliente.trim() || null,
            observacoes: draft.observacoes.trim() || null,
          },
        },
      })
      toast.success('Bobina atualizada e registrada no histórico.')
      await carregarEstoque(accessToken)
      setBobinaAberta(null)
    } catch (error) {
      toast.error('Não foi possível salvar a bobina.', {
        description: error instanceof Error ? error.message : 'Verifique os dados.',
      })
    } finally {
      setSalvandoId(null)
    }
  }

  async function excluirSelecionadas() {
    if (!selecionadas.size || !accessToken) return
    if (!window.confirm(`Mover ${selecionadas.size} bobina(s) para a lixeira?`)) return
    setExcluindo(true)
    try {
      const result = await moveVirginStockToTrash({
        data: { accessToken, ids: Array.from(selecionadas) },
      })
      toast.success(`${result.removed} bobina(s) movida(s) para a lixeira.`)
      setSelecionadas(new Set())
      setBobinaAberta(null)
      await carregarEstoque(accessToken)
    } catch (error) {
      toast.error('Não foi possível excluir as bobinas selecionadas.', {
        description: error instanceof Error ? error.message : 'Verifique a conexão.',
      })
    } finally {
      setExcluindo(false)
    }
  }

  async function restaurar(item: BobinaEstoqueVirgemLixeiraRow) {
    try {
      await restoreVirginStockBobina({ data: { accessToken, trashId: item.id } })
      toast.success(`Bobina ${item.codigo ?? ''} restaurada.`)
      await atualizar()
    } catch (error) {
      toast.error('Não foi possível restaurar a bobina.', {
        description: error instanceof Error ? error.message : 'Verifique a conexão.',
      })
    }
  }

  async function excluirDefinitivamente(item: BobinaEstoqueVirgemLixeiraRow) {
    if (!window.confirm(`Excluir definitivamente a bobina ${item.codigo ?? item.id}?`)) return
    try {
      await permanentlyDeleteVirginStockBobina({ data: { accessToken, trashId: item.id } })
      toast.success('Bobina excluída definitivamente.')
      await atualizar()
    } catch (error) {
      toast.error('Não foi possível excluir definitivamente.', {
        description: error instanceof Error ? error.message : 'Verifique a conexão.',
      })
    }
  }

  const pesoTotal = dashboard.reduce((total, item) => total + Number(item.peso_estoque_kg ?? 0), 0)
  const quantidadeTotal = dashboard.reduce((total, item) => total + Number(item.bobinas_estoque ?? 0), 0)

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Matéria-prima · BOPP</p>
          <h2 className="mt-1 text-xl font-semibold">Estoque de BOPP Virgem</h2>
          <p className="mt-1 text-sm text-muted-foreground">Saldo por medida, bobinas individuais e histórico de movimentações.</p>
        </div>
        <button type="button" onClick={() => void atualizar()} disabled={carregando || atualizando} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-black hover:bg-gray-50 disabled:opacity-50">
          <LoaderCircle className={`size-4 ${atualizando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-border pb-3" aria-label="Seções do estoque de BOPP virgem">
        <button type="button" onClick={() => setAba('estoque')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${aba === 'estoque' ? 'bg-primary text-primary-foreground' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
          <Package className="mr-2 inline size-4" /> Estoque por medida
        </button>
        <button type="button" onClick={() => setAba('historico')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${aba === 'historico' ? 'bg-primary text-primary-foreground' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
          <History className="mr-2 inline size-4" /> Histórico
        </button>
        <button type="button" onClick={() => setAba('lixeira')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${aba === 'lixeira' ? 'bg-primary text-primary-foreground' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
          <Trash2 className="mr-2 inline size-4" /> Lixeira
        </button>
      </nav>

      {carregando ? (
        <div className="rounded-xl border border-border bg-white p-10 text-center text-sm text-gray-600">Carregando estoque de BOPP virgem...</div>
      ) : aba === 'estoque' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-white p-4 text-black shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Peso total em estoque</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{formatarKg(pesoTotal)}</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-4 text-black shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quantidade total de bobinas</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{formatarNumero(quantidadeTotal)}</p>
            </div>
          </div>

          {selecionadas.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-black">
              <p className="text-sm font-semibold">{selecionadas.size} bobina(s) selecionada(s), inclusive entre medidas.</p>
              <button type="button" onClick={() => void excluirSelecionadas()} disabled={excluindo} className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                <Trash2 className="size-4" /> {excluindo ? 'Excluindo...' : 'Excluir selecionadas'}
              </button>
            </div>
          )}

          {dashboard.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-white p-10 text-center">
              <Package className="mx-auto size-8 text-gray-400" />
              <p className="mt-3 font-semibold text-gray-800">Nenhuma medida encontrada</p>
              <p className="mt-1 text-sm text-gray-500">Assim que importar o CSV, as medidas e os indicadores aparecerão aqui.</p>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {dashboard.map((item) => {
                const minimoKg = item.minimo_calibrado_kg ?? item.minimo_calculado_kg
                const minimoQtd = item.minimo_calibrado_bobinas ??
                  (item.peso_medio_bobina_kg && minimoKg > 0
                    ? Math.ceil(minimoKg / item.peso_medio_bobina_kg)
                    : null)
                const aberto = medidaAberta === item.referencia
                const estoqueKg = Number(item.peso_estoque_kg ?? 0)
                const minimoValido = minimoKg !== null && Number(minimoKg) > 0
                const percentual = minimoValido ? ((estoqueKg - Number(minimoKg)) / Number(minimoKg)) * 100 : null
                const statusDashboard = !minimoValido
                  ? 'ATENÇÃO'
                  : percentual! < 0
                    ? 'COMPRAR'
                    : percentual! <= 20
                      ? 'ATENÇÃO'
                      : 'OK'
                const rows = bobinas.filter((row) => referenciaDaBobina(row) === item.referencia)
                return (
                  <article key={item.referencia} className="overflow-hidden rounded-xl border border-border bg-white text-black shadow-sm">
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Medida</p>
                          <h3 className="mt-1 text-xl font-bold">{item.referencia}</h3>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusDashboard === 'COMPRAR' ? 'bg-red-100 text-red-800' : statusDashboard === 'ATENÇÃO' ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-800'}`}>
                            {statusDashboard}
                          </span>
                          {percentual !== null && (
                            <span className={`text-xs font-bold tabular-nums ${percentual < 0 ? 'text-red-700' : percentual <= 20 ? 'text-amber-700' : 'text-green-700'}`}>
                              {percentual >= 0 ? '+' : ''}{percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                            </span>
                          )}
                          {!minimoValido && <span className="text-[11px] text-amber-800">Mínimo não calibrado</span>}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-gray-50 p-3">
                          <p className="text-xs text-gray-500">Peso total</p>
                          <p className="mt-1 text-lg font-bold tabular-nums">{formatarKg(item.peso_estoque_kg)}</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3">
                          <p className="text-xs text-gray-500">Quantidade total</p>
                          <p className="mt-1 text-lg font-bold tabular-nums">{formatarNumero(item.bobinas_estoque)} bobinas</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3">
                          <p className="text-xs text-gray-500">Peso mínimo</p>
                          <p className="mt-1 text-lg font-bold tabular-nums">{minimoKg > 0 ? formatarKg(minimoKg) : '—'}</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3">
                          <p className="text-xs text-gray-500">Quantidade mínima</p>
                          <p className="mt-1 text-lg font-bold tabular-nums">{minimoQtd === null ? '—' : `${formatarNumero(minimoQtd)} bobinas`}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-xs text-gray-500">{rows.length} bobina(s) disponível(is) para detalhar</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {statusDashboard === 'COMPRAR' && (
                            <button type="button" onClick={() => alternarMedida(item.referencia)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-bold text-white hover:bg-red-700">
                              Comprar
                            </button>
                          )}
                          <button type="button" onClick={() => alternarMedida(item.referencia)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-semibold hover:bg-gray-50">
                            {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            {aberto ? 'Fechar detalhes' : 'Detalhes'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {aberto && (
                      <div className="border-t border-gray-200 bg-gray-50 p-3 sm:p-4">
                        {rows.length === 0 ? (
                          <p className="py-5 text-center text-sm text-gray-500">Nenhuma bobina cadastrada nesta medida.</p>
                        ) : (
                          <>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                                <input type="checkbox" checked={rows.length > 0 && rows.every((row) => selecionadas.has(row.id))} onChange={(event) => {
                                  const checked = event.target.checked
                                  setSelecionadas((atual) => {
                                    const proxima = new Set(atual)
                                    for (const row of rows) checked ? proxima.add(row.id) : proxima.delete(row.id)
                                    return proxima
                                  })
                                }} />
                                Selecionar todas desta medida
                              </label>

                            </div>
                            <div className="space-y-2">
                              {rows.map((row) => {
                                const expandida = bobinaAberta === row.id
                                const draft = rascunhos[row.id] ?? rascunhoDaBobina(row)
                                return (
                                  <article key={row.id} className="rounded-lg border border-gray-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="flex min-w-0 items-start gap-2">
                                        <input type="checkbox" aria-label={`Selecionar bobina ${row.codigo ?? row.id}`} checked={selecionadas.has(row.id)} onChange={() => alternarSelecao(row.id)} className="mt-1" />
                                        <div className="min-w-0">
                                          <p className="font-mono text-sm font-bold">{row.codigo || 'Sem código'}</p>
                                          <p className="mt-1 text-xs text-gray-600">{formatarKg(row.peso_kg)} · NF {row.nf || '—'} · {formatarData(row.data_entrada)}</p>
                                          <p className="mt-1 text-xs text-gray-500">{row.fornecedor || 'Fornecedor não informado'} · {row.localizacao === 'GALPAO_MARIO_COVAS' ? 'Mário Covas' : 'Estoque'}</p>
                                        </div>
                                      </div>
                                      <button type="button" onClick={() => abrirBobina(row)} aria-expanded={expandida} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-semibold hover:bg-gray-50">
                                        {expandida ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                        {expandida ? 'Recolher' : 'Expandir'}
                                      </button>
                                    </div>
                                    {expandida && (
                                      <form onSubmit={(event) => { event.preventDefault(); void salvarBobina(row.id) }} className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">Código<input value={draft.codigo} onChange={(e) => atualizarRascunho(row.id, 'codigo', e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" /></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">Medida<input value={draft.medida_texto} onChange={(e) => atualizarRascunho(row.id, 'medida_texto', e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" required /></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">Peso (kg)<input inputMode="decimal" value={draft.peso_kg} onChange={(e) => atualizarRascunho(row.id, 'peso_kg', e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" /></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">NF<input value={draft.nf} onChange={(e) => atualizarRascunho(row.id, 'nf', e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" /></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">Data de entrada<input type="date" value={draft.data_entrada} onChange={(e) => atualizarRascunho(row.id, 'data_entrada', e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" /></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">Fornecedor<input value={draft.fornecedor} onChange={(e) => atualizarRascunho(row.id, 'fornecedor', e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" /></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">Localização<select value={draft.localizacao} onChange={(e) => atualizarRascunho(row.id, 'localizacao', e.target.value as Rascunho['localizacao'])} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black">{LOCALIZACOES.map((local) => <option key={local.value} value={local.value}>{local.label}</option>)}</select></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">Metragem (m)<input inputMode="decimal" value={draft.metragem_m} onChange={(e) => atualizarRascunho(row.id, 'metragem_m', e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" /></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">Medida numérica<input inputMode="decimal" value={draft.medida} onChange={(e) => atualizarRascunho(row.id, 'medida', e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" /></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">Cor<input value={draft.cor} onChange={(e) => atualizarRascunho(row.id, 'cor', e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" /></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">Linha<input value={draft.linha} onChange={(e) => atualizarRascunho(row.id, 'linha', e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" /></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600">Cliente<input value={draft.cliente} onChange={(e) => atualizarRascunho(row.id, 'cliente', e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" /></label>
                                        <label className="grid gap-1 text-xs font-semibold text-gray-600 sm:col-span-2 lg:col-span-3">Observações<textarea rows={2} value={draft.observacoes} onChange={(e) => atualizarRascunho(row.id, 'observacoes', e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-black" /></label>
                                        <div className="flex justify-end sm:col-span-2 lg:col-span-3">
                                          <button type="submit" disabled={salvandoId === row.id} className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                                            <Save className="size-4" /> {salvandoId === row.id ? 'Salvando...' : 'Salvar alterações'}
                                          </button>
                                        </div>
                                      </form>
                                    )}
                                  </article>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </>
      ) : aba === 'historico' ? (
        <div className="overflow-hidden rounded-xl border border-border bg-white text-black">
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 font-semibold"><History className="size-4" /> Histórico de bobinas</div>
          {historico.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">Histórico criado e pronto. As entradas, edições e exclusões aparecerão aqui após a importação e movimentação das bobinas.</p> : (
            <div className="divide-y divide-gray-100">
              {historico.map((item) => (
                <article key={item.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr_1fr]">
                  <p className="text-xs text-gray-500">{new Date(item.ocorrido_em).toLocaleString('pt-BR')}</p>
                  <div><p className="text-sm font-bold">{item.acao} · {item.codigo || 'Sem código'}</p><p className="text-xs text-gray-500">{item.ator_email || 'Usuário do sistema'}</p></div>
                  <p className="text-xs text-gray-600">{resumoHistorico(item)}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-white text-black">
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 font-semibold"><Archive className="size-4" /> Lixeira de bobinas</div>
          {lixeira.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">A lixeira está vazia.</p> : (
            <div className="divide-y divide-gray-100">
              {lixeira.map((item) => (
                <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div><p className="font-mono text-sm font-bold">{item.codigo || 'Sem código'}</p><p className="mt-1 text-xs text-gray-500">{item.medida_texto} · {formatarKg(item.dados.peso_kg)} · Excluída em {new Date(item.excluida_em).toLocaleString('pt-BR')}</p></div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void restaurar(item)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-semibold hover:bg-gray-50"><RotateCcw className="size-4" /> Restaurar</button>
                    <button type="button" onClick={() => void excluirDefinitivamente(item)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-300 px-3 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="size-4" /> Excluir definitivo</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Warehouse className="size-4" /> Localizações disponíveis: Estoque e Mário Covas.</div>
    </section>
  )
}
