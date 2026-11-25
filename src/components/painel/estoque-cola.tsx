import * as React from 'react'
import { ArrowDownToLine, ArrowUpFromLine, History, Package, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Field, Panel, PrimaryButton, TextInput } from '@/components/painel/fields'
import { supabase } from '@/lib/supabase'
import { listarControleCola, registrarEntradaCola, retirarContainersCola, atualizarContainersCola, excluirContainersCola, atualizarEntradasCola, atualizarLeadTimeConsumoCola } from '@/lib/admin.functions'

type Entrada = {
  id: number
  data_chegada: string
  nf: string
  produto: string
  lote: string
  quantidade_containers: number
  peso_por_container_kg: number
  valor_por_container: number
  valor_por_kg: number
  fornecedor: string
}
type Saldo = Entrada & { containers_disponiveis: number; localizacao: 'ESTOQUE' | 'GALPAO_MARIO_COVAS' }
type Historico = {
  numero_bobina: string
  codigo_container: string
  data_producao: string
  cola_liquida_kg: number
  lote_cola: string | null
  fornecedor_cola: string | null
  status_container: string | null
}
type Container = {
  codigo: string
  status: string
  entrada_id: number | null
  enviado_em: string | null
  entrada: { data_chegada: string; nf: string; produto: string; lote: string; peso_por_container_kg: number; valor_por_container: number; fornecedor: string; localizacao: 'ESTOQUE' | 'GALPAO_MARIO_COVAS' } | null
}
type Indicadores = {
  bobinas_90_dias: number
  consumo_90_dias_kg: number
  consumo_movel_mensal_kg: number
  consumo_diario_kg: number
  estoque_minimo_25_dias_kg: number
  cola_disponivel_kg: number
  capacidade_producao_bobinas: number
  lead_time_dias: number
  consumo_medio_bobina_kg: number
}
type HistoricoEnvioBahia = {
  id: number
  entrada_id: number | null
  data_entrada: string
  nf: string
  produto: string
  lote: string
  codigo_container: string
  peso_kg: number
  valor_por_container: number | null
  valor_por_kg: number
  fornecedor: string
  data_envio: string
  mes: string
  status: string
  origem: string
}
type Dados = { entradas: Entrada[]; saldo: Saldo[]; historico: Historico[]; containers: Container[]; indicadores: Indicadores | null; envios: HistoricoEnvioBahia[] }
type Aba = 'estoque' | 'entrada' | 'retirada' | 'historico' | 'envios'

const hoje = () => new Date().toLocaleDateString('en-CA')
const dinheiro = (valor: number) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const kg = (valor: number) => `${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`

