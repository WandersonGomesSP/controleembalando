import * as React from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileUp,
  History,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { EstoqueAtualCobrideira } from '@/components/painel/estoque-atual'
import {
  corrigirNumeroBobinaRebobinadeira,
  editarProducaoRebobinadeira,
  excluirLancamentosRebobinadeira,
  listarLixeiraRebobinadeira,
  restaurarLancamentosRebobinadeira,
  excluirDefinitivamenteLixeiraRebobinadeira,
  buscarDetalhesBobinasOrigemRebobinadeira,
  importarCsvRebobinadeira,
  registrarProducaoRebobinadeira,
  adicionarMedidaRebobinadeira,
  buscarBobinasOrigemRebobinadeira,
} from '@/lib/admin.functions'
import type {
  RebobinadeiraAlertaBobinaRow,
  RebobinadeiraProdutoRow,
  RebobinadeiraSaldoBobinaRow,
} from '@/lib/database.types'

type Props = {
  onChangeArea: () => void
  isDeveloper: boolean
}

type BobinaOrigem = {
  numero_bobina: string
  data: string
  material: string
  largura: number
  peso_kg: number
  metragem_m: number
  fornecedor_filme: string
  lote_cola: string
  fornecedor_cola: string
  cor: string
  linha: string
  cliente: string
}

type BobinaOrigemDetalhe = {
  numero_bobina: string
  cod_bob: string | null
  data: string
  aba: string | null
  material: string
  largura: number
  micragem: number
  peso_bruto: number | null
  peso_final: number | null
  peso_cilindro: number | null
  peso_liquido: number | null
  metragem: number
  perda_kg: number | null
  fornecedor_filme: string | null
  vareta_g: number | null
  kg_cola: number | null
  lote_cola: string | null
  codigo_interno: string | null
  fornecedor_cola: string | null
  turno: string | null
  linha: string | null
  cor_fundo: string | null
  pigmento_kg: number | null
  cor_mistura: string | null
  pigmento_mistura: string | null
  cliente: string | null
  cor_impressao: string | null
  emenda: boolean | null
  codigo_emenda: string | null
  operador: string | null
}

type ProdutoAdicional = {
  id: number
  produto_codigo: string
  linha: 'PADRÃO' | 'PERSONALIZADA' | 'KIT'
  linha_detalhe: string
  cliente: string
  caixas: string
  pcts: string
  rolos: string
  refugos: string
  fitas_rebobinadas: string
  refilo_kg: string
  perda_producao_kg: string
  observacoes: string
}

