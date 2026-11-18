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
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  ajustarSaldoBobinaRebobinadeira,
  estornarProducaoRebobinadeira,
  importarCsvRebobinadeira,
  registrarProducaoRebobinadeira,
} from '@/lib/admin.functions'
import type {
  RebobinadeiraAlertaBobinaRow,
  RebobinadeiraProdutoRow,
  RebobinadeiraSaldoBobinaRow,
} from '@/lib/database.types'

type Props = {
  onChangeArea: () => void
  onBack: () => void
  isDeveloper: boolean
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
  return labels[status] ?? status
}

function statusClass(status: string) {
  if (status === 'CONSUMIDA' || status === 'ESTORNADA') return 'border-border bg-muted text-muted-foreground'
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

export function HistoricoProducao({ onChangeArea, onBack }: Props) {
  const [registros, setRegistros] = React.useState<ProducaoRow[]>([])
  const [alertas, setAlertas] = React.useState<RebobinadeiraAlertaBobinaRow[]>([])
  const [saldos, setSaldos] = React.useState<RebobinadeiraSaldoBobinaRow[]>([])
  const [produtos, setProdutos] = React.useState<RebobinadeiraProdutoRow[]>([])
  const [carregando, setCarregando] = React.useState(true)
  const [atualizando, setAtualizando] = React.useState(false)
  const [erro, setErro] = React.useState('')
  const [busca, setBusca] = React.useState('')
  const [statusFiltro, setStatusFiltro] = React.useState('')
  const [dataInicio, setDataInicio] = React.useState('')
  const [dataFim, setDataFim] = React.useState('')
  const [pagina, setPagina] = React.useState(0)
  const [detalheAberto, setDetalheAberto] = React.useState<number | null>(null)
  const [mostrarCadastro, setMostrarCadastro] = React.useState(false)
  const [mostrarAjuste, setMostrarAjuste] = React.useState(false)
  const [salvando, setSalvando] = React.useState(false)
  const [importando, setImportando] = React.useState(false)
  const [arquivo, setArquivo] = React.useState<File | null>(null)
  const [inputArquivoKey, setInputArquivoKey] = React.useState(0)
  const [motivoEstorno, setMotivoEstorno] = React.useState<Record<number, string>>({})
  const [estornoAberto, setEstornoAberto] = React.useState<number | null>(null)
  const [form, setForm] = React.useState({
    data: dataHoje(),
    maquina: 'M1',
    setup: false,
    numero_bobina: '',
    turno: '1º TURNO',
    produto_codigo: '',
    peso_jumbo_kg: '',
    metragem_bobina_m: '',
    metragem_unica_m: '',
    observacoes: '',
  })
  const [ajuste, setAjuste] = React.useState({
    numeroBobina: '',
    metrosDelta: '',
    pesoDelta: '',
    motivo: '',
  })

  const carregar = React.useCallback(async (silencioso = false) => {
    if (silencioso) setAtualizando(true)
    else setCarregando(true)
    setErro('')
    const [producao, alertasResult, saldosResult, produtosResult] = await Promise.all([
      supabase.schema('rebobinadeira').from('bobinas')
        .select('id,numero_bobina,numero_normalizado,data,maquina,setup,turno,material,produto_codigo,largura_jumbo_mm,peso_jumbo_kg,cor,linha,metragem_bobina_m,metragem_unica_m,status_baixa,metros_consumidos,peso_consumido_kg,observacoes')
        .order('data', { ascending: false }).order('id', { ascending: false }).range(0, 999),
      supabase.schema('rebobinadeira').from('alertas_bobinas')
        .select('*').eq('status', 'ABERTO').order('criado_em', { ascending: false }).limit(100),
      supabase.schema('rebobinadeira').from('vw_saldo_bobinas')
        .select('*').order('data', { ascending: false }).limit(500),
      supabase.schema('rebobinadeira').from('produtos_jumbo')
        .select('*').eq('ativo', true).order('descricao', { ascending: true }),
    ])
    const falhas = [producao.error, alertasResult.error, saldosResult.error, produtosResult.error].filter(Boolean)
    if (falhas.length) {
      const mensagem = falhas.map((item) => item?.message).filter(Boolean).join(' · ')
      setErro(mensagem || 'Não foi possível carregar os dados do histórico.')
      toast.error('Falha ao carregar o histórico de produção.', { description: mensagem })
    } else {
      setRegistros((producao.data ?? []) as ProducaoRow[])
      setAlertas((alertasResult.data ?? []) as RebobinadeiraAlertaBobinaRow[])
      setSaldos((saldosResult.data ?? []) as RebobinadeiraSaldoBobinaRow[])
      setProdutos((produtosResult.data ?? []) as RebobinadeiraProdutoRow[])
    }
    setCarregando(false)
    setAtualizando(false)
  }, [])

  React.useEffect(() => { void carregar() }, [carregar])

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    return registros.filter((item) => {
      const correspondeTexto = !termo || [
        item.numero_bobina, item.maquina, item.material, item.cor, item.linha, item.produto_codigo,
      ].some((valor) => String(valor ?? '').toLocaleLowerCase('pt-BR').includes(termo))
      const correspondeStatus = !statusFiltro || item.status_baixa === statusFiltro
      const correspondeInicio = !dataInicio || item.data >= dataInicio
      const correspondeFim = !dataFim || item.data <= dataFim
      return correspondeTexto && correspondeStatus && correspondeInicio && correspondeFim
    })
  }, [registros, busca, statusFiltro, dataInicio, dataFim])

  const porPagina = 30
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const paginaRegistros = filtrados.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina)
  const pendentes = registros.filter((item) => item.status_baixa === 'PENDENTE' || item.status_baixa === 'NAO_PROCESSADA').length
  const consumidas = saldos.filter((item) => item.status === 'CONSUMIDA').length
  const produtoSelecionado = produtos.find((item) => item.codigo === form.produto_codigo)

  async function obterToken() {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente no sistema.')
    return data.session.access_token
  }

  async function salvarProducao(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.produto_codigo) {
      toast.error('Selecione um produto cadastrado.')
      return
    }
    setSalvando(true)
    try {
      const accessToken = await obterToken()
      const resultado = await registrarProducaoRebobinadeira({
        data: {
          accessToken,
          registro: {
            data: form.data,
            maquina: form.maquina,
            setup: form.setup,
            numero_bobina: form.numero_bobina,
            turno: form.turno,
            produto_codigo: form.produto_codigo,
            peso_jumbo_kg: parseNumero(form.peso_jumbo_kg),
            metragem_bobina_m: parseNumero(form.metragem_bobina_m),
            metragem_unica_m: parseNumero(form.metragem_unica_m),
            observacoes: form.observacoes,
          },
        },
      })
      toast.success('Produção registrada.', { description: 'Registro #' + resultado.id + ' salvo. A baixa foi processada ou ficou pendente com alerta.' })
      setForm((atual) => ({ ...atual, numero_bobina: '', peso_jumbo_kg: '', metragem_bobina_m: '', metragem_unica_m: '', observacoes: '' }))
      setMostrarCadastro(false)
      await carregar(true)
    } catch (error) {
      toast.error('Não foi possível registrar a produção.', {
        description: error instanceof Error ? error.message : 'Verifique os campos e tente novamente.',
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
      toast.success('Importação concluída.', {
        description: resultado.gravadas + ' linhas gravadas; ' + resultado.rejeitadas + ' rejeitadas.',
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

  async function estornar(id: number) {
    const motivo = motivoEstorno[id]?.trim()
    if (!motivo) {
      toast.error('Informe o motivo do estorno.')
      return
    }
    setSalvando(true)
    try {
      const accessToken = await obterToken()
      await estornarProducaoRebobinadeira({ data: { accessToken, producaoId: id, motivo } })
      toast.success('Estorno registrado. O histórico foi preservado e o saldo foi recomposto.')
      setEstornoAberto(null)
      setMotivoEstorno((estado) => ({ ...estado, [id]: '' }))
      await carregar(true)
    } catch (error) {
      toast.error('Não foi possível estornar a produção.', {
        description: error instanceof Error ? error.message : 'Tente novamente.',
      })
    } finally {
      setSalvando(false)
    }
  }

  async function salvarAjuste(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const metrosDelta = parseNumero(ajuste.metrosDelta) ?? 0
    const pesoDelta = parseNumero(ajuste.pesoDelta) ?? 0
    if (metrosDelta === 0 && pesoDelta === 0) {
      toast.error('Informe uma diferença de metragem ou peso.')
      return
    }
    setSalvando(true)
    try {
      const accessToken = await obterToken()
      await ajustarSaldoBobinaRebobinadeira({
        data: {
          accessToken,
          numeroBobina: ajuste.numeroBobina,
          metrosDelta,
          pesoDelta,
          motivo: ajuste.motivo,
        },
      })
      toast.success('Ajuste registrado no livro de movimentações.')
      setAjuste({ numeroBobina: '', metrosDelta: '', pesoDelta: '', motivo: '' })
      setMostrarAjuste(false)
      await carregar(true)
    } catch (error) {
      toast.error('Não foi possível ajustar o saldo.', {
        description: error instanceof Error ? error.message : 'Verifique os dados e tente novamente.',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[96rem] flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/embalando-logo.svg" alt="Embalando Fitas Adesivas" className="h-12 w-48 object-contain" />
              <div>
                <h1 className="text-lg font-semibold leading-tight">Rebobinadeira</h1>
                <p className="text-xs text-muted-foreground">Histórico de produção e movimentações de bobinas</p>
              </div>
            </div>
            <button type="button" onClick={onChangeArea} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-black bg-black px-3 text-xs font-semibold text-white transition hover:bg-zinc-800">
              <ArrowLeft className="size-4" /> Trocar de setor
            </button>
          </div>
          <nav aria-label="Indicadores" className="flex items-center gap-2 border-t border-border pt-3">
            <button type="button" onClick={onBack} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-accent">
              <ChartIcon /> Estoque Mínimo
            </button>
            <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 text-sm font-semibold text-foreground">
              <History className="size-4" /> Histórico de produção
            </span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[96rem] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rebobinadeira / Histórico</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Histórico de produção</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Cada linha representa um lançamento. A mesma bobina pode aparecer várias vezes, e cada lançamento gera sua própria movimentação.
              Setup também consome a bobina.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setMostrarAjuste((v) => !v)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition hover:bg-accent">
              <SlidersHorizontal className="size-4" /> Ajustar saldo
            </button>
            <button type="button" onClick={() => setMostrarCadastro((v) => !v)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
              <Plus className="size-4" /> Nova produção
            </button>
            <button type="button" onClick={() => void carregar(true)} disabled={atualizando || carregando} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition hover:bg-accent disabled:opacity-50">
              <RefreshCw className={'size-4 ' + (atualizando ? 'animate-spin' : '')} /> Atualizar
            </button>
          </div>
        </div>

        {erro && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><strong>Falha ao carregar:</strong> {erro}</div>}

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold"><FileUp className="size-4" /> Importar planilha da Rebobinadeira</div>
              <p className="mt-1 text-xs text-muted-foreground">O CSV mantém todas as linhas, inclusive quando o mesmo número de bobina aparece mais de uma vez.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input key={inputArquivoKey} type="file" accept=".csv,text/csv" className="sr-only" id="historico-rebobinadeira-csv" onChange={(event) => setArquivo(event.target.files?.[0] ?? null)} />
              <label htmlFor="historico-rebobinadeira-csv" className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition hover:bg-accent">
                <FileUp className="size-4" /> {arquivo ? arquivo.name : 'Selecionar CSV'}
              </label>
              <button type="button" onClick={() => void importarArquivo()} disabled={!arquivo || importando} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
                {importando ? <RefreshCw className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                {importando ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </section>

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

        {mostrarCadastro && (
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h3 className="font-semibold">Registrar produção</h3><p className="text-xs text-muted-foreground">Se a bobina não estiver no estoque, o registro será salvo como pendente e gerará um alerta.</p></div>
              <button type="button" onClick={() => setMostrarCadastro(false)} aria-label="Fechar cadastro" className="rounded-lg p-2 transition hover:bg-accent"><X className="size-4" /></button>
            </div>
            <form onSubmit={(event) => void salvarProducao(event)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-sm"><span className="font-medium">Data</span><input required type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Máquina</span><input required value={form.maquina} onChange={(e) => setForm({ ...form, maquina: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" placeholder="M1" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Nº da bobina</span><input required value={form.numero_bobina} onChange={(e) => setForm({ ...form, numero_bobina: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" placeholder="Número da etiqueta" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Turno</span><select value={form.turno} onChange={(e) => setForm({ ...form, turno: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3"><option>1º TURNO</option><option>2º TURNO</option></select></label>
              <label className="grid gap-1 text-sm sm:col-span-2"><span className="font-medium">Produto cadastrado</span><select required value={form.produto_codigo} onChange={(e) => setForm({ ...form, produto_codigo: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3"><option value="">Selecione o produto</option>{produtos.map((p) => <option key={p.codigo} value={p.codigo}>{p.descricao}</option>)}</select></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Peso da bobina (kg)</span><input inputMode="decimal" value={form.peso_jumbo_kg} onChange={(e) => setForm({ ...form, peso_jumbo_kg: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" placeholder="Opcional" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Metragem da bobina (m)</span><input inputMode="decimal" value={form.metragem_bobina_m} onChange={(e) => setForm({ ...form, metragem_bobina_m: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" placeholder="Metragem informada" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Metragem utilizada (m)</span><input inputMode="decimal" value={form.metragem_unica_m} onChange={(e) => setForm({ ...form, metragem_unica_m: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" placeholder="Deixe vazio para gerar alerta" /></label>
              <label className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" checked={form.setup} onChange={(e) => setForm({ ...form, setup: e.target.checked })} className="size-5" /><span><strong>Setup = SIM</strong><span className="block text-xs text-muted-foreground">Também consome a bobina.</span></span></label>
              <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-4"><span className="font-medium">Observações</span><input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label>
              {produtoSelecionado && <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">Produto selecionado: {produtoSelecionado.material} · {produtoSelecionado.cor} · {produtoSelecionado.largura_jumbo_mm ?? '—'} mm · {produtoSelecionado.tipo_produto}</p>}
              <div className="flex flex-wrap justify-end gap-2 sm:col-span-2 lg:col-span-4">
                <button type="button" onClick={() => setMostrarCadastro(false)} className="min-h-10 rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-accent">Cancelar</button>
                <button type="submit" disabled={salvando} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"><Save className="size-4" /> {salvando ? 'Salvando...' : 'Salvar produção'}</button>
              </div>
            </form>
          </section>
        )}

        {mostrarAjuste && (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-amber-950">Ajuste manual de saldo</h3><p className="text-xs text-amber-900">O ajuste gera uma movimentação auditável e não permite saldo negativo.</p></div><button type="button" onClick={() => setMostrarAjuste(false)} className="rounded-lg p-2 hover:bg-amber-100"><X className="size-4" /></button></div>
            <form onSubmit={(event) => void salvarAjuste(event)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-sm"><span className="font-medium">Número da bobina</span><input required value={ajuste.numeroBobina} onChange={(e) => setAjuste({ ...ajuste, numeroBobina: e.target.value })} className="h-10 rounded-lg border border-input bg-white px-3" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Diferença em metros (+/-)</span><input required inputMode="decimal" value={ajuste.metrosDelta} onChange={(e) => setAjuste({ ...ajuste, metrosDelta: e.target.value })} className="h-10 rounded-lg border border-input bg-white px-3" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Diferença em kg (+/-)</span><input inputMode="decimal" value={ajuste.pesoDelta} onChange={(e) => setAjuste({ ...ajuste, pesoDelta: e.target.value })} className="h-10 rounded-lg border border-input bg-white px-3" /></label>
              <label className="grid gap-1 text-sm"><span className="font-medium">Motivo</span><input required minLength={3} value={ajuste.motivo} onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })} className="h-10 rounded-lg border border-input bg-white px-3" /></label>
              <div className="flex justify-end sm:col-span-2 lg:col-span-4"><button type="submit" disabled={salvando} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-900 px-4 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50"><Save className="size-4" /> {salvando ? 'Salvando...' : 'Registrar ajuste'}</button></div>
            </form>
          </section>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ClipboardList className="size-4" /> Lançamentos no histórico</div><p className="mt-2 text-2xl font-semibold tabular-nums">{numero.format(registros.length)}</p></article>
          <article className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Bell className="size-4" /> Alertas em aberto</div><p className="mt-2 text-2xl font-semibold tabular-nums">{numero.format(alertas.length)}</p></article>
          <article className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Package className="size-4" /> Bobinas consumidas</div><p className="mt-2 text-2xl font-semibold tabular-nums">{numero.format(consumidas)}</p><p className="mt-1 text-xs text-muted-foreground">{pendentes} lançamento(s) pendente(s) de conciliação</p></article>
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4">
            <div><h3 className="font-semibold">Lançamentos de produção</h3><p className="text-xs text-muted-foreground">A listagem preserva todas as linhas; números de bobina repetidos não são descartados.</p></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0) }} placeholder="Buscar bobina, máquina ou produto" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" /></label>
              <select value={statusFiltro} onChange={(e) => { setStatusFiltro(e.target.value); setPagina(0) }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="">Todos os status</option><option value="PENDENTE">Pendente</option><option value="NAO_PROCESSADA">Não processada</option><option value="DEVOLVIDA_PARCIAL">Devolvida parcialmente</option><option value="CONSUMIDA">Consumida</option><option value="ESTORNADA">Estornada</option></select>
              <input type="date" value={dataInicio} onChange={(e) => { setDataInicio(e.target.value); setPagina(0) }} aria-label="Data inicial" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
              <input type="date" value={dataFim} onChange={(e) => { setDataFim(e.target.value); setPagina(0) }} aria-label="Data final" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          {carregando ? <p className="p-10 text-center text-sm text-muted-foreground">Carregando histórico...</p> : paginaRegistros.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhum lançamento encontrado com os filtros atuais.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Bobina</th><th className="px-4 py-3">Máquina</th><th className="px-4 py-3">Setup</th><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Metros lançados</th><th className="px-4 py-3">Baixa realizada</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Ações</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {paginaRegistros.map((item) => (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-3">{formatarData(item.data)}</td>
                        <td className="px-4 py-3 font-mono font-semibold">{item.numero_bobina}</td>
                        <td className="px-4 py-3">{item.maquina ?? '—'} · {item.turno ?? '—'}</td>
                        <td className="px-4 py-3">{item.setup ? 'SIM' : 'NÃO'}</td>
                        <td className="px-4 py-3">{item.material} · {item.cor}</td>
                        <td className="px-4 py-3 tabular-nums">{formatar(item.metragem_unica_m ?? item.metragem_bobina_m, ' m')}</td>
                        <td className="px-4 py-3 tabular-nums">{formatar(item.metros_consumidos, ' m')}</td>
                        <td className="px-4 py-3"><span className={'inline-flex rounded-full border px-2 py-1 text-xs font-semibold ' + statusClass(item.status_baixa)}>{statusLabel(item.status_baixa)}</span></td>
                        <td className="px-4 py-3"><div className="flex items-center gap-2"><button type="button" onClick={() => setDetalheAberto(detalheAberto === item.id ? null : item.id)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent">{detalheAberto === item.id ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />} Detalhes</button>{item.status_baixa !== 'ESTORNADA' && <button type="button" onClick={() => setEstornoAberto(estornoAberto === item.id ? null : item.id)} className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1.5 text-xs text-red-800 hover:bg-red-50"><RotateCcw className="size-3" /> Estornar</button>}</div></td>
                      </tr>
                      {detalheAberto === item.id && <tr className="bg-muted/20"><td colSpan={9} className="px-4 py-3 text-xs"><div className="grid gap-2 sm:grid-cols-3"><span><strong>ID:</strong> {item.id}</span><span><strong>Nº normalizado:</strong> {item.numero_normalizado}</span><span><strong>Produto:</strong> {item.produto_codigo}</span><span><strong>Metragem bobina:</strong> {formatar(item.metragem_bobina_m, ' m')}</span><span><strong>Peso jumbo:</strong> {formatar(item.peso_jumbo_kg, ' kg')}</span><span><strong>Peso baixado:</strong> {formatar(item.peso_consumido_kg, ' kg')}</span></div>{item.observacoes && <p className="mt-2"><strong>Observações:</strong> {item.observacoes}</p>}</td></tr>}
                      {estornoAberto === item.id && <tr className="bg-red-50"><td colSpan={9} className="px-4 py-3"><div className="flex flex-col gap-2 sm:flex-row"><input value={motivoEstorno[item.id] ?? ''} onChange={(e) => setMotivoEstorno((estado) => ({ ...estado, [item.id]: e.target.value }))} placeholder="Motivo obrigatório do estorno" className="h-10 flex-1 rounded-lg border border-red-200 bg-white px-3 text-sm" /><button type="button" disabled={salvando} onClick={() => void estornar(item.id)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"><RotateCcw className="size-4" /> Confirmar estorno</button><button type="button" onClick={() => setEstornoAberto(null)} className="min-h-10 rounded-lg border border-red-200 px-3 text-sm hover:bg-red-100">Cancelar</button></div></td></tr>}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 text-xs text-muted-foreground">
            <span>{filtrados.length} lançamento(s) · Página {paginaAtual + 1} de {totalPaginas}</span>
            <div className="flex gap-2"><button type="button" disabled={paginaAtual === 0} onClick={() => setPagina((p) => Math.max(0, p - 1))} className="rounded-md border border-border px-3 py-2 hover:bg-accent disabled:opacity-40">Anterior</button><button type="button" disabled={paginaAtual >= totalPaginas - 1} onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} className="rounded-md border border-border px-3 py-2 hover:bg-accent disabled:opacity-40">Próxima</button></div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4"><h3 className="font-semibold">Saldo físico por bobina</h3><p className="text-xs text-muted-foreground">Saldo calculado pela soma das movimentações; o cadastro da Cobrideira é a entrada original do estoque.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Bobina</th><th className="px-4 py-3">Material</th><th className="px-4 py-3">Entrada</th><th className="px-4 py-3">Saldo em metros</th><th className="px-4 py-3">Saldo em kg</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-border">{saldos.slice(0, 30).map((item) => <tr key={item.numero_bobina}><td className="px-4 py-3 font-mono font-semibold">{item.numero_bobina}</td><td className="px-4 py-3">{item.material ?? '—'} · {item.largura_mm ?? '—'} mm</td><td className="px-4 py-3">{formatarData(item.data)}</td><td className="px-4 py-3 tabular-nums">{formatar(item.saldo_metros, ' m')}</td><td className="px-4 py-3 tabular-nums">{formatar(item.saldo_kg, ' kg')}</td><td className="px-4 py-3"><span className={'inline-flex rounded-full border px-2 py-1 text-xs font-semibold ' + statusClass(item.status)}>{statusLabel(item.status)}</span></td></tr>)}</tbody>
            </table>
          </div>
          {saldos.length > 30 && <p className="border-t border-border p-3 text-xs text-muted-foreground">Mostrando as 30 bobinas mais recentes de {saldos.length} no saldo atual.</p>}
        </section>

        <p className="text-xs leading-5 text-muted-foreground">A baixa usa a metragem única da linha; quando ela não existe, tenta a metragem da bobina e gera alerta se ambas estiverem vazias. O peso consumido é proporcional à metragem baixada em relação à metragem e ao peso líquido registrados na Cobrideira. A tolerância padrão é 10 metros. Nenhuma movimentação pode deixar o saldo negativo. O histórico e os estornos são preservados no banco.</p>
      </main>
    </div>
  )
}

function ChartIcon() {
  return <ClipboardList className="size-4" />
}