export function EstoqueColaCobrideira() {
  const [aba, setAba] = React.useState<Aba>('estoque')
  const [dados, setDados] = React.useState<Dados>({ entradas: [], saldo: [], historico: [], containers: [], indicadores: null, envios: [] })
  const [carregando, setCarregando] = React.useState(false)
  const [salvando, setSalvando] = React.useState(false)
  const [form, setForm] = React.useState({
    data_chegada: hoje(), nf: '', produto: 'PS-2001', lote: '',
    quantidade_containers: '1', peso_por_container_kg: '1000',
    valor_por_container: '0', fornecedor: 'DOW', observacoes: '',
  })
  const [codigos, setCodigos] = React.useState('')
  const [abaEstoque, setAbaEstoque] = React.useState<'lotes' | 'detalhes'>('lotes')
  const [loteExpandido, setLoteExpandido] = React.useState<number | null>(null)
  const [leadTimeDias, setLeadTimeDias] = React.useState('25')
  const [salvandoLeadTime, setSalvandoLeadTime] = React.useState(false)
  const [ordemLotes, setOrdemLotes] = React.useState<'desc' | 'asc'>('desc')
  const [ordemDetalhes, setOrdemDetalhes] = React.useState<'desc' | 'asc'>('desc')
  const [ordemConsumo, setOrdemConsumo] = React.useState<'desc' | 'asc'>('desc')
  const [ordemEnvios, setOrdemEnvios] = React.useState<'desc' | 'asc'>('desc')
  const [detalhesBAAberto, setDetalhesBAAberto] = React.useState(false)
  const [selecionados, setSelecionados] = React.useState<string[]>([])
  const [editandoCodigo, setEditandoCodigo] = React.useState<string | null>(null)
  const [codigoEditado, setCodigoEditado] = React.useState('')
  const [localizacaoEditada, setLocalizacaoEditada] = React.useState<'ESTOQUE' | 'GALPAO_MARIO_COVAS' | ''>('')
  const [dataEntradaEditada, setDataEntradaEditada] = React.useState('')
  const [nfEditada, setNfEditada] = React.useState('')
  const [produtoEditado, setProdutoEditado] = React.useState('')
  const [loteEditado, setLoteEditado] = React.useState('')
  const [pesoEntradaEditado, setPesoEntradaEditado] = React.useState('')
  const [valorEntradaEditado, setValorEntradaEditado] = React.useState('')
  const [fornecedorEditado, setFornecedorEditado] = React.useState('')
  const [editandoEmLote, setEditandoEmLote] = React.useState(false)
  const [salvandoEdicao, setSalvandoEdicao] = React.useState(false)

  const carregar = React.useCallback(async () => {
    setCarregando(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.')
      const resultado = await listarControleCola({ data: { accessToken: sessionData.session.access_token } })
      setDados(resultado as Dados)
      setLeadTimeDias(String((resultado as Dados).indicadores?.lead_time_dias ?? 25))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o estoque de cola.')
    } finally {
      setCarregando(false)
    }
  }, [])

  React.useEffect(() => { void carregar() }, [carregar])

  const atualizar = (campo: keyof typeof form, valor: string) => setForm((atual) => ({ ...atual, [campo]: valor }))
  const numero = (valor: string) => { const texto = valor.trim(); return Number(texto.includes(',') && texto.includes('.') ? texto.replace(/\./g, '').replace(',', '.') : texto.replace(',', '.')) }
  const valorKg = numero(form.peso_por_container_kg) > 0
    ? numero(form.valor_por_container) / numero(form.peso_por_container_kg)
    : 0
  const totalContainers = dados.saldo.reduce((soma, item) => soma + Number(item.containers_disponiveis || 0), 0)
  const totalKg = dados.saldo.reduce((soma, item) => soma + Number(item.containers_disponiveis || 0) * Number(item.peso_por_container_kg || 0), 0)
  const valorEstoqueAtual = dados.saldo.reduce((soma, item) => soma + Number(item.containers_disponiveis || 0) * Number(item.valor_por_container || 0), 0)
  const leadTimeAtual = Number(dados.indicadores?.lead_time_dias ?? leadTimeDias ?? 25)
  const consumoBAMensal = 16333.3333333333
  const consumoBADiario = consumoBAMensal / 30
  const minimoBA = consumoBADiario * leadTimeAtual
  const consumoSPMensal = Number(dados.indicadores?.consumo_movel_mensal_kg || 0)
  const consumoSPDiario = Number(dados.indicadores?.consumo_diario_kg || 0)
  const minimoSP = Number(dados.indicadores?.estoque_minimo_25_dias_kg || 0)
  const codigosInformados = [...new Set(codigos.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))]
  const saldoOrdenado = React.useMemo(() => [...dados.saldo].sort((a, b) =>
    ordemLotes === 'desc'
      ? b.data_chegada.localeCompare(a.data_chegada) || b.id - a.id
      : a.data_chegada.localeCompare(b.data_chegada) || a.id - b.id
  ), [dados.saldo, ordemLotes])
  const containersDisponiveis = React.useMemo(
    () => dados.containers.filter((item) => item.status === 'DISPONIVEL'),
    [dados.containers],
  )
  const containersOrdenados = React.useMemo(() => [...containersDisponiveis].sort((a, b) => {
    const dataA = a.entrada?.data_chegada || ''
    const dataB = b.entrada?.data_chegada || ''
    return ordemDetalhes === 'desc'
      ? dataB.localeCompare(dataA) || b.codigo.localeCompare(a.codigo)
      : dataA.localeCompare(dataB) || a.codigo.localeCompare(b.codigo)
  }), [containersDisponiveis, ordemDetalhes])
  const containersSelecionados = containersDisponiveis.filter((item) => selecionados.includes(item.codigo))
  const todosContainersSelecionados = containersDisponiveis.length > 0 && containersSelecionados.length === containersDisponiveis.length

  const historicoAgrupado = React.useMemo(() => {
    const mapa = new Map<string, { codigo: string; bobinas: number; cola: number; dataConsumo: string; lote: string; fornecedor: string; status: string }>()
    const containersPorCodigo = new Map(dados.containers.map((container) => [container.codigo, container]))
    for (const item of dados.historico) {
      const codigo = String(item.codigo_container || '').trim()
      if (!/^\d{8}$/.test(codigo)) continue
      const container = containersPorCodigo.get(codigo)
      const atual = mapa.get(codigo) ?? {
        codigo, bobinas: 0, cola: 0, dataConsumo: item.data_producao,
        lote: item.lote_cola || container?.entrada?.lote || '',
        fornecedor: item.fornecedor_cola || container?.entrada?.fornecedor || '',
        status: item.status_container || container?.status || 'HISTORICO_ANTERIOR',
      }
      atual.bobinas += 1
      atual.cola += Number(item.cola_liquida_kg || 0)
      if (item.data_producao > atual.dataConsumo) atual.dataConsumo = item.data_producao
      if (!atual.lote && item.lote_cola) atual.lote = item.lote_cola
      if (!atual.fornecedor && item.fornecedor_cola) atual.fornecedor = item.fornecedor_cola
      mapa.set(codigo, atual)
    }
    return [...mapa.values()].sort((a, b) =>
      ordemConsumo === 'desc'
        ? b.dataConsumo.localeCompare(a.dataConsumo) || a.codigo.localeCompare(b.codigo)
        : a.dataConsumo.localeCompare(b.dataConsumo) || a.codigo.localeCompare(b.codigo)
    )
  }, [dados.historico, dados.containers, ordemConsumo])

  const enviadosParaBahia = React.useMemo(() => [...dados.envios]
    .sort((a, b) => ordemEnvios === 'desc'
      ? b.data_envio.localeCompare(a.data_envio) || a.codigo_container.localeCompare(b.codigo_container)
      : a.data_envio.localeCompare(b.data_envio) || a.codigo_container.localeCompare(b.codigo_container)),
  [dados.envios, ordemEnvios])



  async function salvarEntrada(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const peso = numero(form.peso_por_container_kg)
    const valor = numero(form.valor_por_container)
    const quantidade = Number(form.quantidade_containers)
    if (!form.nf.trim() || !form.lote.trim() || !form.fornecedor.trim() || !Number.isFinite(quantidade) || quantidade < 1 || peso <= 0 || valor < 0) {
      toast.error('Confira NF, lote, fornecedor, quantidade, peso e valor da entrada.')
      return
    }
    setSalvando(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      const resultado = await registrarEntradaCola({ data: {
        accessToken, data_chegada: form.data_chegada, nf: form.nf.trim(), produto: form.produto.trim(),
        lote: form.lote.trim(), quantidade_containers: quantidade, peso_por_container_kg: peso,
        valor_por_container: valor, fornecedor: form.fornecedor.trim(), observacoes: form.observacoes.trim() || undefined,
      } })
      toast.success('Entrada registrada e códigos de containers gerados.', { description: resultado.codigos?.join(', ') })
      setForm((atual) => ({ ...atual, nf: '', lote: '', quantidade_containers: '1', valor_por_container: '0', observacoes: '' }))
      setAba('estoque')
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a entrada.')
    } finally {
      setSalvando(false)
    }
  }

  function abrirEdicaoContainer(container: Container) {
    setEditandoCodigo(container.codigo)
    setCodigoEditado(container.codigo)
    setLocalizacaoEditada(container.entrada?.localizacao || 'ESTOQUE')
    setDataEntradaEditada(container.entrada?.data_chegada || '')
    setNfEditada(container.entrada?.nf || '')
    setProdutoEditado(container.entrada?.produto || '')
    setLoteEditado(container.entrada?.lote || '')
    setPesoEntradaEditado(container.entrada?.peso_por_container_kg?.toString() || '')
    setValorEntradaEditado(container.entrada?.valor_por_container?.toString() || '')
    setFornecedorEditado(container.entrada?.fornecedor || '')
    setEditandoEmLote(false)
  }

  function abrirEdicaoEmLote() {
    setEditandoCodigo(null)
    setCodigoEditado('')
    setLocalizacaoEditada('')
    setDataEntradaEditada('')
    setNfEditada('')
    setProdutoEditado('')
    setLoteEditado('')
    setPesoEntradaEditado('')
    setValorEntradaEditado('')
    setFornecedorEditado('')
    setEditandoEmLote(true)
  }

  async function salvarEdicaoContainers() {
    const itensBase = editandoEmLote ? containersSelecionados : containersSelecionados.filter((item) => item.codigo === editandoCodigo)
    if (!itensBase.length) return
    setSalvandoEdicao(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      const mudouCodigo = !editandoEmLote && Boolean(codigoEditado.trim()) && codigoEditado.trim() !== editandoCodigo
      if (mudouCodigo) {
        await atualizarContainersCola({ data: {
          accessToken,
          itens: itensBase.map((item) => ({
            codigo_atual: item.codigo,
            codigo_novo: codigoEditado.trim(),
          })),
        } })
      }
      const atualizacoes: Record<string, string | number> = {}
      if (localizacaoEditada) atualizacoes.localizacao = localizacaoEditada
      if (dataEntradaEditada) atualizacoes.data_chegada = dataEntradaEditada
      if (nfEditada.trim()) atualizacoes.nf = nfEditada.trim()
      if (produtoEditado.trim()) atualizacoes.produto = produtoEditado.trim()
      if (loteEditado.trim()) atualizacoes.lote = loteEditado.trim()
      if (pesoEntradaEditado.trim()) atualizacoes.peso_por_container_kg = numero(pesoEntradaEditado)
      if (valorEntradaEditado.trim()) atualizacoes.valor_por_container = numero(valorEntradaEditado)
      if (fornecedorEditado.trim()) atualizacoes.fornecedor = fornecedorEditado.trim()
      if (Object.keys(atualizacoes).length) {
        const entradaIds = [...new Set(itensBase.map((item) => item.entrada_id).filter((id): id is number => id !== null))]
        if (!entradaIds.length) throw new Error('Os containers selecionados não possuem uma entrada vinculada para editar.')
        await atualizarEntradasCola({ data: { accessToken, entrada_ids: entradaIds, atualizacoes } })
      }
      toast.success(`${itensBase.length} container(s) atualizado(s).`)
      setEditandoCodigo(null)
      setEditandoEmLote(false)
      setSelecionados([])
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar os containers.')
    } finally {
      setSalvandoEdicao(false)
    }
  }

  async function excluirSelecionados() {
    const codigosDisponiveisSelecionados = containersSelecionados.map((item) => item.codigo)
    if (!codigosDisponiveisSelecionados.length) return
    if (!window.confirm(`Excluir ${codigosDisponiveisSelecionados.length} container(s) selecionado(s)?`)) return
    setSalvandoEdicao(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      const resultado = await excluirContainersCola({ data: { accessToken, codigos: codigosDisponiveisSelecionados } })
      toast.success(`${resultado.removidos.length} container(s) excluído(s).`)
      setSelecionados([])
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir os containers.')
    } finally {
      setSalvandoEdicao(false)
    }
  }

  async function salvarLeadTimeConsumo() {
    const valor = Number(leadTimeDias)
    if (!Number.isInteger(valor) || valor < 0 || valor > 365) {
      toast.error('Informe um lead time entre 0 e 365 dias.')
      return
    }
    setSalvandoLeadTime(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      await atualizarLeadTimeConsumoCola({ data: { accessToken, lead_time_dias: valor } })
      toast.success('Lead time do consumo móvel atualizado.')
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o lead time.')
    } finally {
      setSalvandoLeadTime(false)
    }
  }

  async function salvarRetirada() {
    if (!codigosInformados.length) {
      toast.error('Informe um código de container em cada linha.')
      return
    }
    setSalvando(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      const resultado = await retirarContainersCola({ data: { accessToken, codigos: codigosInformados } })
      toast.success(`${resultado.retirados} container(s) marcado(s) como enviado(s) para Bahia.`, {
        description: resultado.ja_enviados?.length ? `Já estavam enviados: ${resultado.ja_enviados.join(', ')}` : undefined,
      })
      setCodigos('')
      setAba('estoque')
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar a retirada.')
    } finally {
      setSalvando(false)
    }
  }

  const abas: { id: Aba; label: string; icon: React.ReactNode }[] = [
    { id: 'estoque', label: 'Estoque', icon: <Package className="size-4" /> },
    { id: 'entrada', label: 'Entrada de cola', icon: <ArrowDownToLine className="size-4" /> },
    { id: 'retirada', label: 'Retirada para Bahia', icon: <ArrowUpFromLine className="size-4" /> },
    { id: 'historico', label: 'Histórico de consumo', icon: <History className="size-4" /> },
    { id: 'envios', label: 'Histórico de envio para BA', icon: <ArrowUpFromLine className="size-4" /> },
  ]

  return (
    <div className="space-y-4 rounded-xl border border-[#d9e0eb] bg-white p-3 sm:p-5">
      <div className="flex justify-end">
        <button type="button" onClick={() => void carregar()} disabled={carregando} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#c91d26] px-4 text-xs font-semibold text-white hover:bg-[#e3262e] disabled:opacity-60">
          <RefreshCw className={`size-4 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {abas.map((item) => (
          <button key={item.id} type="button" onClick={() => setAba(item.id)} aria-current={aba === item.id ? 'page' : undefined}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${aba === item.id ? 'border-[#c91d26] bg-[#c91d26] text-white' : 'border-[#cbd5e1] bg-white text-[#334155] hover:border-[#c91d26] hover:text-[#c91d26]'}`}>
            {item.icon}{item.label}
          </button>
        ))}
      </nav>

      {aba === 'estoque' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs text-slate-500">Containers disponíveis</p><p className="mt-1 text-2xl font-bold">{totalContainers.toLocaleString('pt-BR')}</p></div>
            <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs text-slate-500">Peso disponível</p><p className="mt-1 text-2xl font-bold">{kg(totalKg)}</p><p className="text-[11px] text-slate-500">Cada container: 1.000 kg</p></div>
            <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs text-slate-500">Valor atual do estoque</p><p className="mt-1 text-2xl font-bold">{dinheiro(valorEstoqueAtual)}</p></div>
            <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs text-slate-500">Códigos no histórico</p><p className="mt-1 text-2xl font-bold">{historicoAgrupado.length.toLocaleString('pt-BR')}</p></div>
          </div>
          <Panel title="Consumo móvel e capacidade de produção" description="Cálculo baseado na soma real do campo Cola (kg) da Cobrideira nos últimos 90 dias.">
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Field label="Lead time do consumo (dias)">
                <TextInput type="number" min="0" max="365" step="1" value={leadTimeDias} onChange={(e) => setLeadTimeDias(e.target.value)} />
              </Field>
              <button type="button" onClick={() => void salvarLeadTimeConsumo()} disabled={salvandoLeadTime} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#c91d26] px-4 text-xs font-semibold text-white hover:bg-[#e3262e] disabled:opacity-50">
                {salvandoLeadTime ? 'Salvando...' : 'Salvar lead time'}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Consumo móvel mensal · SP real</p>
                <p className="mt-1 text-xl font-bold">{kg(consumoSPMensal)}</p>
                <button type="button" onClick={() => setDetalhesBAAberto((aberto) => !aberto)} className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#c91d26] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#e3262e]">
                  {detalhesBAAberto ? 'Ocultar detalhes BA' : 'Detalhes BA'}
                </button>
                {detalhesBAAberto && (
                  <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                    <p className="font-semibold text-slate-800">Bahia · base de planejamento</p>
                    <div className="flex justify-between gap-2"><span>Consumo mensal</span><strong>{kg(consumoBAMensal)}</strong></div>
                    <div className="flex justify-between gap-2"><span>Consumo diário</span><strong>{kg(consumoBADiario)}</strong></div>
                    <div className="flex justify-between gap-2"><span>Estoque mínimo · {leadTimeAtual} dias</span><strong>{kg(minimoBA)}</strong></div>
                    <div className="border-t border-slate-200 pt-2 font-semibold text-slate-800">SP real + BA planejamento</div>
                    <div className="flex justify-between gap-2"><span>Consumo mensal combinado</span><strong>{kg(consumoSPMensal + consumoBAMensal)}</strong></div>
                    <div className="flex justify-between gap-2"><span>Consumo diário combinado</span><strong>{kg(consumoSPDiario + consumoBADiario)}</strong></div>
                    <div className="flex justify-between gap-2"><span>Mínimo combinado</span><strong>{kg(minimoSP + minimoBA)}</strong></div>
                    <p className="border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-600">O número de SP vem da soma real do campo Cola na Cobrideira, usando os últimos 90 dias. A referência anterior do planejamento de SP era 39.400 kg/mês; o histórico atual apura 40.200 kg/mês, diferença de 800 kg. A BA permanece como previsão separada de 16.333,33 kg/mês.</p>
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Consumo diário</p><p className="mt-1 text-xl font-bold">{kg(Number(dados.indicadores?.consumo_diario_kg || 0))}</p></div>
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Estoque mínimo · {Number(dados.indicadores?.lead_time_dias ?? leadTimeDias)} dias</p><p className="mt-1 text-xl font-bold">{kg(Number(dados.indicadores?.estoque_minimo_25_dias_kg || 0))}</p></div>
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Média Cola por bobina</p><p className="mt-1 text-xl font-bold">{kg(Number(dados.indicadores?.consumo_medio_bobina_kg || 0))}</p></div>
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Capacidade estimada</p><p className="mt-1 text-xl font-bold">{Number(dados.indicadores?.capacidade_producao_bobinas || 0).toLocaleString('pt-BR',{maximumFractionDigits:1})} bobinas</p><p className="text-[11px] text-slate-500">Média real do campo Cola (kg)</p></div>
            </div>
          </Panel>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAbaEstoque('lotes')} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${abaEstoque === 'lotes' ? 'border-[#c91d26] bg-[#c91d26] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>Lotes de entrada</button>
            <button type="button" onClick={() => setAbaEstoque('detalhes')} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${abaEstoque === 'detalhes' ? 'border-[#c91d26] bg-[#c91d26] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>Detalhes dos containers</button>
          </div>
          {abaEstoque === 'lotes' ? (
            <Panel title="Entradas de cola" description="Saldo por lote de recebimento. A coluna ao lado do lote mostra os códigos internos gerados para cada container.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700"><tr>
                    <th className="px-3 py-2"><button type="button" onClick={() => setOrdemLotes((atual) => atual === 'desc' ? 'asc' : 'desc')}>Data de entrada {ordemLotes === 'desc' ? '↓' : '↑'}</button></th>
                    {['NF','Produto','Lote','Localização','Detalhes','Fornecedor','Containers recebidos','Disponíveis','Peso por container','Valor/kg'].map((x) => <th key={x} className="px-3 py-2">{x}</th>)}
                  </tr></thead>
                  <tbody>{saldoOrdenado.map((item) => {
                    const codigosLote = dados.containers.filter((container) => container.entrada_id === item.id && container.status === 'DISPONIVEL').map((container) => container.codigo)
                    return (
                      <React.Fragment key={item.id}>
                        <tr className={'border-b border-slate-100 ' + (item.localizacao === 'GALPAO_MARIO_COVAS' ? 'bg-yellow-100' : '')}>
                          <td className="px-3 py-2">{new Date(item.data_chegada + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                          <td className="px-3 py-2">{item.nf}</td><td className="px-3 py-2">{item.produto}</td><td className="px-3 py-2">{item.lote}</td>
                          <td className="px-3 py-2"><span className={item.localizacao === 'GALPAO_MARIO_COVAS' ? 'inline-flex rounded-full bg-yellow-300 px-2 py-1 font-semibold text-yellow-950' : 'text-slate-600'}>{item.localizacao === 'GALPAO_MARIO_COVAS' ? 'Galpão da Mario Covas' : 'Estoque'}</span></td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => setLoteExpandido((atual) => atual === item.id ? null : item.id)} className="inline-flex items-center rounded-md bg-[#c91d26] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e3262e]">
                              {loteExpandido === item.id ? 'Ocultar códigos' : 'Detalhes (' + codigosLote.length + ')'}
                            </button>
                          </td>
                          <td className="px-3 py-2">{item.fornecedor}</td>
                          <td className="px-3 py-2">{item.quantidade_containers}</td><td className="px-3 py-2 font-bold">{item.containers_disponiveis}</td>
                          <td className="px-3 py-2">{kg(item.peso_por_container_kg)}</td><td className="px-3 py-2">{dinheiro(item.valor_por_kg)}</td>
                        </tr>
                        {loteExpandido === item.id && (
                          <tr className={item.localizacao === 'GALPAO_MARIO_COVAS' ? 'bg-yellow-50' : 'bg-slate-50'}>
                            <td colSpan={11} className="px-4 py-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-700">Containers disponíveis do lote {item.lote}</span>
                                {item.localizacao === 'GALPAO_MARIO_COVAS' && <span className="rounded-full bg-yellow-300 px-2 py-1 text-[11px] font-semibold text-yellow-950">Galpão da Mario Covas</span>}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {codigosLote.map((codigo) => <span key={codigo} className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-800">{codigo}</span>)}
                                {!codigosLote.length && <span className="text-xs text-slate-500">Nenhum código vinculado a este lote.</span>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}</tbody>
                </table>
                {!saldoOrdenado.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma entrada de cola cadastrada.</p>}
              </div>
            </Panel>
          ) : (
            <Panel title="Detalhes dos containers" description="Selecione um ou mais códigos para alterar a localização ou excluir os registros permitidos. Containers no Galpão da Mario Covas ficam destacados em amarelo.">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600">{containersSelecionados.length} selecionado(s) de {containersDisponiveis.length} disponíveis</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={abrirEdicaoEmLote} disabled={!containersSelecionados.length} className="rounded-lg bg-[#c91d26] px-3 py-2 text-xs font-semibold text-white hover:bg-[#e3262e] disabled:opacity-50">Alterar selecionados</button>
                  <button type="button" onClick={() => void excluirSelecionados()} disabled={!containersSelecionados.length || salvandoEdicao} className="rounded-lg bg-[#c91d26] px-3 py-2 text-xs font-semibold text-white hover:bg-[#e3262e] disabled:opacity-50">Excluir selecionados</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700"><tr>
                    <th className="px-3 py-2"><input type="checkbox" checked={todosContainersSelecionados} onChange={(e) => setSelecionados(e.target.checked ? containersDisponiveis.map((item) => item.codigo) : [])} /></th>
                    <th className="px-3 py-2">Código do container</th>
                    <th className="px-3 py-2"><button type="button" onClick={() => setOrdemDetalhes((atual) => atual === 'desc' ? 'asc' : 'desc')}>Data de entrada {ordemDetalhes === 'desc' ? '↓' : '↑'}</button></th>
                    {['Lote','NF','Fornecedor','Situação','Localização','Ações'].map((x) => <th key={x} className="px-3 py-2">{x}</th>)}
                  </tr></thead>
                  <tbody>{containersOrdenados.map((item) => <tr key={item.codigo} className={`border-b border-slate-100 ${item.entrada?.localizacao === 'GALPAO_MARIO_COVAS' ? 'bg-yellow-100' : ''}`}>
                    <td className="px-3 py-2"><input type="checkbox" checked={selecionados.includes(item.codigo)} onChange={(e) => setSelecionados((atual) => e.target.checked ? [...atual,item.codigo] : atual.filter((codigo) => codigo !== item.codigo))} /></td>
                    <td className="px-3 py-2 font-mono font-semibold">{item.codigo}</td>
                    <td className="px-3 py-2">{item.entrada?.data_chegada ? new Date(item.entrada.data_chegada + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="px-3 py-2">{item.entrada?.lote || '—'}</td><td className="px-3 py-2">{item.entrada?.nf || '—'}</td>
                    <td className="px-3 py-2">{item.entrada?.fornecedor || '—'}</td>
                    <td className="px-3 py-2">{item.status === 'DISPONIVEL' ? 'Disponível' : item.status === 'CONSUMIDO_PRODUCAO' ? 'Utilizado na produção' : item.status === 'ENVIADO_BAHIA' ? 'Enviado para Bahia' : 'Histórico anterior'}</td>
                    <td className="px-3 py-2">{item.entrada?.localizacao === 'GALPAO_MARIO_COVAS' ? 'Galpão da Mario Covas' : 'Estoque'}</td>
                    <td className="px-3 py-2"><button type="button" onClick={() => { setSelecionados([item.codigo]); abrirEdicaoContainer(item) }} className="rounded-md bg-[#c91d26] px-3 py-1.5 font-semibold text-white hover:bg-[#e3262e]">Editar</button></td>
                  </tr>)}</tbody>
                </table>
                {!containersOrdenados.length && <p className="py-8 text-center text-sm text-slate-500">Nenhum container disponível no estoque. Os containers já utilizados ou enviados ficam somente nos históricos.</p>}
              </div>
            </Panel>
          )}

        </div>
      )}

      {aba === 'entrada' && (
        <Panel title="Entrada de cola" description="Registre a nota fiscal, lote, quantidade de containers e valores recebidos.">
          <form onSubmit={salvarEntrada} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Data de chegada"><TextInput type="date" value={form.data_chegada} onChange={(e) => atualizar('data_chegada', e.target.value)} required /></Field>
            <Field label="NF"><TextInput value={form.nf} onChange={(e) => atualizar('nf', e.target.value)} placeholder="Número da nota fiscal" required /></Field>
            <Field label="Produto"><TextInput value={form.produto} onChange={(e) => atualizar('produto', e.target.value.toUpperCase())} required /></Field>
            <Field label="Lote"><TextInput value={form.lote} onChange={(e) => atualizar('lote', e.target.value.toUpperCase())} required /></Field>
            <Field label="Qtd. containers"><TextInput type="number" min="1" step="1" value={form.quantidade_containers} onChange={(e) => atualizar('quantidade_containers', e.target.value)} required /></Field>
            <Field label="Peso por container (kg)"><TextInput type="number" min="0.001" step="0.001" value={form.peso_por_container_kg} onChange={(e) => atualizar('peso_por_container_kg', e.target.value)} required /></Field>
            <Field label="Valor por container (R$)"><TextInput type="number" min="0" step="0.01" value={form.valor_por_container} onChange={(e) => atualizar('valor_por_container', e.target.value)} required /></Field>
            <Field label="Valor por kg (R$)"><TextInput value={dinheiro(valorKg)} readOnly /></Field>
            <Field label="Fornecedor"><TextInput value={form.fornecedor} onChange={(e) => atualizar('fornecedor', e.target.value.toUpperCase())} required /></Field>
            <div className="sm:col-span-2 lg:col-span-3"><Field label="Observações"><TextInput value={form.observacoes} onChange={(e) => atualizar('observacoes', e.target.value)} /></Field></div>
            <div className="sm:col-span-2 lg:col-span-3"><PrimaryButton type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar entrada'}</PrimaryButton></div>
          </form>
        </Panel>
      )}

      {aba === 'retirada' && (
        <Panel title="Retirada de cola · Enviado para Bahia" description="Cole um código de container por linha. Cada código válido gera uma baixa individual no saldo.">
          <Field label={`Códigos dos containers · ${codigosInformados.length} informado(s)`}>
            <textarea value={codigos} onChange={(e) => setCodigos(e.target.value)} rows={10} spellCheck={false} placeholder={'Exemplo:\n123456\n123457\n123458'} className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-sm outline-none focus:border-[#c91d26] focus:ring-2 focus:ring-red-100" />
          </Field>
          <div className="mt-3 flex justify-end"><PrimaryButton type="button" onClick={() => void salvarRetirada()} disabled={salvando || !codigosInformados.length}><Send className="size-4" />{salvando ? 'Registrando...' : 'Confirmar envio para Bahia'}</PrimaryButton></div>
        </Panel>
      )}

      {aba === 'historico' && (
        <Panel title="Histórico de consumo por código" description="Exibe somente códigos de container com oito dígitos; a data apresentada é a última data de consumo registrada.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-slate-100 text-slate-700"><tr>
                <th className="px-3 py-2">Código do container</th>
                <th className="px-3 py-2"><button type="button" onClick={() => setOrdemConsumo((atual) => atual === 'desc' ? 'asc' : 'desc')}>Data de consumo {ordemConsumo === 'desc' ? '↓' : '↑'}</button></th>
                {['Cola líquida utilizada','Lote','Fornecedor','Situação'].map((x) => <th key={x} className="px-3 py-2">{x}</th>)}
              </tr></thead>
              <tbody>{historicoAgrupado.map((item) => <tr key={item.codigo} className="border-b border-slate-100"><td className="px-3 py-2 font-semibold">{item.codigo}</td><td className="px-3 py-2">{new Date(item.dataConsumo + 'T12:00:00').toLocaleDateString('pt-BR')}</td><td className="px-3 py-2 font-bold">{kg(item.cola)}</td><td className="px-3 py-2">{item.lote || '—'}</td><td className="px-3 py-2">{item.fornecedor || '—'}</td><td className="px-3 py-2">{item.status === 'ENVIADO_BAHIA' ? 'Enviado para Bahia' : item.status === 'CONSUMIDO_PRODUCAO' ? 'Utilizado na produção' : 'Histórico anterior'}</td></tr>)}</tbody>
            </table>
            {!historicoAgrupado.length && <p className="py-8 text-center text-sm text-slate-500">Ainda não há consumo registrado.</p>}
          </div>
        </Panel>
      )}
      {aba === 'envios' && (
        <Panel title="Histórico de envio para BA" description="Cada container enviado aparece com a data da retirada e o lote de origem.">
          <div className="space-y-2">
            <div className="flex justify-end">
              <button type="button" onClick={() => setOrdemEnvios((atual) => atual === 'desc' ? 'asc' : 'desc')} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
                Data de envio {ordemEnvios === 'desc' ? '↓ mais recentes' : '↑ mais antigos'}
              </button>
            </div>
            {enviadosParaBahia.map((item) => (
              <article key={item.codigo_container} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <p className="min-w-0 break-all font-mono text-sm font-bold text-slate-900">{item.codigo_container}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{item.status}</span>
                </div>
                <div className="mt-2 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
                  <div><p className="text-slate-500">Data de envio</p><p className="font-semibold">{new Date(item.data_envio + 'T12:00:00').toLocaleDateString('pt-BR')}</p></div>
                  <div><p className="text-slate-500">Data de entrada</p><p className="font-semibold">{new Date(item.data_entrada + 'T12:00:00').toLocaleDateString('pt-BR')}</p></div>
                  <div><p className="text-slate-500">NF</p><p className="font-semibold">{item.nf}</p></div>
                  <div><p className="text-slate-500">Produto / lote</p><p className="break-words font-semibold">{item.produto} · {item.lote}</p></div>
                  <div><p className="text-slate-500">Peso</p><p className="font-semibold">{Number(item.peso_kg).toLocaleString('pt-BR',{maximumFractionDigits:0})} kg</p></div>
                  <div><p className="text-slate-500">Valor/container</p><p className="font-semibold">{item.valor_por_container === null ? '—' : dinheiro(Number(item.valor_por_container))}</p></div>
                  <div><p className="text-slate-500">Valor/kg</p><p className="font-semibold">{dinheiro(Number(item.valor_por_kg || 0))}</p></div>
                  <div><p className="text-slate-500">Fornecedor · mês</p><p className="break-words font-semibold">{item.fornecedor} · {item.mes}</p></div>
                </div>
              </article>
            ))}
            {!enviadosParaBahia.length && <p className="py-8 text-center text-sm text-slate-500">Nenhum envio para Bahia registrado ainda.</p>}
          </div>
        </Panel>
      )}
      {(editandoCodigo !== null || editandoEmLote) && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
            <div><h3 className="text-lg font-bold text-slate-900">{editandoEmLote ? `Alterar ${containersSelecionados.length} containers` : 'Editar container'}</h3><p className="text-xs text-slate-500">Altere o código interno e/ou a localização.</p></div>
            {!editandoEmLote && <Field label="Código do container"><TextInput value={codigoEditado} onChange={(e) => setCodigoEditado(e.target.value)} /></Field>}
            <Field label="Localização do lote">
              <select value={localizacaoEditada} onChange={(e) => setLocalizacaoEditada(e.target.value as 'ESTOQUE' | 'GALPAO_MARIO_COVAS' | '')} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                {editandoEmLote && <option value="">Manter localização atual</option>}
                <option value="ESTOQUE">Estoque</option>
                <option value="GALPAO_MARIO_COVAS">Galpão da Mario Covas</option>
              </select>
            </Field>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-bold text-slate-800">Dados da entrada / lote</p>
              <p className="mb-3 text-[11px] text-slate-500">Esses campos são compartilhados por todos os containers do mesmo lote. Em edição em lote, deixe em branco o que não deseja alterar.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Data de entrada"><TextInput type="date" value={dataEntradaEditada} onChange={(e) => setDataEntradaEditada(e.target.value)} /></Field>
                <Field label="NF"><TextInput value={nfEditada} onChange={(e) => setNfEditada(e.target.value)} /></Field>
                <Field label="Produto"><TextInput value={produtoEditado} onChange={(e) => setProdutoEditado(e.target.value)} /></Field>
                <Field label="Lote"><TextInput value={loteEditado} onChange={(e) => setLoteEditado(e.target.value)} /></Field>
                <Field label="Peso por container (kg)"><TextInput type="number" min="0.001" step="0.001" value={pesoEntradaEditado} onChange={(e) => setPesoEntradaEditado(e.target.value)} /></Field>
                <Field label="Valor por container (R$)"><TextInput type="number" min="0" step="0.01" value={valorEntradaEditado} onChange={(e) => setValorEntradaEditado(e.target.value)} /></Field>
                <Field label="Fornecedor"><TextInput value={fornecedorEditado} onChange={(e) => setFornecedorEditado(e.target.value)} /></Field>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setEditandoCodigo(null); setEditandoEmLote(false) }} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700">Cancelar</button>
              <button type="button" onClick={() => void salvarEdicaoContainers()} disabled={salvandoEdicao || (!editandoEmLote && !codigoEditado.trim())} className="rounded-lg bg-[#c91d26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e3262e] disabled:opacity-50">{salvandoEdicao ? 'Salvando...' : 'Salvar alterações'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