type ProducaoRow = {
  id: number
  numero_bobina: string
  numero_normalizado: string
  data: string
  maquina: string | null
  setup: boolean
  turno: string | null
  material: string
  produto_codigo: string
  largura_jumbo_mm: number | null
  peso_jumbo_kg: number | null
  cor: string
  linha: string
  metragem_bobina_m: number | null
  metragem_unica_m: number | null
  status_baixa: string
  metros_consumidos: number | null
  peso_consumido_kg: number | null
  observacoes: string | null
  medida: string | null
  cliente: string | null
  caixas: number | null
  pcts: number | null
  rolos: number | null
  refugos: number | null
  fitas_rebobinadas: number | null
  refilo_kg: number | null
  perda_producao_kg: number | null
  metragem_devolvida_m: number | null
  bobina_voltou_parcial: boolean
  linha_detalhe: string | null
  fornec_filme: string | null
  lote_cola: string | null
  fornec_cola: string | null
}

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const dataHoje = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}
const parseNumero = (value: string) => {
  if (!value.trim()) return null
  const n = Number(value.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const formatarData = (value: string | null) => {
  if (!value) return '—'
  const d = new Date(value + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('pt-BR')
}
const formatar = (value: number | null | undefined, suffix = '') =>
  value == null || !Number.isFinite(Number(value)) ? '—' : numero.format(Number(value)) + suffix

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    NAO_PROCESSADA: 'Não processada',
    PENDENTE: 'Pendente',
    EM_USO: 'Em uso',
    DEVOLVIDA_PARCIAL: 'Devolvida parcialmente',
    CONSUMIDA: 'Consumida',
    ESTORNADA: 'Estornada',
    CADASTRADA: 'Cadastrada',
    LIXEIRA: 'Lixeira',
  }
  if (status === 'EM_USO' || status === 'CONSUMIDA' || status === 'CADASTRADA') return 'Cadastrada'
  if (status === 'DEVOLVIDA_PARCIAL') return 'Devolvida Parcialmente'
  if (status === 'NAO_PROCESSADA' || status === 'PENDENTE') return 'Pendente'
  if (status === 'ESTORNADA') return 'Cadastrada'
  return labels[status] ?? status
}

function statusClass(status: string) {
  if (status === 'CONSUMIDA' || status === 'CADASTRADA' || status === 'EM_USO') return 'border-emerald-300 bg-emerald-50 text-emerald-800'
  if (status === 'PENDENTE' || status === 'NAO_PROCESSADA' || status === 'LIXEIRA') return 'border-red-300 bg-red-50 text-red-800'
  if (status === 'DEVOLVIDA_PARCIAL') return 'border-amber-300 bg-amber-50 text-amber-800'
  if (status === 'EM_USO') return 'border-blue-300 bg-blue-50 text-blue-800'
  return 'border-emerald-300 bg-emerald-50 text-emerald-800'
}

function severidadeClass(severidade: string) {
  return severidade === 'CRITICA' || severidade === 'ALTA'
    ? 'border-red-300 bg-red-50 text-red-900'
    : severidade === 'MEDIA'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-border bg-muted text-foreground'
}

export function HistoricoProducao({ onChangeArea, isDeveloper }: Props) {
  const [registros, setRegistros] = React.useState<ProducaoRow[]>([])
  const [alertas, setAlertas] = React.useState<RebobinadeiraAlertaBobinaRow[]>([])
  const [saldos, setSaldos] = React.useState<RebobinadeiraSaldoBobinaRow[]>([])
  const [origens, setOrigens] = React.useState<Record<string, BobinaOrigemDetalhe>>({})
  const [produtos, setProdutos] = React.useState<RebobinadeiraProdutoRow[]>([])
  const [carregando, setCarregando] = React.useState(true)
  const [atualizando, setAtualizando] = React.useState(false)
  const [erro, setErro] = React.useState('')
  const [busca, setBusca] = React.useState('')
  const [statusFiltro, setStatusFiltro] = React.useState('')
  const [dataInicio, setDataInicio] = React.useState('')
  const [dataFim, setDataFim] = React.useState('')
  const [mesFiltro, setMesFiltro] = React.useState('')
  const [periodoUtilizacao, setPeriodoUtilizacao] = React.useState('7')
  const [pagina, setPagina] = React.useState(0)
  const [detalheAberto, setDetalheAberto] = React.useState<string | null>(null)
  const [gruposSelecionados, setGruposSelecionados] = React.useState<Set<string>>(() => new Set())
  const [excluindo, setExcluindo] = React.useState(false)
  const [lixeiraRebo, setLixeiraRebo] = React.useState<Array<{ id: string; producao_id: number; numero_bobina: string; dados: Record<string, any>; excluida_em: string }>>([])
  const [selecionadosLixeira, setSelecionadosLixeira] = React.useState<Set<string>>(() => new Set())
  const [processandoLixeira, setProcessandoLixeira] = React.useState(false)
  const [tela, setTela] = React.useState<'historico' | 'cadastro' | 'indicadores' | 'lixeira'>('historico')
  const [salvando, setSalvando] = React.useState(false)
  const [importando, setImportando] = React.useState(false)
  const [arquivo, setArquivo] = React.useState<File | null>(null)
  const [buscaBobina, setBuscaBobina] = React.useState('')
  const [resultadosBobina, setResultadosBobina] = React.useState<BobinaOrigem[]>([])
  const [bobinaSelecionada, setBobinaSelecionada] = React.useState<BobinaOrigem | null>(null)
  const [buscandoBobina, setBuscandoBobina] = React.useState(false)
  const [inputArquivoKey, setInputArquivoKey] = React.useState(0)
  const [bobinaEmEdicao, setBobinaEmEdicao] = React.useState<{ id: number; numero: string } | null>(null)
  const [novoNumeroBobina, setNovoNumeroBobina] = React.useState('')
  const [mostrarNovaMedida, setMostrarNovaMedida] = React.useState(false)
  const [novaMedida, setNovaMedida] = React.useState('')
  const [salvandoMedida, setSalvandoMedida] = React.useState(false)
  const [produtosExtras, setProdutosExtras] = React.useState<ProdutoAdicional[]>([])
  const [form, setForm] = React.useState({
    data: dataHoje(),
    maquina: 'M1',
    setup: false,
    numero_bobina: '',
    turno: '1º TURNO',
    produto_codigo: '',
    material: '',
    largura_jumbo_mm: '',
    peso_jumbo_kg: '',
    fornec_filme: '',
    lote_cola: '',
    fornec_cola: '',
    medida: '',
    cor: '',
    linha: 'PADRÃO',
    linha_detalhe: '',
    cliente: '',
    caixas: '0',
    pcts: '0',
    rolos: '0',
    refugos: '0',
    fitas_rebobinadas: '0',
    refilo_kg: '0',
    perda_producao_kg: '0',
    metragem_bobina_m: '',
    bobina_voltou_parcial: false,
    metros_utilizados_m: '',
    observacoes: '',
  })


  const carregar = React.useCallback(async (silencioso = false) => {
    if (silencioso) setAtualizando(true)
    else setCarregando(true)
    setErro('')
    const [alertasResult, saldosResult, produtosResult] = await Promise.all([
      supabase.schema('rebobinadeira').from('alertas_bobinas')
        .select('*').eq('status', 'ABERTO').order('criado_em', { ascending: false }).limit(100),
      supabase.schema('rebobinadeira').from('vw_saldo_bobinas')
        .select('*').order('data', { ascending: false }).limit(500),
      supabase.schema('rebobinadeira').from('produtos_jumbo')
        .select('*').eq('ativo', false).like('codigo', 'MEDIDA|%').order('descricao', { ascending: true }),
    ])
    const producaoRows: ProducaoRow[] = []
    let erroProducao: string | null = null
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await supabase.schema('rebobinadeira').from('bobinas')
        .select('id,numero_bobina,numero_normalizado,data,maquina,setup,turno,material,produto_codigo,largura_jumbo_mm,peso_jumbo_kg,fornec_filme,lote_cola,fornec_cola,medida,cor,linha,linha_detalhe,cliente,caixas,pcts,rolos,refugos,fitas_rebobinadas,refilo_kg,perda_producao_kg,metragem_bobina_m,metragem_unica_m,metragem_devolvida_m,bobina_voltou_parcial,status_baixa,metros_consumidos,peso_consumido_kg,observacoes')
        .order('data', { ascending: false }).order('id', { ascending: false })
        .range(inicio, inicio + 999)
      if (error) { erroProducao = error.message; break }
      producaoRows.push(...((data ?? []) as ProducaoRow[]))
      if (!data || data.length < 1000) break
    }
    let origensRows: BobinaOrigemDetalhe[] = []
    let erroOrigem: string | null = null
    try {
      const numeros = [...new Set(producaoRows.map((item) => item.numero_bobina).filter(Boolean))]
      if (numeros.length) {
        const accessToken = await obterToken()
        for (let inicio = 0; inicio < numeros.length; inicio += 900) {
          const lote = numeros.slice(inicio, inicio + 900)
          const parte = await buscarDetalhesBobinasOrigemRebobinadeira({ data: { accessToken, numeros: lote } }) as BobinaOrigemDetalhe[]
          origensRows.push(...parte)
        }
      }
    } catch (error) {
      erroOrigem = error instanceof Error ? error.message : 'Não foi possível carregar os dados de origem.'
    }
    const falhas = [erroProducao, alertasResult.error?.message, saldosResult.error?.message, produtosResult.error?.message].filter(Boolean)
    if (erroProducao) {
      setErro(erroProducao)
      toast.error('Falha ao carregar os lançamentos de produção.', { description: erroProducao })
    } else {
      setRegistros(producaoRows.filter((item) => item.status_baixa !== 'EXCLUIDA'))
      setAlertas((alertasResult.data ?? []) as RebobinadeiraAlertaBobinaRow[])
      setSaldos((saldosResult.data ?? []) as RebobinadeiraSaldoBobinaRow[])
      setOrigens(origensRows.reduce<Record<string, BobinaOrigemDetalhe>>((mapa, row) => { const chave = row.numero_bobina.replace(/\D/g, ''); if (!mapa[chave]) mapa[chave] = row; return mapa }, {}))
      setProdutos((produtosResult.data ?? []) as RebobinadeiraProdutoRow[])
      const falhasAuxiliares = [alertasResult.error?.message, saldosResult.error?.message, produtosResult.error?.message].filter(Boolean)
      if (falhasAuxiliares.length) toast.warning('Alguns indicadores auxiliares não puderam ser atualizados.', { description: falhasAuxiliares.join(' · ') })
    }
    if (erroOrigem) toast.warning('Dados completos da Cobrideira indisponíveis.', { description: erroOrigem })
    setCarregando(false)
    setAtualizando(false)
  }, [])

  React.useEffect(() => { void carregar() }, [carregar])

  const filtrados = React.useMemo(() => {
    const mapa = new Map<string, ProducaoRow[]>()
    for (const item of registros) {
      if (item.status_baixa === 'EXCLUIDA') continue
      const chave = item.numero_normalizado || item.numero_bobina.replace(/\D/g, '')
      const grupo = mapa.get(chave) ?? []
      grupo.push(item)
      mapa.set(chave, grupo)
    }
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    return Array.from(mapa.entries()).flatMap(([chave, linhas]) => {
      const ordenadas = [...linhas].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)
      const ciclos: ProducaoRow[][] = []
      let cicloAtual: ProducaoRow[] = []
      for (const linha of ordenadas) {
        cicloAtual.push(linha)
        if (linha.bobina_voltou_parcial) {
          ciclos.push(cicloAtual)
          cicloAtual = []
        }
      }
      if (cicloAtual.length) ciclos.push(cicloAtual)
      return ciclos.map((linhasCiclo, indiceCiclo) => {
        const primeira = linhasCiclo[0]!
        const ultima = linhasCiclo[linhasCiclo.length - 1]!
        const dataInicioGrupo = primeira.data
        const dataFimGrupo = ultima.data
        const diasNaMaquina = Math.max(1, Math.floor((new Date(dataFimGrupo + 'T00:00:00').getTime() - new Date(dataInicioGrupo + 'T00:00:00').getTime()) / 86400000) + 1)
        const maquinas = Array.from(new Set(linhasCiclo.map((item) => item.maquina).filter((v): v is string => Boolean(v))))
        return {
          groupId: chave + ':' + indiceCiclo + ':' + primeira.id,
          numero_normalizado: chave,
          numero_bobina: primeira.numero_bobina,
          dataInicio: dataInicioGrupo,
          dataFim: dataFimGrupo,
          diasNaMaquina,
          maquinas,
          material: ultima.material,
          cor: ultima.cor,
          status: ultima.status_baixa,
          metrosConsumidos: linhasCiclo.reduce((soma, item) => soma + Number(item.metros_consumidos || item.metragem_unica_m || 0), 0),
          caixasTotal: linhasCiclo.reduce((soma, item) => soma + Number(item.caixas ?? 0), 0),
          pctsTotal: linhasCiclo.reduce((soma, item) => soma + Number(item.pcts ?? 0), 0),
          rolosTotal: linhasCiclo.reduce((soma, item) => soma + Number(item.rolos ?? 0), 0),
          refugosTotal: linhasCiclo.reduce((soma, item) => soma + Number(item.refugos ?? 0), 0),
          fitasTotal: linhasCiclo.reduce((soma, item) => soma + Number(item.fitas_rebobinadas ?? 0), 0),
          refiloTotal: linhasCiclo.reduce((soma, item) => soma + Number(item.refilo_kg ?? 0), 0),
          perdaTotal: linhasCiclo.reduce((soma, item) => soma + Number(item.perda_producao_kg ?? 0), 0),
          linhas: linhasCiclo,
        }
      })
    }).filter((grupo) => {
      const correspondeTexto = !termo || [grupo.numero_bobina, grupo.material, grupo.cor, ...grupo.maquinas, ...grupo.linhas.map((item) => item.produto_codigo)]
        .some((valor) => String(valor ?? '').toLocaleLowerCase('pt-BR').includes(termo))
      const normalizarStatus = (status: string) => status === 'EM_USO' || status === 'CONSUMIDA' || status === 'ESTORNADA' ? 'CADASTRADA' : status === 'NAO_PROCESSADA' ? 'PENDENTE' : status
      const correspondeStatus = !statusFiltro || normalizarStatus(grupo.status) === statusFiltro || grupo.linhas.some((item) => normalizarStatus(item.status_baixa) === statusFiltro)
      const correspondeInicio = !dataInicio || grupo.dataFim >= dataInicio
      const correspondeFim = !dataFim || grupo.dataInicio <= dataFim
      const correspondeMes = !mesFiltro || grupo.linhas.some((item) => item.data.startsWith(mesFiltro))
      const diasPeriodo = periodoUtilizacao === '7' ? 7 : periodoUtilizacao === '30' ? 30 : periodoUtilizacao === '90' ? 90 : periodoUtilizacao === '180' ? 180 : periodoUtilizacao === '365' ? 365 : null
      const hoje = new Date()
      const inicioPeriodo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
      if (diasPeriodo !== null) inicioPeriodo.setDate(inicioPeriodo.getDate() - (diasPeriodo - 1))
      const dataMinimaPeriodo = diasPeriodo === null ? '' : [inicioPeriodo.getFullYear(), String(inicioPeriodo.getMonth() + 1).padStart(2, '0'), String(inicioPeriodo.getDate()).padStart(2, '0')].join('-')
      const correspondePeriodo = !dataMinimaPeriodo || grupo.linhas.some((item) => item.data >= dataMinimaPeriodo)
      return correspondeTexto && correspondeStatus && correspondeInicio && correspondeFim && correspondeMes && correspondePeriodo
    }).sort((a, b) => b.dataFim.localeCompare(a.dataFim) || a.numero_bobina.localeCompare(b.numero_bobina))
  }, [registros, busca, statusFiltro, dataInicio, dataFim, mesFiltro, periodoUtilizacao])

  async function excluirGrupos(grupos: typeof filtrados) {
    const ids = grupos.flatMap((grupo) => grupo.linhas.map((linha) => linha.id))
    if (!ids.length) return
    if (!window.confirm('Mover ' + grupos.length + ' lançamento(s) e ' + ids.length + ' registro(s) de produção para a lixeira? O saldo consumido será recomposto.')) return
    setExcluindo(true)
    try {
      const accessToken = await obterToken()
      await excluirLancamentosRebobinadeira({ data: { accessToken, ids } })
      setRegistros((atuais) => atuais.filter((linha) => !ids.includes(linha.id)))
      setGruposSelecionados(new Set())
      setDetalheAberto(null)
      toast.success(grupos.length + ' lançamento(s) movido(s) para a lixeira. O saldo foi recomposto.')
      await carregarLixeiraRebo()
    } catch (error) { toast.error('Não foi possível excluir os lançamentos.', { description: error instanceof Error ? error.message : 'Erro inesperado.' }) }
    finally { setExcluindo(false) }
  }
  async function excluirGruposSelecionados() { await excluirGrupos(filtrados.filter((grupo) => gruposSelecionados.has(grupo.groupId))) }

  const porPagina = 30
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const mesesDisponiveis = Array.from(new Set(registros.map((item) => item.data.slice(0, 7)))).sort().reverse()
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const paginaRegistros = filtrados.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina)
  const gruposVisiveis = paginaRegistros
  const todosVisiveisSelecionados = gruposVisiveis.length > 0 && gruposVisiveis.every((grupo) => gruposSelecionados.has(grupo.groupId))
  const consumidas = React.useMemo(() => {
    const hoje = new Date()
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    const dias = periodoUtilizacao === '7' ? 7 : periodoUtilizacao === '30' ? 30 : periodoUtilizacao === '90' ? 90 : periodoUtilizacao === '180' ? 180 : periodoUtilizacao === '365' ? 365 : null
    if (dias !== null) inicio.setDate(inicio.getDate() - (dias - 1))
    const unicas = new Set<string>()
    for (const item of registros) {
      if (item.status_baixa === 'EXCLUIDA') continue
      const metros = Number(item.metros_consumidos ?? item.metragem_unica_m ?? 0)
      if (metros <= 0) continue
      const dataRegistro = new Date(item.data + 'T00:00:00')
      if (inicio && dias !== null && dataRegistro < inicio) continue
      unicas.add(item.numero_normalizado || item.numero_bobina.replace(/\D/g, ''))
    }
    return unicas.size
  }, [registros, periodoUtilizacao])
  const saldoBobinaSelecionada = bobinaSelecionada ? saldos.find((item) => item.numero_bobina.replace(/\D/g, '') === bobinaSelecionada.numero_bobina.replace(/\D/g, '')) : undefined

  async function carregarLixeiraRebo() {
    try {
      const accessToken = await obterToken()
      const itens = await listarLixeiraRebobinadeira({ data: { accessToken } })
      setLixeiraRebo(itens as typeof lixeiraRebo)
      setSelecionadosLixeira(new Set())
    } catch (error) { toast.error('Não foi possível carregar a lixeira.', { description: error instanceof Error ? error.message : 'Erro inesperado.' }) }
  }

  async function processarLixeira(acao: 'restaurar' | 'excluir', idsInformados = [...selecionadosLixeira]) {
    const ids = [...new Set(idsInformados)]
    if (!ids.length) return
    if (acao === 'excluir' && !isDeveloper) return
    const mensagem = acao === 'restaurar' ? 'Restaurar os ' + ids.length + ' lançamento(s) selecionado(s)?' : 'Excluir definitivamente os ' + ids.length + ' lançamento(s)? Esta ação não poderá ser desfeita.'
    if (!window.confirm(mensagem)) return
    setProcessandoLixeira(true)
    try {
      const accessToken = await obterToken()
      for (let inicio = 0; inicio < ids.length; inicio += 500) {
        const lote = ids.slice(inicio, inicio + 500)
        if (acao === 'restaurar') await restaurarLancamentosRebobinadeira({ data: { accessToken, ids: lote } })
        else await excluirDefinitivamenteLixeiraRebobinadeira({ data: { accessToken, ids: lote } })
      }
      toast.success(acao === 'restaurar' ? ids.length + ' lançamento(s) restaurado(s).' : ids.length + ' lançamento(s) excluído(s) definitivamente.')
      await carregarLixeiraRebo()
      if (acao === 'restaurar') await carregar(true)
    } catch (error) { toast.error('Não foi possível concluir a ação na lixeira.', { description: error instanceof Error ? error.message : 'Erro inesperado.' }) }
    finally { setProcessandoLixeira(false) }
  }

  async function obterToken() {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente no sistema.')
    return data.session.access_token
  }

  async function pesquisarBobina(termo: string) {
    setBuscaBobina(termo)
    if (bobinaSelecionada) {
      setForm((atual) => ({ ...atual, numero_bobina: termo, produto_codigo: '', material: '', largura_jumbo_mm: '', peso_jumbo_kg: '', fornec_filme: '', lote_cola: '', fornec_cola: '', medida: '', cor: '', linha: 'PADRÃO', linha_detalhe: '', cliente: '', metragem_bobina_m: '', bobina_voltou_parcial: false, metros_utilizados_m: '' }))
    } else {
      setForm((atual) => ({ ...atual, numero_bobina: termo }))
    }
    setBobinaSelecionada(null)
    setProdutosExtras([])
    if (termo.trim().length < 2) {
      setResultadosBobina([])
      return
    }
    setBuscandoBobina(true)
    try {
      const accessToken = await obterToken()
      const rows = await buscarBobinasOrigemRebobinadeira({ data: { accessToken, termo: termo.trim() } })
      setResultadosBobina(rows as BobinaOrigem[])
    } catch (error) {
      setResultadosBobina([])
      toast.error('Falha na busca de bobinas.', { description: error instanceof Error ? error.message : 'Tente novamente.' })
    } finally {
      setBuscandoBobina(false)
    }
  }

  function selecionarBobina(row: BobinaOrigem) {
    setProdutosExtras([])
    setBobinaSelecionada(row)
    setBuscaBobina(row.numero_bobina)
    setResultadosBobina([])
    const linha = row.linha?.toLocaleUpperCase('pt-BR').includes('KIT') ? 'KIT'
      : row.linha?.toLocaleUpperCase('pt-BR').includes('PERSONALIZ') ? 'PERSONALIZADA' : 'PADRÃO'
    const saldoAtual = saldos.find((item) => item.numero_bobina.replace(/\D/g, '') === row.numero_bobina.replace(/\D/g, ''))
    const metragemDisponivel = Number(saldoAtual?.saldo_metros ?? row.metragem_m)
    setForm((atual) => ({
      ...atual,
      numero_bobina: row.numero_bobina,
      produto_codigo: produtos.find((p) => p.material === row.material && p.cor === row.cor && Number(p.largura_jumbo_mm) === Number(row.largura))?.codigo ?? '',
      material: row.material ?? '',
      largura_jumbo_mm: String(row.largura ?? ''),
      peso_jumbo_kg: String(row.peso_kg ?? ''),
      fornec_filme: row.fornecedor_filme ?? '',
      lote_cola: row.lote_cola ?? '',
      fornec_cola: row.fornecedor_cola ?? '',
      cor: row.cor ?? '',
      linha,
      linha_detalhe: linha === 'KIT' ? (row.linha ?? '') : '',
      cliente: row.cliente ?? '',
      metragem_bobina_m: String(metragemDisponivel || row.metragem_m || ''),
      bobina_voltou_parcial: false,
      metros_utilizados_m: '',
    }))
  }

  async function salvarProducao(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.produto_codigo || produtosExtras.some((item) => !item.produto_codigo)) {
      toast.error('Selecione uma medida para cada produto da produção.')
      return
    }
    if (!form.material.trim() || !form.cor.trim()) {
      toast.error('Preencha material e cor da bobina.')
      return
    }
    if (form.bobina_voltou_parcial) {
      const utilizada = parseNumero(form.metros_utilizados_m)
      const disponivel = parseNumero(form.metragem_bobina_m)
      if (utilizada == null || utilizada <= 0 || disponivel == null || utilizada >= disponivel) {
        toast.error('Informe os metros utilizados, maior que zero e menor que a metragem total da bobina.')
        return
      }
    }
    setSalvando(true)
    try {
      const accessToken = await obterToken()
      const itens = [
        {
          produto_codigo: form.produto_codigo,
          medida: form.medida,
          linha: form.linha,
          linha_detalhe: form.linha_detalhe,
          cliente: form.cliente,
          caixas: form.caixas,
          pcts: form.pcts,
          rolos: form.rolos,
          refugos: form.refugos,
          fitas_rebobinadas: form.fitas_rebobinadas,
          refilo_kg: form.refilo_kg,
          perda_producao_kg: form.perda_producao_kg,
          observacoes: form.observacoes,
        },
        ...produtosExtras.map((item) => ({
          ...item,
          medida: produtos.find((p) => p.codigo === item.produto_codigo)?.descricao ?? item.produto_codigo,
        })),
      ]
      const ids: number[] = []
      for (let indice = 0; indice < itens.length; indice++) {
        const item = itens[indice]!
        const ultimo = indice === itens.length - 1
        const resultado = await registrarProducaoRebobinadeira({
          data: {
            accessToken,
            registro: {
              data: form.data,
              maquina: form.maquina,
              setup: form.setup,
              numero_bobina: form.numero_bobina,
              turno: null,
              produto_codigo: item.produto_codigo,
              material: form.material,
              largura_jumbo_mm: parseNumero(form.largura_jumbo_mm),
              peso_jumbo_kg: parseNumero(form.peso_jumbo_kg),
              fornec_filme: form.fornec_filme,
              lote_cola: form.lote_cola,
              fornec_cola: form.fornec_cola,
              medida: item.medida,
              cor: form.cor,
              linha: item.linha as ProdutoAdicional['linha'],
              linha_detalhe: item.linha_detalhe,
              cliente: item.cliente,
              caixas: Number(item.caixas),
              pcts: Number(item.pcts),
              rolos: Number(item.rolos),
              refugos: Number(item.refugos),
              fitas_rebobinadas: Number(item.fitas_rebobinadas),
              refilo_kg: Number(item.refilo_kg),
              perda_producao_kg: Number(item.perda_producao_kg),
              metragem_bobina_m: parseNumero(form.metragem_bobina_m),
              metragem_unica_m: form.bobina_voltou_parcial ? parseNumero(form.metros_utilizados_m) : parseNumero(form.metragem_bobina_m),
              bobina_voltou_parcial: ultimo && form.bobina_voltou_parcial,
              metragem_devolvida_m: ultimo && form.bobina_voltou_parcial
                ? Math.max(0, Number(form.metragem_bobina_m) - Number(form.metros_utilizados_m))
                : null,
              observacoes: item.observacoes,
            },
          },
        })
        ids.push(resultado.id)
      }
      toast.success(ids.length > 1 ? 'Produções registradas.' : 'Produção registrada.', {
        description: ids.length + ' produto(s) salvo(s) para a bobina ' + form.numero_bobina + '. O consumo físico foi controlado uma única vez.',
      })
      setForm((atual) => ({ ...atual, numero_bobina: '', produto_codigo: '', material: '', largura_jumbo_mm: '', peso_jumbo_kg: '', fornec_filme: '', lote_cola: '', fornec_cola: '', medida: '', cor: '', linha: 'PADRÃO', linha_detalhe: '', cliente: '', caixas: '0', pcts: '0', rolos: '0', refugos: '0', fitas_rebobinadas: '0', refilo_kg: '0', perda_producao_kg: '0', metragem_bobina_m: '', bobina_voltou_parcial: false, metros_utilizados_m: '', observacoes: '' }))
      setProdutosExtras([])
      setBobinaSelecionada(null)
      setBuscaBobina('')
      setResultadosBobina([])
      await carregar(true)
    } catch (error) {
      toast.error('Não foi possível concluir todos os produtos da produção.', {
        description: error instanceof Error ? error.message : 'Verifique os campos e tente novamente. Se houve falha após um item, confira o histórico antes de reenviar.',
      })
    } finally {
      setSalvando(false)
    }
  }

  async function importarArquivo() {
    if (!arquivo) {
      toast.error('Selecione um arquivo CSV primeiro.')
      return
    }
    setImportando(true)
    try {
      const accessToken = await obterToken()
      const csv = await arquivo.text()
      const resultado = await importarCsvRebobinadeira({
        data: { accessToken, csv, nomeArquivo: arquivo.name },
      })
      toast.success(resultado.repetido ? 'Este arquivo já foi importado.' : 'Importação concluída.', {
        description: resultado.repetido
          ? 'Nenhuma linha foi duplicada.'
          : resultado.gravadas + ' linhas gravadas; ' + resultado.rejeitadas + ' rejeitadas.',
      })
      setArquivo(null)
      setInputArquivoKey((key) => key + 1)
      await carregar(true)
    } catch (error) {
      toast.error('Não foi possível importar o CSV.', {
        description: error instanceof Error ? error.message : 'Verifique o arquivo e tente novamente.',
      })
    } finally {
      setImportando(false)
    }
  }

  function iniciarEdicao(item: ProducaoRow) {
    setProdutosExtras([])
    setForm((atual) => ({
      ...atual,
      data: item.data,
      maquina: item.maquina ?? 'M1',
      setup: item.setup,
      numero_bobina: item.numero_bobina,
      produto_codigo: item.produto_codigo,
      material: item.material,
      largura_jumbo_mm: item.largura_jumbo_mm == null ? '' : String(item.largura_jumbo_mm),
      peso_jumbo_kg: item.peso_jumbo_kg == null ? '' : String(item.peso_jumbo_kg),
      fornec_filme: item.fornec_filme ?? '',
      lote_cola: item.lote_cola ?? '',
      fornec_cola: item.fornec_cola ?? '',
      medida: item.medida ?? '',
      cor: item.cor,
      linha: item.linha as 'PADRÃO' | 'PERSONALIZADA' | 'KIT',
      linha_detalhe: item.linha_detalhe ?? '',
      cliente: item.cliente ?? '',
      caixas: String(item.caixas ?? 0),
      pcts: String(item.pcts ?? 0),
      rolos: String(item.rolos ?? 0),
      refugos: String(item.refugos ?? 0),
      fitas_rebobinadas: String(item.fitas_rebobinadas ?? 0),
      refilo_kg: String(item.refilo_kg ?? 0),
      perda_producao_kg: String(item.perda_producao_kg ?? 0),
      observacoes: item.observacoes ?? '',
    }))
    setBobinaEmEdicao({ id: item.id, numero: item.numero_bobina })
    setNovoNumeroBobina(item.numero_bobina)
  }

  async function salvarCorrecaoNumero() {
    if (!bobinaEmEdicao) return
    if (!novoNumeroBobina.trim()) {
      toast.error('Informe o número correto da bobina.')
      return
    }
    setSalvando(true)
    try {
      const accessToken = await obterToken()
      await editarProducaoRebobinadeira({
        data: {
          accessToken,
          producaoId: bobinaEmEdicao.id,
          registro: {
            data: form.data,
            maquina: form.maquina,
            setup: form.setup,
            produto_codigo: form.produto_codigo,
            material: form.material,
            largura_jumbo_mm: parseNumero(form.largura_jumbo_mm),
            peso_jumbo_kg: parseNumero(form.peso_jumbo_kg),
            fornec_filme: form.fornec_filme,
            lote_cola: form.lote_cola,
            fornec_cola: form.fornec_cola,
            medida: form.medida,
            cor: form.cor,
            linha: form.linha as ProdutoAdicional['linha'],
            linha_detalhe: form.linha_detalhe,
            cliente: form.cliente,
            caixas: Number(form.caixas),
            pcts: Number(form.pcts),
            rolos: Number(form.rolos),
            refugos: Number(form.refugos),
            fitas_rebobinadas: Number(form.fitas_rebobinadas),
            refilo_kg: Number(form.refilo_kg),
            perda_producao_kg: Number(form.perda_producao_kg),
            observacoes: form.observacoes,
          },
        },
      })
      if (novoNumeroBobina.trim() !== bobinaEmEdicao.numero.trim()) {
        await corrigirNumeroBobinaRebobinadeira({
          data: { accessToken, producaoId: bobinaEmEdicao.id, novoNumero: novoNumeroBobina.trim() },
        })
      }
      toast.success('Dados da produção atualizados.', {
        description: 'Os campos manuais foram salvos' + (novoNumeroBobina.trim() !== bobinaEmEdicao.numero.trim() ? ' e o número da bobina e o saldo foram corrigidos.' : '.'),
      })
      setBobinaEmEdicao(null)
      setNovoNumeroBobina('')
      await carregar(true)
    } catch (error) {
      toast.error('Não foi possível salvar a edição.', {
        description: error instanceof Error ? error.message : 'Confira os campos e tente novamente.',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-[#e2e8f0] bg-white">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-3 px-7 pt-[18px] pb-4">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex min-w-0 items-center gap-[18px]">
              <img src="/logo-embalando.png" alt="Embalando Fitas Adesivas" className="block h-16 w-auto shrink-0 object-contain max-[767px]:h-12" />
              <div aria-hidden="true" className="hidden h-12 w-px shrink-0 bg-[#cbd5e1] md:block" />
              <div className="min-w-0">
                <h1 className="text-[24px] leading-[1.1] font-bold text-[#0b1f4d]">Rebobinadeira</h1>
                <p className="mt-1 text-[13px] leading-normal text-[#475569]">Registro e histórico de produção</p>
              </div>
            </div>
            <button type="button" onClick={onChangeArea} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-black bg-black px-2.5 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-zinc-800 sm:min-h-10 sm:gap-2 sm:px-4 sm:text-xs">
              <ArrowLeft className="size-4" /> Trocar setor
            </button>
          </div>
          <nav aria-label="Menus da Rebobinadeira" className="grid grid-cols-2 gap-2 pb-0 sm:flex sm:flex-wrap">
            <button type="button" aria-current={tela === 'cadastro' ? 'page' : undefined} onClick={() => setTela('cadastro')} className={'inline-flex min-h-10 items-center justify-center gap-1 rounded-lg px-3 text-center text-xs font-semibold whitespace-nowrap sm:gap-2 sm:px-4 sm:text-sm ' + (tela === 'cadastro' ? 'bg-[#e3262e] text-white shadow-sm' : 'bg-[#c91d26] text-white hover:bg-[#e3262e]')}>
              <Package className="size-4" /> Cadastrar produção
            </button>
            <button type="button" aria-current={tela === 'historico' ? 'page' : undefined} onClick={() => setTela('historico')} className={'inline-flex min-h-10 items-center justify-center gap-1 rounded-lg px-3 text-center text-xs font-semibold whitespace-nowrap sm:gap-2 sm:px-4 sm:text-sm ' + (tela === 'historico' ? 'bg-[#e3262e] text-white shadow-sm' : 'bg-[#c91d26] text-white hover:bg-[#e3262e]')}>
              <History className="size-4" /> Histórico de produção
            </button>
            <button type="button" aria-current={tela === 'indicadores' ? 'page' : undefined} onClick={() => setTela('indicadores')} className={'inline-flex min-h-10 items-center justify-center gap-1 rounded-lg px-3 text-center text-xs font-semibold whitespace-nowrap sm:gap-2 sm:px-4 sm:text-sm ' + (tela === 'indicadores' ? 'bg-[#e3262e] text-white shadow-sm' : 'bg-[#c91d26] text-white hover:bg-[#e3262e]')}>
              <Package className="size-4" /> Indicadores
            </button>
            <button type="button" aria-current={tela === 'lixeira' ? 'page' : undefined} onClick={() => { setTela('lixeira'); void carregarLixeiraRebo() }} className={'inline-flex min-h-10 items-center justify-center gap-1 rounded-lg px-3 text-center text-xs font-semibold whitespace-nowrap sm:gap-2 sm:px-4 sm:text-sm ' + (tela === 'lixeira' ? 'bg-[#e3262e] text-white shadow-sm' : 'bg-[#c91d26] text-white hover:bg-[#e3262e]')}>
              <Trash2 className="size-4" /> Lixeira ({lixeiraRebo.length})
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[96rem] space-y-4 rounded-2xl bg-white p-3 sm:p-4">
        {tela === 'historico' && <div className="flex justify-end"><button type="button" onClick={() => void carregar(true)} disabled={atualizando || carregando} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#e3262e] px-4 text-sm font-semibold text-white transition hover:bg-[#c91f28] disabled:opacity-50"><RefreshCw className={'size-4 ' + (atualizando ? 'animate-spin' : '')} /> Atualizar</button></div>}

        {erro && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><strong>Falha ao carregar:</strong> {erro}</div>}

        {tela === 'historico' && (
        <>
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold"><FileUp className="size-4" /> Importar planilha da Rebobinadeira</div>
              <p className="mt-1 text-xs text-muted-foreground">O CSV mantém todas as linhas, inclusive quando o mesmo número de bobina aparece mais de uma vez.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input key={inputArquivoKey} type="file" accept=".csv,text/csv" className="sr-only" id="historico-rebobinadeira-csv" onChange={(event) => setArquivo(event.target.files?.[0] ?? null)} />
              <label htmlFor="historico-rebobinadeira-csv" className="csv-import-control inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[#e3262e] px-4 text-sm font-bold text-white transition hover:bg-[#c91f28]">
                <FileUp className="size-4" /> {arquivo ? arquivo.name : 'Selecionar CSV'}
              </label>
              <button type="button" onClick={() => void importarArquivo()} disabled={!arquivo || importando} className="csv-import-control inline-flex h-10 items-center gap-2 rounded-full bg-[#e3262e] px-4 text-sm font-bold text-white transition hover:bg-[#c91f28] disabled:opacity-50">
                {importando ? <RefreshCw className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                {importando ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </section>

        </>)}

        {tela === 'historico' && (
        <>
        {alertas.length > 0 && (
          <section className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
            <div className="flex items-center gap-2 text-red-950">
              <AlertTriangle className="size-5" />
              <h3 className="font-bold">Alertas que precisam de análise ({alertas.length})</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {alertas.slice(0, 30).map((alerta) => (
                <article key={alerta.id} className="rounded-lg border border-red-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-red-950">{alerta.numero_bobina ? 'Bobina ' + alerta.numero_bobina + ' · ' : ''}{alerta.tipo.replaceAll('_', ' ')}</div>
                    <span className={'rounded-full border px-2 py-1 text-xs font-bold ' + severidadeClass(alerta.severidade)}>{alerta.severidade}</span>
                  </div>
                  <p className="mt-1 text-sm text-red-900">{alerta.mensagem}</p>
                  <p className="mt-1 text-xs text-red-800/80">{new Date(alerta.criado_em).toLocaleString('pt-BR')}</p>
                </article>
              ))}
              {alertas.length > 30 && <p className="text-xs font-medium text-red-900">Mostrando os 30 primeiros alertas. Os demais continuam registrados no histórico.</p>}
            </div>
          </section>
        )}

        </>)}

        {tela === 'indicadores' && <EstoqueAtualCobrideira isDeveloper={isDeveloper} tipoEstoque="ADESIVADO" />}

        {tela === 'lixeira' && (
          <section className="rounded-xl bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-semibold">Lixeira da Rebobinadeira</h3><p className="text-xs text-muted-foreground">Restaure lançamentos ou exclua definitivamente os registros selecionados.</p></div>
              <div className="flex flex-wrap gap-2">
                {selecionadosLixeira.size > 0 && <button type="button" onClick={() => void processarLixeira('restaurar')} disabled={processandoLixeira} className="rounded-lg bg-[#e3262e] px-3 py-2 text-xs font-bold text-white hover:bg-[#c91f28]">Restaurar {selecionadosLixeira.size} selecionado(s)</button>}
                {isDeveloper && selecionadosLixeira.size > 0 && <button type="button" onClick={() => void processarLixeira('excluir')} disabled={processandoLixeira} className="rounded-lg bg-red-800 px-3 py-2 text-xs font-bold text-white hover:bg-red-900">Excluir definitivamente</button>}
              </div>
            </div>
            {lixeiraRebo.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="px-2 py-3"><input type="checkbox" aria-label="Selecionar todos os itens da lixeira" checked={lixeiraRebo.length > 0 && lixeiraRebo.every((item) => selecionadosLixeira.has(item.id))} onChange={(event) => setSelecionadosLixeira(event.target.checked ? new Set(lixeiraRebo.map((item) => item.id)) : new Set())} /></th><th className="px-3 py-3">Excluída em</th><th className="px-3 py-3">Bobina</th><th className="px-3 py-3">Data de produção</th><th className="px-3 py-3">Máquina</th><th className="px-3 py-3">Produto</th><th className="px-3 py-3 text-right">Ações</th></tr></thead>
              <tbody>{lixeiraRebo.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="px-2 py-3"><input type="checkbox" aria-label={`Selecionar lançamento da bobina ${item.numero_bobina}`} checked={selecionadosLixeira.has(item.id)} onChange={() => setSelecionadosLixeira((atuais) => { const novas = new Set(atuais); novas.has(item.id) ? novas.delete(item.id) : novas.add(item.id); return novas })} /></td><td className="px-3 py-3 text-xs">{new Date(item.excluida_em).toLocaleString('pt-BR')}</td><td className="px-3 py-3 font-mono">{item.numero_bobina}</td><td className="px-3 py-3">{item.dados.data ? formatarData(item.dados.data) : '—'}</td><td className="px-3 py-3">{item.dados.maquina ?? '—'}</td><td className="px-3 py-3">{item.dados.produto_codigo ?? '—'}</td><td className="px-3 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => void processarLixeira('restaurar', [item.id])} disabled={processandoLixeira} className="rounded-md bg-[#e3262e] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#c91f28]">Restaurar</button>{isDeveloper && <button type="button" onClick={() => void processarLixeira('excluir', [item.id])} disabled={processandoLixeira} className="rounded-md bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-900">Excluir</button>}</div></td></tr>)}</tbody>
            </table></div> : <p className="py-10 text-center text-sm text-muted-foreground">A lixeira está vazia.</p>}
          </section>
        )}

        {tela === 'cadastro' && (
        <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-4"><h3 className="font-semibold">Registrar produção</h3><p className="text-xs text-muted-foreground">Se a bobina não estiver no estoque, o registro será salvo como pendente e gerará um alerta.</p></div>
            <form onSubmit={(event) => void salvarProducao(event)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-sm"><span className="font-medium">Data</span><input required type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Máquina</span><select required value={form.maquina} onChange={(e) => setForm({ ...form, maquina: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3">{['M1','M2','M3','M4','M5','M6'].map((m) => <option key={m}>{m}</option>)}</select></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Setup</span><select value={form.setup ? 'SIM' : 'NÃO'} onChange={(e) => setForm({ ...form, setup: e.target.value === 'SIM' })} className="h-10 rounded-lg border border-input bg-background px-3"><option value="SIM">SIM</option><option value="NÃO">NÃO</option></select></label>

              <div className="relative grid gap-1 text-sm sm:col-span-2 lg:col-span-4">
                <label className="font-medium" htmlFor="numero-bobina-rebobinadeira">Nº da bobina (pesquise pelo número)</label>
                <input id="numero-bobina-rebobinadeira" required value={buscaBobina} onChange={(e) => void pesquisarBobina(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3" placeholder="Digite pelo menos 2 caracteres" autoComplete="off" />
                {buscandoBobina && <span className="text-xs text-muted-foreground">Pesquisando bobinas cadastradas...</span>}
                {resultadosBobina.length > 0 && <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">{resultadosBobina.map((row) => <button key={row.numero_bobina + row.data} type="button" onClick={() => selecionarBobina(row)} className="flex w-full flex-col items-start border-b border-border px-3 py-2 text-left text-sm transition hover:bg-accent"><strong>{row.numero_bobina}</strong><span className="text-xs text-muted-foreground">{row.material} · {row.largura} mm · {row.metragem_m} m · {row.peso_kg} kg · {row.cor}</span></button>)}</div>}
                {bobinaSelecionada ? <p className="text-xs text-emerald-700">Bobina localizada na Cobrideira. Dados de origem preenchidos automaticamente.</p> : buscaBobina.trim().length >= 2 && !buscandoBobina && resultadosBobina.length === 0 && <p className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-800">Bobina não cadastrada: a linha será salva como PENDENTE e ficará sinalizada para conciliação.</p>}
              </div>

              {bobinaSelecionada && <div className="grid gap-2 rounded-lg border border-emerald-700 bg-emerald-50 p-3 text-xs text-emerald-950 sm:col-span-2 lg:col-span-4 sm:grid-cols-3 lg:grid-cols-4">
                <div className="sm:col-span-3 lg:col-span-4 font-semibold text-emerald-900">Dados da bobina · origem Cobrideira</div>
                <span><strong>Nº da bobina:</strong> {bobinaSelecionada.numero_bobina}</span>
                <span><strong>Material:</strong> {bobinaSelecionada.material}</span>
                <span><strong>Largura:</strong> {formatar(bobinaSelecionada.largura, ' mm')}</span>
                <span><strong>Peso original:</strong> {formatar(bobinaSelecionada.peso_kg, ' kg')}</span>
                <span><strong>Metragem original:</strong> {formatar(bobinaSelecionada.metragem_m, ' m')}</span>
                <span><strong>Saldo atual:</strong> {formatar(saldoBobinaSelecionada?.saldo_metros ?? bobinaSelecionada.metragem_m, ' m')} · {formatar(saldoBobinaSelecionada?.saldo_kg ?? bobinaSelecionada.peso_kg, ' kg')}</span>
                <span><strong>Status:</strong> {saldoBobinaSelecionada?.status ?? 'CADASTRADA'}</span>
                <span><strong>Fornecedor filme:</strong> {bobinaSelecionada.fornecedor_filme || '—'}</span>
                <span><strong>Lote cola:</strong> {bobinaSelecionada.lote_cola || '—'}</span>
                <span><strong>Fornecedor cola:</strong> {bobinaSelecionada.fornecedor_cola || '—'}</span>
                <span><strong>Cor:</strong> {bobinaSelecionada.cor || '—'}</span>
                <span><strong>Linha:</strong> {bobinaSelecionada.linha || '—'}</span>
                <span><strong>Cliente:</strong> {bobinaSelecionada.cliente || '—'}</span>
              </div>}

              <div className="grid gap-2 text-sm sm:col-span-2">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">Produtos</span><div className="flex gap-2"><button type="button" onClick={() => setMostrarNovaMedida((aberto) => !aberto)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"><Plus className="size-3" /> Nova medida</button><button type="button" onClick={() => setProdutosExtras((itens) => [...itens, { id: itens.reduce((maior, atual) => Math.max(maior, atual.id), 0) + 1, produto_codigo: '', linha: form.linha as ProdutoAdicional['linha'], linha_detalhe: '', cliente: form.cliente, caixas: '0', pcts: '0', rolos: '0', refugos: '0', fitas_rebobinadas: '0', refilo_kg: '0', perda_producao_kg: '0', observacoes: '' }])} className="inline-flex items-center gap-1 rounded-lg border border-[#c91d26] bg-[#e3262e] px-3 py-2 text-xs font-bold text-white hover:bg-[#c91d26]"><Plus className="size-3" /> Adicionar produto</button></div></div>
                {mostrarNovaMedida && <div className="flex flex-wrap gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><input value={novaMedida} onChange={(e) => setNovaMedida(e.target.value)} maxLength={80} placeholder="Ex.: 48x60" className="h-10 min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-3 text-slate-900" /><button type="button" disabled={salvandoMedida || !novaMedida.trim()} onClick={async () => { setSalvandoMedida(true); try { const accessToken = await obterToken(); const produto = await adicionarMedidaRebobinadeira({ data: { accessToken, descricao: novaMedida } }); setProdutos((atuais) => [...atuais.filter((p) => p.codigo !== produto.codigo), produto as RebobinadeiraProdutoRow].sort((a,b) => a.descricao.localeCompare(b.descricao, 'pt-BR'))); setForm((atual) => ({ ...atual, produto_codigo: produto.codigo, medida: produto.descricao })); setNovaMedida(''); setMostrarNovaMedida(false); toast.success('Medida adicionada.'); } catch (error) { toast.error('Não foi possível adicionar a medida.', { description: error instanceof Error ? error.message : 'Tente novamente.' }); } finally { setSalvandoMedida(false); } }} className="h-10 rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white disabled:opacity-50">{salvandoMedida ? 'Salvando...' : 'Salvar medida'}</button></div>}
                <select required value={form.produto_codigo} onChange={(e) => { const produto = produtos.find((p) => p.codigo === e.target.value); setForm((atual) => ({ ...atual, produto_codigo: e.target.value, medida: produto?.descricao ?? e.target.value })) }} className="h-10 rounded-lg border border-input bg-background px-3"><option value="">Selecione a medida</option>{produtos.map((p) => <option key={p.codigo} value={p.codigo}>{p.descricao}</option>)}</select>
              </div>
              {produtosExtras.map((produto, indice) => (
                <section key={produto.id} className="grid gap-3 rounded-xl border border-violet-300 bg-violet-50 p-3 text-violet-950 sm:col-span-2 lg:col-span-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-center justify-between sm:col-span-2 lg:col-span-4"><strong className="text-sm">Produto adicional {indice + 2}</strong><button type="button" onClick={() => setProdutosExtras((itens) => itens.filter((item) => item.id !== produto.id))} className="rounded-md border border-violet-300 px-2 py-1 text-xs font-semibold hover:bg-violet-100">Remover</button></div>
                  <label className="grid gap-1 text-sm sm:col-span-2"><span>Produtos / medida</span><select required value={produto.produto_codigo} onChange={e=>setProdutosExtras(itens=>itens.map(item=>item.id===produto.id?{...item,produto_codigo:e.target.value}:item))} className="h-10 rounded-lg border border-violet-300 bg-white px-3 text-slate-900"><option value="">Selecione a medida</option>{produtos.map(p=><option key={p.codigo} value={p.codigo}>{p.descricao}</option>)}</select></label>
                  <label className="grid gap-1 text-sm"><span>Linha</span><select value={produto.linha} onChange={e=>setProdutosExtras(itens=>itens.map(item=>item.id===produto.id?{...item,linha:e.target.value as ProdutoAdicional['linha']}:item))} className="h-10 rounded-lg border border-violet-300 bg-white px-3 text-slate-900"><option value="PADRÃO">Padrão</option><option value="PERSONALIZADA">Personalizada</option><option value="KIT">Kit</option></select></label>
                  {produto.linha==='KIT' && <label className="grid gap-1 text-sm"><span>Identificação do Kit</span><input value={produto.linha_detalhe} onChange={e=>setProdutosExtras(itens=>itens.map(item=>item.id===produto.id?{...item,linha_detalhe:e.target.value}:item))} className="h-10 rounded-lg border border-violet-300 bg-white px-3 text-slate-900" /></label>}
                  <label className="grid gap-1 text-sm"><span>Cliente</span><input value={produto.cliente} onChange={e=>setProdutosExtras(itens=>itens.map(item=>item.id===produto.id?{...item,cliente:e.target.value}:item))} className="h-10 rounded-lg border border-violet-300 bg-white px-3 text-slate-900" /></label>
                  {(['caixas','pcts','rolos','refugos','fitas_rebobinadas','refilo_kg','perda_producao_kg'] as const).map(campo => <label key={campo} className="grid gap-1 text-sm"><span>{{caixas:'Caixas',pcts:'Pacotes (pcts)',rolos:'Rolos',refugos:'Refugos',fitas_rebobinadas:'Fitas rebobinadas',refilo_kg:'Refilo (kg)',perda_producao_kg:'Perda de produção (kg)'}[campo]}</span><input type="number" min="0" step={['caixas','pcts','rolos'].includes(campo)?'1':'0.001'} value={produto[campo]} onChange={e=>setProdutosExtras(itens=>itens.map(item=>item.id===produto.id?{...item,[campo]:e.target.value}:item))} className="h-10 rounded-lg border border-violet-300 bg-white px-3 text-slate-900" /></label>)}
                  <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-4"><span>Observações do produto</span><textarea value={produto.observacoes} onChange={e=>setProdutosExtras(itens=>itens.map(item=>item.id===produto.id?{...item,observacoes:e.target.value}:item))} rows={2} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-slate-900" /></label>
                </section>
              ))}
{!bobinaSelecionada && (<label className="grid gap-1 text-sm"><span className="font-medium">Material</span><input required readOnly={Boolean(bobinaSelecionada)} value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 read-only:bg-muted" /></label>)}
{!bobinaSelecionada && (<label className="grid gap-1 text-sm"><span className="font-medium">Largura da bobina (mm)</span><input required readOnly={Boolean(bobinaSelecionada)} inputMode="decimal" value={form.largura_jumbo_mm} onChange={(e) => setForm({ ...form, largura_jumbo_mm: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 read-only:bg-muted" /></label>)}
{!bobinaSelecionada && (<label className="grid gap-1 text-sm"><span className="font-medium">Peso da bobina (kg)</span><input required readOnly={Boolean(bobinaSelecionada)} inputMode="decimal" value={form.peso_jumbo_kg} onChange={(e) => setForm({ ...form, peso_jumbo_kg: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 read-only:bg-muted" /></label>)}
{!bobinaSelecionada && (<label className="grid gap-1 text-sm"><span className="font-medium">Fornecedor do filme</span><input readOnly={Boolean(bobinaSelecionada)} value={form.fornec_filme} onChange={(e) => setForm({ ...form, fornec_filme: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 read-only:bg-muted" /></label>)}
{!bobinaSelecionada && (<label className="grid gap-1 text-sm"><span className="font-medium">Lote da cola</span><input readOnly={Boolean(bobinaSelecionada)} value={form.lote_cola} onChange={(e) => setForm({ ...form, lote_cola: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 read-only:bg-muted" /></label>)}
{!bobinaSelecionada && (<label className="grid gap-1 text-sm"><span className="font-medium">Fornecedor da cola</span><input readOnly={Boolean(bobinaSelecionada)} value={form.fornec_cola} onChange={(e) => setForm({ ...form, fornec_cola: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 read-only:bg-muted" /></label>)}
              
{!bobinaSelecionada && (<label className="grid gap-1 text-sm"><span className="font-medium">Cor</span><input required readOnly={Boolean(bobinaSelecionada)} value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 read-only:bg-muted" /></label>)}
{!bobinaSelecionada && (<label className="grid gap-1 text-sm"><span className="font-medium">Linha</span><select disabled={Boolean(bobinaSelecionada)} value={form.linha} onChange={(e) => setForm({ ...form, linha: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 disabled:bg-muted"><option value="PADRÃO">Padrão</option><option value="PERSONALIZADA">Personalizada</option><option value="KIT">Kit</option></select></label>)}
{form.linha === 'KIT' && !bobinaSelecionada && <label className="grid gap-1 text-sm"><span className="font-medium">Identificação do Kit</span><input required value={form.linha_detalhe} onChange={(e) => setForm({ ...form, linha_detalhe: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" placeholder="Descreva o kit" /></label>}
{!bobinaSelecionada && (<label className="grid gap-1 text-sm"><span className="font-medium">Cliente</span><input readOnly={Boolean(bobinaSelecionada)} value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 read-only:bg-muted" /></label>)}
              <label className="grid gap-1 text-sm"><span className="font-medium">Caixas</span><input required type="number" min="0" step="1" value={form.caixas} onChange={(e) => setForm({ ...form, caixas: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Pacotes (pcts)</span><input required type="number" min="0" step="1" value={form.pcts} onChange={(e) => setForm({ ...form, pcts: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Rolos</span><input required type="number" min="0" step="1" value={form.rolos} onChange={(e) => setForm({ ...form, rolos: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Refugos</span><input required type="number" min="0" step="0.01" value={form.refugos} onChange={(e) => setForm({ ...form, refugos: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Fitas rebobinadas</span><input required type="number" min="0" step="0.01" value={form.fitas_rebobinadas} onChange={(e) => setForm({ ...form, fitas_rebobinadas: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Refilo (kg)</span><input required type="number" min="0" step="0.001" value={form.refilo_kg} onChange={(e) => setForm({ ...form, refilo_kg: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Perda de produção (kg)</span><input required type="number" min="0" step="0.001" value={form.perda_producao_kg} onChange={(e) => setForm({ ...form, perda_producao_kg: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
{!bobinaSelecionada && (<label className="grid gap-1 text-sm"><span className="font-medium">Metragem disponível para utilização (m)</span><input required readOnly={Boolean(bobinaSelecionada)} inputMode="decimal" value={form.metragem_bobina_m} onChange={(e) => setForm({ ...form, metragem_bobina_m: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3 read-only:bg-muted" /></label>)}
              <label className="grid gap-1 text-sm"><span className="font-medium">Bobina voltou parcialmente?</span><select value={form.bobina_voltou_parcial ? 'SIM' : 'NÃO'} onChange={(e) => setForm({ ...form, bobina_voltou_parcial: e.target.value === 'SIM', metros_utilizados_m: '' })} className="h-10 rounded-lg border border-input bg-background px-3"><option value="NÃO">NÃO</option><option value="SIM">SIM</option></select></label>
              {form.bobina_voltou_parcial && <label className="grid gap-1 text-sm"><span className="font-medium">Metros utilizados (m)</span><input required type="number" min="0.01" step="0.01" max={Math.max(0, Number(form.metragem_bobina_m || 0) - 0.01)} value={form.metros_utilizados_m} onChange={(e) => setForm({ ...form, metros_utilizados_m: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label>}
              <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-4"><span className="font-medium">Observações</span><textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} className="rounded-lg border border-input bg-background px-3 py-2" /></label>
              <div className="flex flex-wrap justify-end gap-2 sm:col-span-2 lg:col-span-4">
                <button type="button" onClick={() => setTela('historico')} className="min-h-10 rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-accent">Cancelar</button>
                <button type="submit" disabled={salvando} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"><Save className="size-4" /> {salvando ? 'Salvando...' : 'Salvar produção'}</button>
              </div>
            </form>
          </section>
        )}


        {tela === 'historico' && (
        <>
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl bg-white p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ClipboardList className="size-4" /> Lançamentos no histórico</div><p className="mt-2 text-2xl font-semibold tabular-nums">{numero.format(registros.filter((item) => item.status_baixa !== 'EXCLUIDA' && (periodoUtilizacao === 'todos' || item.data >= (() => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - (Number(periodoUtilizacao) - 1)); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-') })())).length)}</p></article>
          <article className="rounded-xl bg-white p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Bell className="size-4" /> Alertas em aberto</div><p className="mt-2 text-2xl font-semibold tabular-nums">{numero.format(alertas.length)}</p></article>
          <article className="rounded-xl bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Package className="size-4" /> Bobinas utilizadas</div><select aria-label="Período de utilização das bobinas" value={periodoUtilizacao} onChange={(event) => setPeriodoUtilizacao(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs"><option value="7">Últimos 7 dias</option><option value="30">Último mês</option><option value="90">Último trimestre</option><option value="180">Últimos 6 meses</option><option value="365">Último ano</option><option value="todos">Todo o período</option></select></div><p className="mt-2 text-2xl font-semibold tabular-nums">{numero.format(consumidas)}</p></article>
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Bobinas no histórico</h3><p className="text-xs text-muted-foreground">Cada bobina aparece uma vez na lista. Abra os detalhes para consultar os dados de origem e os lançamentos de produção.</p></div>{gruposSelecionados.size > 0 && <button type="button" onClick={() => void excluirGruposSelecionados()} disabled={excluindo} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#e3262e] px-4 text-sm font-bold text-white hover:bg-[#c91d26] disabled:opacity-50"><Trash2 className="size-4" />{excluindo ? "Excluindo..." : `Excluir ${gruposSelecionados.size} selecionado(s)`}</button>}</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0) }} placeholder="Buscar bobina, máquina ou produto" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" /></label>
              <select value={statusFiltro} onChange={(e) => { setStatusFiltro(e.target.value); setPagina(0) }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="">Todos os status</option><option value="CADASTRADA">Cadastrada</option><option value="PENDENTE">Pendente</option><option value="DEVOLVIDA_PARCIAL">Devolvida Parcialmente</option></select>
              <select value={mesFiltro} onChange={(e) => { setMesFiltro(e.target.value); setPagina(0) }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="">Todos os meses</option>{mesesDisponiveis.map((mes) => <option key={mes} value={mes}>{new Date(mes + '-01T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</option>)}</select>
              <input type="date" value={dataInicio} onChange={(e) => { setDataInicio(e.target.value); setPagina(0) }} aria-label="Data inicial" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
              <input type="date" value={dataFim} onChange={(e) => { setDataFim(e.target.value); setPagina(0) }} aria-label="Data final" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          {carregando ? <p className="p-10 text-center text-sm text-muted-foreground">Carregando histórico...</p> : paginaRegistros.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhum lançamento encontrado com os filtros atuais.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3"><input type="checkbox" aria-label="Selecionar todos os lançamentos visíveis" checked={todosVisiveisSelecionados} onChange={(event) => setGruposSelecionados((atuais) => { const novas = new Set(atuais); gruposVisiveis.forEach((grupo) => event.target.checked ? novas.add(grupo.groupId) : novas.delete(grupo.groupId)); return novas })} /></th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Bobina</th><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Lançamentos</th><th className="px-4 py-3">Metros consumidos</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Detalhes</th><th className="px-4 py-3">Ação</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {paginaRegistros.map((grupo) => (
                    <React.Fragment key={grupo.groupId}>
                      <tr className="hover:bg-muted/30">
                        <td className="px-3 py-3"><input type="checkbox" aria-label={`Selecionar bobina ${grupo.numero_bobina}`} checked={gruposSelecionados.has(grupo.groupId)} onChange={() => setGruposSelecionados((atuais) => { const novas = new Set(atuais); if (novas.has(grupo.groupId)) novas.delete(grupo.groupId); else novas.add(grupo.groupId); return novas })} /></td>
                        <td className="whitespace-nowrap px-4 py-3">{formatarData(grupo.dataFim)}</td>
                        <td className="px-4 py-3 font-mono font-semibold">{grupo.numero_bobina}</td>
                        <td className="px-4 py-3">{grupo.material} · {grupo.cor}</td>
                        <td className="px-4 py-3 tabular-nums">{grupo.linhas.length}</td>
                        <td className="px-4 py-3 tabular-nums">{formatar(grupo.metrosConsumidos, ' m')}</td>
                        <td className="px-4 py-3"><div className="flex items-center gap-2"><span className={'inline-flex rounded-full border px-2 py-1 text-xs font-semibold ' + statusClass(grupo.status)}>{statusLabel(grupo.status)}</span><button type="button" title="Excluir lançamento" aria-label={`Excluir lançamento da bobina ${grupo.numero_bobina}`} onClick={() => void excluirGrupos([grupo])} disabled={excluindo} className="inline-flex size-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="size-4" /></button></div></td>
                        <td className="px-4 py-3"><button type="button" onClick={() => setDetalheAberto(detalheAberto === grupo.groupId ? null : grupo.groupId)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent">{detalheAberto === grupo.groupId ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />} {detalheAberto === grupo.groupId ? 'Fechar' : 'Detalhes'}</button></td>
                        <td className="px-4 py-3"><button type="button" onClick={() => iniciarEdicao(grupo.linhas.at(-1)!)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent"><Pencil className="size-3" /> Editar</button></td>
                      </tr>
                      {detalheAberto === grupo.groupId && <tr className="bg-muted/20"><td colSpan={9} className="px-4 py-3">
                        <div className="mb-3 grid gap-2 text-xs sm:grid-cols-3">
                          <span><strong>Primeiro registro:</strong> {formatarData(grupo.dataInicio)}</span>
                          <span><strong>Último registro:</strong> {formatarData(grupo.dataFim)}</span>
                          <span><strong>Total de dias:</strong> {grupo.diasNaMaquina}</span>
                          <span><strong>Máquina inicial:</strong> {grupo.linhas[0]?.maquina || '—'} · {grupo.linhas[0]?.turno || '—'}</span>
                          <span><strong>Máquina final:</strong> {grupo.linhas.at(-1)?.maquina || '—'} · {grupo.linhas.at(-1)?.turno || '—'}</span>
                          <span><strong>Máquinas utilizadas:</strong> {grupo.maquinas.join(', ') || '—'}</span>
                          <span><strong>Saldo atual:</strong> {formatar(saldos.find((item) => item.numero_bobina === grupo.numero_bobina)?.saldo_metros, ' m')} · {formatar(saldos.find((item) => item.numero_bobina === grupo.numero_bobina)?.saldo_kg, ' kg')}</span>
                        </div>
                        <div className="mb-3 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sky-950">
                          <div className="mb-2 font-semibold text-foreground">Identificação da bobina · dados da Cobrideira</div>
                          <div className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
                            <span><strong>Nº bobina:</strong> {origens[grupo.numero_normalizado]?.numero_bobina || grupo.numero_bobina}</span>
                            <span><strong>Código bobina:</strong> {origens[grupo.numero_normalizado]?.cod_bob || '—'}</span>
                            <span><strong>Data Cobrideira:</strong> {formatarData(origens[grupo.numero_normalizado]?.data ?? null)}</span>
                            <span><strong>Aba/período:</strong> {origens[grupo.numero_normalizado]?.aba || '—'}</span>
                            <span><strong>Material:</strong> {origens[grupo.numero_normalizado]?.material || grupo.linhas.at(-1)?.material || '—'}</span>
                            <span><strong>Largura:</strong> {formatar(origens[grupo.numero_normalizado]?.largura ?? grupo.linhas.at(-1)?.largura_jumbo_mm, ' mm')}</span>
                            <span><strong>Micragem:</strong> {formatar(origens[grupo.numero_normalizado]?.micragem, ' µ')}</span>
                            <span><strong>Peso bruto:</strong> {formatar(origens[grupo.numero_normalizado]?.peso_bruto, ' kg')}</span>
                            <span><strong>Peso final:</strong> {formatar(origens[grupo.numero_normalizado]?.peso_final, ' kg')}</span>
                            <span><strong>Peso cilindro:</strong> {formatar(origens[grupo.numero_normalizado]?.peso_cilindro, ' kg')}</span>
                            <span><strong>Peso líquido:</strong> {formatar(origens[grupo.numero_normalizado]?.peso_liquido ?? grupo.linhas.at(-1)?.peso_jumbo_kg, ' kg')}</span>
                            <span><strong>Metragem original:</strong> {formatar(origens[grupo.numero_normalizado]?.metragem ?? grupo.linhas.at(-1)?.metragem_bobina_m, ' m')}</span>
                            <span><strong>Perda Cobrideira:</strong> {formatar(origens[grupo.numero_normalizado]?.perda_kg, ' kg')}</span>
                            <span><strong>Fornecedor filme:</strong> {origens[grupo.numero_normalizado]?.fornecedor_filme || grupo.linhas.at(-1)?.fornec_filme || '—'}</span>
                            <span><strong>Vareta:</strong> {formatar(origens[grupo.numero_normalizado]?.vareta_g, ' g')}</span>
                            <span><strong>Cola:</strong> {formatar(origens[grupo.numero_normalizado]?.kg_cola, ' kg')}</span>
                            <span><strong>Lote cola:</strong> {origens[grupo.numero_normalizado]?.lote_cola || grupo.linhas.at(-1)?.lote_cola || '—'}</span>
                            <span><strong>Fornecedor cola:</strong> {origens[grupo.numero_normalizado]?.fornecedor_cola || grupo.linhas.at(-1)?.fornec_cola || '—'}</span>
                            <span><strong>Código interno:</strong> {origens[grupo.numero_normalizado]?.codigo_interno || '—'}</span>
                            <span><strong>Turno Cobrideira:</strong> {origens[grupo.numero_normalizado]?.turno || '—'}</span>
                            <span><strong>Linha:</strong> {origens[grupo.numero_normalizado]?.linha || grupo.linhas.at(-1)?.linha || '—'}</span>
                            <span><strong>Cor fundo:</strong> {origens[grupo.numero_normalizado]?.cor_fundo || grupo.linhas.at(-1)?.cor || '—'}</span>
                            <span><strong>Pigmento:</strong> {formatar(origens[grupo.numero_normalizado]?.pigmento_kg, ' kg')}</span>
                            <span><strong>Cor mistura:</strong> {origens[grupo.numero_normalizado]?.cor_mistura || '—'}</span>
                            <span><strong>Pigmento mistura:</strong> {origens[grupo.numero_normalizado]?.pigmento_mistura || '—'}</span>
                            <span><strong>Cliente:</strong> {origens[grupo.numero_normalizado]?.cliente || grupo.linhas.at(-1)?.cliente || '—'}</span>
                            <span><strong>Cor impressão:</strong> {origens[grupo.numero_normalizado]?.cor_impressao || '—'}</span>
                            <span><strong>Emenda:</strong> {origens[grupo.numero_normalizado]?.emenda == null ? '—' : origens[grupo.numero_normalizado]?.emenda ? 'SIM' : 'NÃO'}</span>
                            <span><strong>Código emenda:</strong> {origens[grupo.numero_normalizado]?.codigo_emenda || '—'}</span>
                            <span><strong>Operador:</strong> {origens[grupo.numero_normalizado]?.operador || '—'}</span>
                          </div>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-violet-300 bg-violet-50 p-2 text-violet-950"><table className="w-full min-w-[1400px] text-left text-xs">
                          <thead><tr className="text-muted-foreground"><th className="px-2 py-2">Data</th><th className="px-2 py-2">Máquina/turno</th><th className="px-2 py-2">Setup</th><th className="px-2 py-2">Medida/linha</th><th className="px-2 py-2">Caixas</th><th className="px-2 py-2">Pacotes</th><th className="px-2 py-2">Rolos</th><th className="px-2 py-2">Refugos</th><th className="px-2 py-2">Fitas</th><th className="px-2 py-2">Refilo kg</th><th className="px-2 py-2">Perda kg</th><th className="px-2 py-2">Metragem</th><th className="px-2 py-2">Devolvida</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Ação</th></tr></thead>
                          <tbody>{grupo.linhas.map((item) => <React.Fragment key={item.id}>
                            <tr className="border-t border-border"><td className="px-2 py-2">{formatarData(item.data)}</td><td className="px-2 py-2">{item.maquina ?? '—'} · {item.turno ?? '—'}</td><td className="px-2 py-2">{item.setup ? 'SIM' : 'NÃO'}</td><td className="px-2 py-2">{item.medida ?? '—'} · {item.linha === 'KIT' ? item.linha_detalhe ?? 'KIT' : item.linha}</td><td className="px-2 py-2">{formatar(item.caixas)}</td><td className="px-2 py-2">{formatar(item.pcts)}</td><td className="px-2 py-2">{formatar(item.rolos)}</td><td className="px-2 py-2">{formatar(item.refugos)}</td><td className="px-2 py-2">{formatar(item.fitas_rebobinadas)}</td><td className="px-2 py-2">{formatar(item.refilo_kg)}</td><td className="px-2 py-2">{formatar(item.perda_producao_kg)}</td><td className="px-2 py-2">{formatar(item.metragem_bobina_m, ' m')}</td><td className="px-2 py-2">{formatar(item.metragem_devolvida_m, ' m')}</td><td className="px-2 py-2">{statusLabel(item.status_baixa)}</td><td className="px-2 py-2"><button type="button" onClick={() => iniciarEdicao(item)} className="rounded-md border border-violet-300 bg-white px-2 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100">Editar</button></td></tr>
                          </React.Fragment>)}</tbody>
                        </table></div>
                      </td></tr>}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 text-xs text-muted-foreground">
            <span>{filtrados.length} bobina(s) · Página {paginaAtual + 1} de {totalPaginas}</span>
            <div className="flex gap-2"><button type="button" disabled={paginaAtual === 0} onClick={() => setPagina((p) => Math.max(0, p - 1))} className="rounded-md border border-border px-3 py-2 hover:bg-accent disabled:opacity-40">Anterior</button><button type="button" disabled={paginaAtual >= totalPaginas - 1} onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} className="rounded-md border border-border px-3 py-2 hover:bg-accent disabled:opacity-40">Próxima</button></div>
          </div>
        </section>



        </>)}

        <p className="text-xs leading-5 text-muted-foreground">A baixa é vinculada ao número da bobina e controlada pelo histórico de movimentações. Nenhuma movimentação pode deixar o saldo negativo.</p>
      {tela === 'historico' && bobinaEmEdicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card pb-3">
              <div><h3 className="font-semibold">Editar dados da produção</h3><p className="text-xs text-muted-foreground">Altere os campos preenchidos manualmente. A correção do número recompõe o saldo da bobina anterior.</p></div>
              <button type="button" onClick={() => setBobinaEmEdicao(null)} className="rounded-md p-2 hover:bg-accent" aria-label="Fechar"><X className="size-4" /></button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-sm"><span>Data</span><input type="date" value={form.data} onChange={e => setForm({...form,data:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Máquina</span><select value={form.maquina} onChange={e => setForm({...form,maquina:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3">{['M1','M2','M3','M4','M5','M6'].map(m=><option key={m}>{m}</option>)}</select></label>
              <label className="grid gap-1 text-sm"><span>Setup</span><select value={form.setup?'SIM':'NÃO'} onChange={e=>setForm({...form,setup:e.target.value==='SIM'})} className="h-10 rounded-lg border border-input bg-background px-3"><option>SIM</option><option>NÃO</option></select></label>
              <label className="grid gap-1 text-sm"><span>Nº da bobina</span><input value={novoNumeroBobina} onChange={e=>setNovoNumeroBobina(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm sm:col-span-2"><span>Produtos</span><select value={form.produto_codigo} onChange={e=>{const p=produtos.find(x=>x.codigo===e.target.value);setForm({...form,produto_codigo:e.target.value,medida:p?.descricao??form.medida})}} className="h-10 rounded-lg border border-input bg-background px-3"><option value={form.produto_codigo}>{form.medida || form.produto_codigo}</option>{produtos.filter(p=>p.codigo!==form.produto_codigo).map(p=><option key={p.codigo} value={p.codigo}>{p.descricao}</option>)}</select></label>
              <label className="grid gap-1 text-sm"><span>Material</span><input value={form.material} onChange={e=>setForm({...form,material:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Largura (mm)</span><input type="number" step="0.01" value={form.largura_jumbo_mm} onChange={e=>setForm({...form,largura_jumbo_mm:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Peso da bobina (kg)</span><input type="number" step="0.01" value={form.peso_jumbo_kg} onChange={e=>setForm({...form,peso_jumbo_kg:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Fornecedor do filme</span><input value={form.fornec_filme} onChange={e=>setForm({...form,fornec_filme:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Lote da cola</span><input value={form.lote_cola} onChange={e=>setForm({...form,lote_cola:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Fornecedor da cola</span><input value={form.fornec_cola} onChange={e=>setForm({...form,fornec_cola:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Cor</span><input value={form.cor} onChange={e=>setForm({...form,cor:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Linha</span><select value={form.linha} onChange={e=>setForm({...form,linha:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3"><option value="PADRÃO">Padrão</option><option value="PERSONALIZADA">Personalizada</option><option value="KIT">Kit</option></select></label>
              {form.linha==='KIT' && <label className="grid gap-1 text-sm"><span>Identificação do Kit</span><input value={form.linha_detalhe} onChange={e=>setForm({...form,linha_detalhe:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>}
              <label className="grid gap-1 text-sm"><span>Cliente</span><input value={form.cliente} onChange={e=>setForm({...form,cliente:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Caixas</span><input type="number" min="0" value={form.caixas} onChange={e=>setForm({...form,caixas:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Pacotes (pcts)</span><input type="number" min="0" value={form.pcts} onChange={e=>setForm({...form,pcts:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Rolos</span><input type="number" min="0" value={form.rolos} onChange={e=>setForm({...form,rolos:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Refugos</span><input type="number" min="0" step="0.01" value={form.refugos} onChange={e=>setForm({...form,refugos:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Fitas rebobinadas</span><input type="number" min="0" step="0.01" value={form.fitas_rebobinadas} onChange={e=>setForm({...form,fitas_rebobinadas:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Refilo (kg)</span><input type="number" min="0" step="0.001" value={form.refilo_kg} onChange={e=>setForm({...form,refilo_kg:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span>Perda de produção (kg)</span><input type="number" min="0" step="0.001" value={form.perda_producao_kg} onChange={e=>setForm({...form,perda_producao_kg:e.target.value})} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-4"><span>Observações</span><textarea value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})} rows={3} className="rounded-lg border border-input bg-background px-3 py-2" /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={() => setBobinaEmEdicao(null)} className="rounded-lg border border-border px-3 py-2 text-sm">Cancelar</button><button type="button" onClick={() => void salvarCorrecaoNumero()} disabled={salvando || !novoNumeroBobina.trim() || !form.produto_codigo} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{salvando ? 'Salvando...' : 'Salvar alterações'}</button></div>
          </section>
        </div>
      )}
      </main>
    </div>
  )
}

function ChartIcon() {
  return <ClipboardList className="size-4" />
}
