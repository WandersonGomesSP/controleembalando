import * as React from 'react'
import {
  ArrowLeft,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  PackagePlus,
  Search,
  Save,
  RefreshCw,
  Trash2,
  RotateCcw,
  FileUp,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Field,
  Panel,
  PrimaryButton,
  SelectInput,
  TextInput,
} from '@/components/painel/fields'
import { supabase } from '@/lib/supabase'
import { synchronizeCobrideiraBobina, updateCobrideiraBobina, moveCobrideiraBobinaToTrash, listCobrideiraBobinasTrash, restoreCobrideiraBobinaFromTrash, permanentlyDeleteCobrideiraBobina } from '@/lib/admin.functions'
import type {
  CobrideiraBobinaInsert,
  CobrideiraBobinaRow,
  CobrideiraBobinaLixeiraRow,
} from '@/lib/database.types'

type FormularioBobina = {
  numeroBobina: string
  codBob: string
  data: string
  aba: string
  material: string
  largura: string
  pesoBruto: string
  pesoFinal: string
  pesoCilindro: string
  metragem: string
  perda: string
  fornecedorFilme: string
  vareta: string
  kgCola: string
  loteCola: string
  codigoInterno: string
  fornecedorCola: string
  turno: string
  linha: string
  corFundo: string
  pigmento: string
  corMistura: string
  pigmentoMistura: string
  cliente: string
  corImpressao: string
  emenda: string
  codigoEmenda: string
}

type Secao = 'cadastro' | 'registros' | 'lixeira'

type LinhaCSVPreparada = { linha: number; bobina: CobrideiraBobinaInsert | null; erro: string | null }

function normalizarCabecalhoCSV(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function analisarCSV(texto: string): string[][] {
  const primeiraLinha = texto.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
  const contar = (delimitador: string) => {
    let quantidade = 0
    let dentroDeAspas = false
    for (const caractere of primeiraLinha) {
      if (caractere === '"') dentroDeAspas = !dentroDeAspas
      else if (caractere === delimitador && !dentroDeAspas) quantidade++
    }
    return quantidade
  }
  const delimitador = ([',', ';', '\t']).sort((a, b) => contar(b) - contar(a))[0]
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const caractere = texto[i]
    if (caractere === '"') {
      if (aspas && texto[i + 1] === '"') { campo += '"'; i++ }
      else aspas = !aspas
    } else if (caractere === delimitador && !aspas) {
      linha.push(campo.trim()); campo = ''
    } else if ((caractere === '\n' || caractere === '\r') && !aspas) {
      if (caractere === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo.trim()); campo = ''
      if (linha.some((item) => item !== '')) linhas.push(linha)
      linha = []
    } else campo += caractere
  }
  linha.push(campo.trim())
  if (linha.some((item) => item !== '')) linhas.push(linha)
  return linhas
}

function numeroCSV(valor: string): number | null {
  let limpo = valor.trim().replace(/[R$\s]/g, '')
  if (!limpo) return null
  if (limpo.includes(',') && limpo.includes('.')) {
    limpo = limpo.lastIndexOf(',') > limpo.lastIndexOf('.')
      ? limpo.replace(/\./g, '').replace(',', '.')
      : limpo.replace(/,/g, '')
  } else if (limpo.includes(',')) limpo = limpo.replace(',', '.')
  const numeroConvertido = Number(limpo)
  return Number.isFinite(numeroConvertido) ? numeroConvertido : null
}

function dataCSV(valor: string): string {
  const v = valor.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [ano, mes, dia] = v.split('-').map(Number)
    const data = new Date(Date.UTC(ano, mes - 1, dia))
    return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia ? v : ''
  }
  const br = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3]
    const resultado = `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
    const [a, m, d] = resultado.split('-').map(Number)
    const data = new Date(Date.UTC(a, m - 1, d))
    return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d ? resultado : ''
  }
  return ''
}

function prepararLinhaCSV(cabecalhos: string[], valores: string[], linha: number): LinhaCSVPreparada {
  const aliases: Record<string, string[]> = {
    numero_bobina: ['numerobobina', 'nobobina', 'bobina', 'idp', 'numero', 'nbob', 'nbobina'],
    cod_bob: ['codbob', 'codbobina', 'codigobobina', 'codigoexterno', 'codigo'],
    data: ['data', 'dataproducao', 'datacad', 'datacadastro', 'datadecadastro'],
    aba: ['aba', 'periodo', 'mes', 'guiadestino'],
    material: ['material', 'filme', 'tipo'],
    largura: ['largura', 'larguramm'],
    micragem: ['micragem', 'micra', 'espessura'],
    peso_bruto: ['pesobruto', 'pesobrutokg', 'bruto'],
    peso_final: ['pesofinal', 'pesofinalkg', 'final'],
    peso_cilindro: ['pesocilindro', 'pesocilindrokg', 'cilindro'],
    metragem: ['metragem', 'metragemm', 'metragemmetros', 'metros'],
    perda_kg: ['perda', 'perdakg'],
    fornecedor_filme: ['fornecedorfilme', 'fornecedor'],
    vareta_g: ['vareta', 'varetag', 'gramasvareta'],
    kg_cola: ['kgcola', 'cola'],
    lote_cola: ['lotecola', 'lote'],
    codigo_interno: ['codigointerno', 'codinterno'],
    fornecedor_cola: ['fornecedorcola'],
    turno: ['turno'],
    linha: ['linha', 'tipolinha'],
    cor_fundo: ['corfundo', 'fundo'],
    pigmento_kg: ['pigmento', 'pigmentokg'],
    cor_mistura: ['cormistura'],
    pigmento_mistura: ['pigmentomistura'],
    cliente: ['cliente'],
    cor_impressao: ['corimpressao', 'impressao'],
    emenda: ['emenda'],
    codigo_emenda: ['codigoemenda', 'codemenda'],
  }
  const cab = cabecalhos.map(normalizarCabecalhoCSV)
  const obter = (campo: string) => {
    const indice = cab.findIndex((h) => aliases[campo]?.includes(h))
    return indice < 0 ? '' : String(valores[indice] ?? '').trim()
  }
  const texto = (campo: string, padrao = '') => obter(campo) || padrao
  const numerico = (campo: string, padrao = 0) => numeroCSV(obter(campo)) ?? padrao
  const larguraOriginal = obter('largura')
  let largura = numeroCSV(larguraOriginal)
  let micragem = numeroCSV(obter('micragem'))
  if (larguraOriginal && micragem === null) {
    const milhar = larguraOriginal.match(/^(\d{1,3})\.(\d{3}),(\d{1,2})$/)
    const medida = larguraOriginal.match(/^(\d+)[,.](\d{1,2})$/)
    if (milhar) {
      largura = Number(milhar[1] + milhar[2])
      micragem = Number(milhar[3].padEnd(2, '0'))
    } else if (medida) {
      largura = Number(medida[1])
      micragem = Number(medida[2].padEnd(2, '0'))
    }
  }
  micragem ??= 20
  const data = dataCSV(obter('data'))
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const abaAutomatica = data ? meses[Number(data.slice(5, 7)) - 1] + '/' + data.slice(2, 4) : ''
  const numeroBobina = texto('numero_bobina')
  const larguraInteira = Math.trunc(largura ?? 0)
  const cilindroPadrao = larguraInteira >= 1260 ? 5 : larguraInteira >= 1100 ? 4.8 : larguraInteira > 0 ? 3 : 0
  const micragemInteira = Math.trunc(micragem)
  const varetaPadrao = micragemInteira === 25 ? 22 : micragemInteira === 28 ? 28 : 18
  const vareta = Math.trunc(numerico('vareta_g', varetaPadrao))
  const turnoOriginal = texto('turno', '1º TURNO')
  const turnoNormalizado = normalizarCabecalhoCSV(turnoOriginal)
  const turno = ['2', 'segundo', 'segundoturno'].some((v) => turnoNormalizado.includes(v)) ? '2º TURNO'
    : ['1', 'primeiro', 'primeiroturno'].some((v) => turnoNormalizado.includes(v)) ? '1º TURNO'
    : turnoOriginal
  const linhaOriginal = texto('linha', 'Padrão')
  const linhaNormalizada = normalizarCabecalhoCSV(linhaOriginal)
  const linhaValor = linhaNormalizada === 'padrao' ? 'Padrão'
    : linhaNormalizada === 'personalizada' ? 'Personalizada'
    : linhaNormalizada === 'impressalinha' ? 'Impressa Linha'
    : linhaOriginal
  const emendaTexto = normalizarCabecalhoCSV(texto('emenda'))
  const bobina: CobrideiraBobinaInsert = {
    numero_bobina: numeroBobina,
    cod_bob: texto('cod_bob'),
    data,
    aba: texto('aba', abaAutomatica),
    material: texto('material', 'BOPP'),
    largura: larguraInteira,
    micragem: micragemInteira,
    peso_bruto: numerico('peso_bruto'),
    peso_final: numerico('peso_final'),
    peso_cilindro: numerico('peso_cilindro', cilindroPadrao),
    metragem: Math.trunc(numerico('metragem')),
    perda_kg: numerico('perda_kg'),
    fornecedor_filme: texto('fornecedor_filme', 'INNOVA'),
    vareta_g: vareta,
    kg_cola: numerico('kg_cola'),
    lote_cola: texto('lote_cola'),
    codigo_interno: texto('codigo_interno'),
    fornecedor_cola: texto('fornecedor_cola'),
    turno,
    linha: linhaValor,
    cor_fundo: texto('cor_fundo', 'CRISTAL'),
    pigmento_kg: numerico('pigmento_kg'),
    cor_mistura: texto('cor_mistura'),
    pigmento_mistura: texto('pigmento_mistura'),
    cliente: texto('cliente'),
    cor_impressao: texto('cor_impressao'),
    emenda: ['sim', 's', '1', 'true', 'yes'].includes(emendaTexto),
    codigo_emenda: texto('codigo_emenda'),
  }
  const erros: string[] = []
  if (!bobina.numero_bobina) erros.push('Número da bobina ausente')
  if (!bobina.cod_bob) erros.push('Código da bobina ausente')
  if (!bobina.data) erros.push('Data inválida ou ausente (use DD/MM/AAAA ou AAAA-MM-DD)')
  if (!bobina.aba) erros.push('Aba/período ausente e não foi possível derivá-lo da data')
  if (!bobina.material) erros.push('Material ausente')
  if (bobina.largura <= 0) erros.push('Largura inválida')
  if (bobina.micragem <= 0) erros.push('Micragem inválida')
  if (bobina.peso_final <= 0) erros.push('Peso final inválido')
  if (bobina.peso_cilindro < 0 || bobina.peso_final <= bobina.peso_cilindro) erros.push('Peso do cilindro/peso final inválido')
  if (bobina.perda_kg < 0 || bobina.kg_cola < 0 || bobina.pigmento_kg < 0) erros.push('Perda, cola e pigmento não podem ser negativos')
  if (bobina.metragem <= 0) erros.push('Metragem inválida')
  if (!bobina.fornecedor_filme) erros.push('Fornecedor do filme ausente')
  if (![16, 18, 20, 22, 26, 28].includes(bobina.vareta_g)) erros.push('Vareta deve ser 16, 18, 20, 22, 26 ou 28 g')
  if (!['1º TURNO', '2º TURNO'].includes(bobina.turno)) erros.push('Turno deve ser 1º TURNO ou 2º TURNO')
  if (!['Padrão', 'Personalizada', 'Impressa Linha'].includes(bobina.linha)) erros.push('Linha deve ser Padrão, Personalizada ou Impressa Linha')
  if (!bobina.cor_fundo) erros.push('Cor de fundo ausente')
  if (bobina.emenda && !bobina.codigo_emenda) erros.push('Código da emenda ausente')
  return { linha, bobina: erros.length ? null : bobina, erro: erros.length ? erros.join('; ') : null }
}

const LARGURAS = [
  '980.20',
  '980.25',
  '980.28',
  '1020.20',
  '1200.20',
  '1265.20',
  '1270.20',
  '1270.25',
]
const FORNECEDORES_FILME = ['INNOVA', 'TITAN', 'JHP']
const VARETAS = ['16', '18', '20', '22', '26', '28']
const LINHAS = ['Padrão', 'Personalizada', 'Impressa Linha']

function dataLocalHoje() {
  const data = new Date()
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset())
  return data.toISOString().slice(0, 10)
}

function abaMesAtual() {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const agora = new Date()
  return `${meses[agora.getMonth()]}/${String(agora.getFullYear()).slice(-2)}`
}

function formularioInicial(): FormularioBobina {
  return {
    numeroBobina: '',
    codBob: '',
    data: dataLocalHoje(),
    aba: abaMesAtual(),
    material: 'BOPP',
    largura: '980.20',
    pesoBruto: '',
    pesoFinal: '',
    pesoCilindro: '3',
    metragem: '',
    perda: '',
    fornecedorFilme: 'INNOVA',
    vareta: '18',
    kgCola: '',
    loteCola: '',
    codigoInterno: '',
    fornecedorCola: '',
    turno: '1º TURNO',
    linha: 'Padrão',
    corFundo: 'CRISTAL',
    pigmento: '',
    corMistura: '',
    pigmentoMistura: '',
    cliente: '',
    corImpressao: '',
    emenda: 'NÃO',
    codigoEmenda: '',
  }
}

function numero(valor: string) {
  const resultado = Number(valor.trim().replace(',', '.'))
  return Number.isFinite(resultado) ? resultado : null
}

function numeroCampo(valor: string, rotulo: string, padrao = 0) {
  if (!valor.trim()) return padrao
  const resultado = numero(valor)
  if (resultado === null || resultado < 0) {
    throw new Error(`Confira o campo ${rotulo}.`)
  }
  return resultado
}

function pesoCilindroPadrao(largura: string) {
  if (largura.startsWith('980')) return '3'
  if (largura.startsWith('1200')) return '4.8'
  if (largura.startsWith('1265') || largura.startsWith('1270')) return '5'
  return ''
}

function varetaPadrao(largura: string) {
  if (largura.endsWith('.20')) return '18'
  if (largura.endsWith('.25')) return '22'
  if (largura.endsWith('.28')) return '28'
  return ''
}

function formatarPeso(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor)
}

function formatarData(valor: string) {
  return new Date(`${valor}T00:00:00`).toLocaleDateString('pt-BR')
}

function erroMensagem(error: unknown) {
  if (error instanceof Error) {
    const detalhes = [error.name, error.message, error.stack].filter(Boolean).join('\n')
    return detalhes || String(error)
  }
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    } catch {
      return String(error)
    }
  }
  return String(error ?? 'Erro desconhecido (sem detalhes retornados).')
}

function CampoDecimal({
  id,
  label,
  value,
  onChange,
  required = false,
  readOnly = false,
}: {
  id: string
  label: string
  value: string
  onChange?: (value: string) => void
  required?: boolean
  readOnly?: boolean
}) {
  return (
    <Field label={label} htmlFor={id}>
      <TextInput
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        required={required}
        readOnly={readOnly}
        className={readOnly ? 'bg-muted font-semibold' : ''}
      />
    </Field>
  )
}

export function CobrideiraArea({ onChangeArea }: { onChangeArea: () => void }) {
  const [secao, setSecao] = React.useState<Secao>('cadastro')
  const [form, setForm] = React.useState(formularioInicial)
  const [registros, setRegistros] = React.useState<CobrideiraBobinaRow[]>([])
  const [itensLixeira, setItensLixeira] = React.useState<CobrideiraBobinaLixeiraRow[]>([])
  const [carregandoLixeira, setCarregandoLixeira] = React.useState(false)
  const [busca, setBusca] = React.useState('')
  const [dataInicial, setDataInicial] = React.useState('')
  const [dataFinal, setDataFinal] = React.useState('')
  const [turnoFiltro, setTurnoFiltro] = React.useState('')
  const [fornecedorFiltro, setFornecedorFiltro] = React.useState('')
  const [linhaFiltro, setLinhaFiltro] = React.useState('')
  const [carregando, setCarregando] = React.useState(true)
  const [salvando, setSalvando] = React.useState(false)
  const [sincronizandoBobina, setSincronizandoBobina] = React.useState<string | null>(null)
  const [logSincronizacao, setLogSincronizacao] = React.useState<string[]>([])
  const [editandoNumero, setEditandoNumero] = React.useState<string | null>(null)
  const [erroConsulta, setErroConsulta] = React.useState('')
  const [ordenacao, setOrdenacao] = React.useState<{ campo: keyof CobrideiraBobinaRow; asc: boolean }>({ campo: 'data', asc: false })
  const [modoVisualizacao, setModoVisualizacao] = React.useState<'lista' | 'cards'>('lista')
  const [registrosExpandidos, setRegistrosExpandidos] = React.useState<Set<string>>(() => new Set())
  const [selecionadas, setSelecionadas] = React.useState<Set<string>>(() => new Set())
  const [csvLinhas, setCsvLinhas] = React.useState<LinhaCSVPreparada[]>([])
  const [csvNome, setCsvNome] = React.useState('')
  const [importandoCSV, setImportandoCSV] = React.useState(false)
  const [mostrarPreviaCSV, setMostrarPreviaCSV] = React.useState(false)

  function pesoBrutoContabilizado(registro: CobrideiraBobinaRow) {
    const codigo = registro.cod_bob.trim().toLocaleUpperCase('pt-BR')
    if (!codigo) return Number(registro.peso_bruto)
    const primeiraComPeso = registros
      .filter((item) =>
        item.cod_bob.trim().toLocaleUpperCase('pt-BR') === codigo &&
        Number(item.peso_bruto) > 0
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    return primeiraComPeso?.numero_bobina === registro.numero_bobina
      ? Number(registro.peso_bruto)
      : 0
  }

  function alternarExpansao(numeroBobina: string) {
    setRegistrosExpandidos((atuais) => {
      const novos = new Set(atuais)
      if (novos.has(numeroBobina)) novos.delete(numeroBobina)
      else novos.add(numeroBobina)
      return novos
    })
  }

  const pesoLiquido = (() => {
    const final = numero(form.pesoFinal)
    const cilindro = numero(form.pesoCilindro)
    if (final === null || cilindro === null) return ''
    return formatarPeso(final - cilindro)
  })()
  const clienteVisivel = form.linha !== 'Padrão'
  const corImpressaoVisivel =
    form.linha === 'Personalizada' || form.linha === 'Impressa Linha'
  const registrosFiltrados = registros.filter((registro) => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    const correspondeBusca =
      !termo ||
      registro.numero_bobina.toLocaleLowerCase('pt-BR').includes(termo) ||
      registro.cod_bob.toLocaleLowerCase('pt-BR').includes(termo) ||
      registro.cliente.toLocaleLowerCase('pt-BR').includes(termo)
    return (
      correspondeBusca &&
      (!dataInicial || registro.data >= dataInicial) &&
      (!dataFinal || registro.data <= dataFinal) &&
      (!turnoFiltro || registro.turno === turnoFiltro) &&
      (!fornecedorFiltro || registro.fornecedor_filme === fornecedorFiltro) &&
      (!linhaFiltro || registro.linha === linhaFiltro)
    )
  })
  const registrosOrdenados = [...registrosFiltrados].sort((a, b) => {
    const av = a[ordenacao.campo]
    const bv = b[ordenacao.campo]
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR', { numeric: true })
    return ordenacao.asc ? cmp : -cmp
  })


  async function consultarRegistros() {
    const todos: CobrideiraBobinaRow[] = []
    const tamanhoPagina = 1000
    for (let inicio = 0; ; inicio += tamanhoPagina) {
      const { data, error } = await supabase
        .schema('cobrideira')
        .from('bobinas')
        .select('*')
        .order('data', { ascending: false })
        .order('numero_bobina', { ascending: false })
        .range(inicio, inicio + tamanhoPagina - 1)
      if (error) throw error
      todos.push(...(data ?? []))
      if (!data || data.length < tamanhoPagina) break
    }
    return todos
  }

  React.useEffect(() => {
    let ativa = true
    consultarRegistros()
      .then((data) => {
        if (ativa) setRegistros(data)
      })
      .catch((error: unknown) => {
        if (ativa) {
          setErroConsulta(
            `Não foi possível carregar as bobinas. Confira a migração e a exposição do schema Cobrideira no Supabase. ${erroMensagem(error)}`,
          )
        }
      })
      .finally(() => {
        if (ativa) setCarregando(false)
      })
    return () => {
      ativa = false
    }
  }, [])

  async function carregarRegistros() {
    setCarregando(true)
    setErroConsulta('')
    try {
      setRegistros(await consultarRegistros())
    } catch (error: unknown) {
      setErroConsulta(
        `Não foi possível carregar as bobinas. Confira a migração e a exposição do schema Cobrideira no Supabase. ${erroMensagem(error)}`,
      )
    } finally {
      setCarregando(false)
    }
  }
  async function sincronizarBobina(registro: CobrideiraBobinaRow) {
    setSincronizandoBobina(registro.numero_bobina)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente para sincronizar.')
      const resultado = await synchronizeCobrideiraBobina({ data: { accessToken: sessionData.session.access_token, numeroBobina: registro.numero_bobina } })
      const planilha = `Planilha de destino: ${resultado.spreadsheetName ?? 'Nome não informado'}`
      const linkPlanilha = resultado.spreadsheetUrl ? `Abrir planilha: ${resultado.spreadsheetUrl}` : ''
      const linhas = resultado.logBobinas?.map((item) => `Bobina ${item.numeroBobina}: guia ${item.guia}, linha ${item.linha} (${item.status})`) ?? []
      const guiasCriadas = resultado.guiasCriadas?.length ? `Guias criadas: ${resultado.guiasCriadas.join(', ')}.` : ''
      setLogSincronizacao([planilha, linkPlanilha, guiasCriadas, ...linhas].filter(Boolean))
      toast.success('Bobina ' + registro.numero_bobina + ' sincronizada.', {
        description: [planilha, linkPlanilha, guiasCriadas, ...linhas].filter(Boolean).join(' · ') || 'Sincronização concluída.',
        duration: 20000,
      })
    } catch (error: unknown) {
      console.error('[COBRIDEIRA] Erro real ao sincronizar bobina ' + registro.numero_bobina, error)
      toast.error('ERRO AO SINCRONIZAR BOBINA ' + registro.numero_bobina, { description: erroMensagem(error), duration: 15000 })
    } finally {
      setSincronizandoBobina(null)
    }
  }


  async function tokenAtual() {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session?.access_token) throw new Error('Sessão expirada. Entre novamente.')
    return data.session.access_token
  }

  async function moverParaLixeira(registro: CobrideiraBobinaRow) {
    if (!window.confirm(`Mover a bobina ${registro.numero_bobina} para a lixeira? Ela poderá ser restaurada depois.`)) return
    try {
      await moveCobrideiraBobinaToTrash({ data: { accessToken: await tokenAtual(), numeroBobina: registro.numero_bobina } })
      setRegistros((atuais) => atuais.filter((item) => item.numero_bobina !== registro.numero_bobina))
      toast.success(`Bobina ${registro.numero_bobina} movida para a lixeira.`)
    } catch (error) {
      toast.error('Não foi possível mover para a lixeira', { description: erroMensagem(error), duration: 15000 })
    }
  }

  function alternarSelecao(numeroBobina: string) {
    setSelecionadas((atuais) => {
      const novas = new Set(atuais)
      if (novas.has(numeroBobina)) novas.delete(numeroBobina)
      else novas.add(numeroBobina)
      return novas
    })
  }

  function selecionarVisiveis(checked: boolean) {
    setSelecionadas((atuais) => {
      const novas = new Set(atuais)
      registrosOrdenados.forEach((registro) => checked ? novas.add(registro.numero_bobina) : novas.delete(registro.numero_bobina))
      return novas
    })
  }

  async function moverSelecionadasParaLixeira() {
    const numeros = [...selecionadas]
    if (!numeros.length) return
    if (!window.confirm(`Mover ${numeros.length} bobina(s) selecionada(s) para a lixeira?`)) return
    let sucesso = 0
    const falhas: string[] = []
    for (const numeroBobina of numeros) {
      try {
        await moveCobrideiraBobinaToTrash({ data: { accessToken: await tokenAtual(), numeroBobina } })
        sucesso++
      } catch (error) { falhas.push(`${numeroBobina}: ${erroMensagem(error)}`) }
    }
    if (sucesso) setRegistros((atuais) => atuais.filter((item) => !numeros.includes(item.numero_bobina) || falhas.some((f) => f.startsWith(`${item.numero_bobina}:`))))
    setSelecionadas(new Set())
    if (falhas.length) toast.error(`${sucesso} movida(s); ${falhas.length} falha(s). ${falhas.slice(0, 3).join(' | ')}`, { duration: 20000 })
    else toast.success(`${sucesso} bobina(s) movida(s) para a lixeira.`)
  }

  async function lerArquivoCSV(arquivo?: File) {
    if (!arquivo) return
    try {
      const linhas = analisarCSV(await arquivo.text())
      if (linhas.length < 2) throw new Error('O arquivo precisa ter cabeçalho e pelo menos uma linha de dados.')
      const preparadas = linhas.slice(1).map((valores, indice) => prepararLinhaCSV(linhas[0], valores, indice + 2))
      const ids = new Set<string>()
      const pesoPorCodigo = new Map<string, number>()
      for (const registro of [...registros].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        const codigo = registro.cod_bob.trim().toLocaleUpperCase('pt-BR')
        if (codigo && Number(registro.peso_bruto) > 0 && !pesoPorCodigo.has(codigo)) {
          pesoPorCodigo.set(codigo, Number(registro.peso_bruto))
        }
      }
      const revisadas: LinhaCSVPreparada[] = preparadas.map((item) => {
        if (!item.bobina) return item
        const id = item.bobina.numero_bobina.trim()
        if (ids.has(id) || registros.some((registro) => registro.numero_bobina === id)) {
          ids.add(id)
          return { ...item, bobina: null, erro: null }
        }
        ids.add(id)
        const codigo = item.bobina.cod_bob.trim().toLocaleUpperCase('pt-BR')
        const pesoConhecido = codigo ? pesoPorCodigo.get(codigo) : undefined
        const pesoInformado = Number(item.bobina.peso_bruto)
        const pesoBruto = pesoConhecido && pesoConhecido > 0
          ? pesoConhecido
          : pesoInformado > 0 ? pesoInformado : undefined
        if (codigo && pesoBruto && pesoBruto > 0) pesoPorCodigo.set(codigo, pesoBruto)
        if (!pesoBruto || pesoBruto <= 0) {
          return { ...item, bobina: null, erro: `Peso bruto não encontrado para o código ${item.bobina.cod_bob}` }
        }
        return { ...item, bobina: { ...item.bobina, peso_bruto: pesoBruto }, erro: null }
      })
      setCsvLinhas(revisadas)
      setCsvNome(arquivo.name)
      setMostrarPreviaCSV(true)
      const validas = revisadas.filter((item) => item.bobina).length
      const pendencias = revisadas.filter((item) => item.erro).length
      toast.success(`CSV lido: ${validas} nova(s) para importar, ${revisadas.length - validas - pendencias} já cadastrada(s), ${pendencias} pendência(s).`)
    } catch (error) {
      toast.error('Não foi possível ler o CSV', { description: erroMensagem(error), duration: 12000 })
    }
  }

  async function importarCSVParaBanco() {
    const validas = csvLinhas.flatMap((item) => item.bobina ? [item.bobina] : [])
    if (!validas.length) return toast.error('Não há linhas válidas para importar.')
    if (!window.confirm(`Importar ${validas.length} bobina(s) para o Supabase? Registros existentes não serão sobrescritos.`)) return
    setImportandoCSV(true)
    let inseridas = 0
    try {
      for (let inicio = 0; inicio < validas.length; inicio += 100) {
        const lote = validas.slice(inicio, inicio + 100)
        const { data, error } = await supabase.schema('cobrideira').from('bobinas')
          .upsert(lote, { onConflict: 'numero_bobina', ignoreDuplicates: true })
          .select('numero_bobina')
        if (error) throw error
        inseridas += data?.length ?? lote.length
      }
      toast.success(`${inseridas} bobina(s) importada(s) para o Supabase.`)
      setMostrarPreviaCSV(false)
      setCsvLinhas([])
      setCsvNome('')
      await carregarRegistros()
    } catch (error) {
      toast.error(`Importação interrompida após ${inseridas} registro(s).`, { description: erroMensagem(error), duration: 20000 })
      await carregarRegistros()
    } finally { setImportandoCSV(false) }
  }

  async function carregarLixeira() {
    setCarregandoLixeira(true)
    try {
      const rows = await listCobrideiraBobinasTrash({ data: { accessToken: await tokenAtual() } })
      setItensLixeira(rows as CobrideiraBobinaLixeiraRow[])
    } catch (error) {
      toast.error('Não foi possível carregar a lixeira', { description: erroMensagem(error), duration: 15000 })
    } finally {
      setCarregandoLixeira(false)
    }
  }

  async function restaurarDaLixeira(numeroBobina: string) {
    try {
      await restoreCobrideiraBobinaFromTrash({ data: { accessToken: await tokenAtual(), numeroBobina } })
      toast.success(`Bobina ${numeroBobina} restaurada.`)
      await carregarLixeira()
      await carregarRegistros()
    } catch (error) {
      toast.error('Não foi possível restaurar a bobina', { description: erroMensagem(error), duration: 15000 })
    }
  }

  async function excluirDefinitivamente(numeroBobina: string) {
    if (!window.confirm(`Excluir DEFINITIVAMENTE a bobina ${numeroBobina}? Esta ação não pode ser desfeita.`)) return
    try {
      await permanentlyDeleteCobrideiraBobina({ data: { accessToken: await tokenAtual(), numeroBobina } })
      setItensLixeira((atuais) => atuais.filter((item) => item.numero_bobina !== numeroBobina))
      toast.success(`Bobina ${numeroBobina} excluída definitivamente.`)
    } catch (error) {
      toast.error('Não foi possível excluir definitivamente', { description: erroMensagem(error), duration: 15000 })
    }
  }

  function atualizar<K extends keyof FormularioBobina>(
    campo: K,
    valor: FormularioBobina[K],
  ) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
  }

  function iniciarEdicao(registro: CobrideiraBobinaRow) {
    setForm({
      numeroBobina: registro.numero_bobina,
      codBob: registro.cod_bob ?? '',
      data: registro.data,
      aba: registro.aba ?? '',
      material: registro.material ?? '',
      largura: `${Math.trunc(Number(registro.largura ?? 0))}.${String(registro.micragem ?? 20).padStart(2, '0')}`,
      pesoBruto: String(registro.peso_bruto ?? ''),
      pesoFinal: String(registro.peso_final ?? ''),
      pesoCilindro: String(registro.peso_cilindro ?? ''),
      metragem: String(registro.metragem ?? ''),
      perda: String(registro.perda_kg ?? ''),
      fornecedorFilme: registro.fornecedor_filme ?? '',
      vareta: String(registro.vareta_g ?? ''),
      kgCola: String(registro.kg_cola ?? ''),
      loteCola: registro.lote_cola ?? '',
      codigoInterno: registro.codigo_interno ?? '',
      fornecedorCola: registro.fornecedor_cola ?? '',
      turno: registro.turno ?? '',
      linha: registro.linha ?? '',
      corFundo: registro.cor_fundo ?? '',
      pigmento: String(registro.pigmento_kg ?? ''),
      corMistura: registro.cor_mistura ?? '',
      pigmentoMistura: registro.pigmento_mistura ?? '',
      cliente: registro.cliente ?? '',
      corImpressao: registro.cor_impressao ?? '',
      emenda: registro.emenda ? 'SIM' : 'NÃO',
      codigoEmenda: registro.codigo_emenda ?? '',
    })
    setEditandoNumero(registro.numero_bobina)
    setSecao('cadastro')
  }

  function cancelarEdicao() {
    setEditandoNumero(null)
    setForm(formularioInicial())
  }

  async function salvar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const codigoNormalizado = form.codBob.trim().toLocaleUpperCase('pt-BR')
    const pesoBrutoConhecido = [...registros]
      .filter((registro) =>
        registro.cod_bob.trim().toLocaleUpperCase('pt-BR') === codigoNormalizado &&
        Number(registro.peso_bruto) > 0
      )
      .sort((x, y) => x.created_at.localeCompare(y.created_at))[0]?.peso_bruto
    const brutoInformado = numero(form.pesoBruto)
    const bruto = pesoBrutoConhecido !== undefined ? Number(pesoBrutoConhecido) : brutoInformado
    const final = numero(form.pesoFinal)
    const cilindro = numero(form.pesoCilindro)
    const metragem = Number.parseInt(form.metragem, 10)
    if (bruto === null || bruto <= 0)
      return toast.error('Informe um peso bruto válido.')
    if (final === null || final <= 0)
      return toast.error('Informe um peso final válido.')
    if (cilindro === null || cilindro < 0)
      return toast.error('Informe um peso de cilindro válido.')
    if (final <= cilindro)
      return toast.error('O peso final deve ser maior que o peso do cilindro.')
    if (!Number.isInteger(metragem) || metragem <= 0)
      return toast.error('Informe uma metragem válida.')
    if (form.emenda === 'SIM' && !form.codigoEmenda.trim()) {
      return toast.error('Informe o código da emenda.')
    }

    const avisos: string[] = []
    if (metragem > 7000) avisos.push('Metragem maior que 7000.')
    if (metragem < 1000) avisos.push('Metragem menor que 4 dígitos.')
    if (String(Math.trunc(bruto)).length > 3)
      avisos.push('Peso bruto tem mais de 3 dígitos.')
    if (String(Math.trunc(final)).length > 3)
      avisos.push('Peso final tem mais de 3 dígitos.')
    const cilindroEsperado = pesoCilindroPadrao(form.largura)
    if (cilindroEsperado && cilindro !== Number(cilindroEsperado)) {
      avisos.push('Peso do cilindro diverge do padrão da largura selecionada.')
    }
    const varetaEsperada = varetaPadrao(form.largura)
    if (varetaEsperada && form.vareta !== varetaEsperada) {
      avisos.push('Vareta diverge do padrão da largura selecionada.')
    }
    if (
      avisos.length &&
      !window.confirm(
        `Atenção:\n${avisos.map((item) => `- ${item}`).join('\n')}\n\nDeseja continuar mesmo assim?`,
      )
    ) {
      return
    }

    setSalvando(true)
    try {
      const insercao: CobrideiraBobinaInsert = {
        numero_bobina: form.numeroBobina.trim(),
        cod_bob: form.codBob.trim(),
        data: form.data,
        aba: form.aba.trim(),
        material: form.material.trim(),
        largura: Math.trunc(Number(form.largura)),
        micragem: Number(form.largura.split('.')[1]),
        peso_bruto: bruto,
        peso_final: final,
        peso_cilindro: cilindro,
        metragem,
        perda_kg: numeroCampo(form.perda, 'perda'),
        fornecedor_filme: form.fornecedorFilme,
        vareta_g: Number(form.vareta),
        kg_cola: numeroCampo(form.kgCola, 'kg de cola'),
        lote_cola: form.loteCola.trim(),
        codigo_interno: form.codigoInterno.trim(),
        fornecedor_cola: form.fornecedorCola.trim(),
        turno: form.turno,
        linha: form.linha,
        cor_fundo: form.corFundo.trim(),
        pigmento_kg: numeroCampo(form.pigmento, 'pigmento'),
        cor_mistura: form.corMistura.trim(),
        pigmento_mistura: form.pigmentoMistura.trim(),
        cliente: form.cliente.trim(),
        cor_impressao: form.corImpressao.trim(),
        emenda: form.emenda === 'SIM',
        codigo_emenda: form.codigoEmenda.trim(),
      }
      const resultado = editandoNumero
        ? { data: await (async () => {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
            if (sessionError) throw sessionError
            if (!sessionData.session?.access_token) throw new Error('AUTH_SESSION_MISSING: sessão não encontrada; entre novamente no sistema.')
            return updateCobrideiraBobina({
              data: {
                accessToken: sessionData.session.access_token,
                numeroOriginal: editandoNumero,
                bobina: insercao,
              },
            })
          })(), error: null }
        : await supabase
            .schema('cobrideira')
            .from('bobinas')
            .insert(insercao)
            .select('*')
            .single()
      if (resultado.error) throw resultado.error
      if (editandoNumero) {
        setRegistros((atuais) =>
          atuais.map((registro) =>
            registro.numero_bobina === editandoNumero ? resultado.data : registro,
          ),
        )
        toast.success('Dados da bobina atualizados.')
      } else {
        setRegistros((atuais) => [resultado.data, ...atuais])
        toast.success('Bobina cadastrada na Cobrideira.')
      }
      setEditandoNumero(null)
      setForm(formularioInicial())
      setSecao('registros')
    } catch (error: unknown) {
      console.error('[COBRIDEIRA] Erro real ao ' + (editandoNumero ? 'editar' : 'cadastrar') + ' bobina', {
        numeroOriginal: editandoNumero,
        numeroInformado: form.numeroBobina,
        error,
      })
      toast.error('ERRO AO ' + (editandoNumero ? 'EDITAR' : 'CADASTRAR') + ' BOBINA', {
        description: erroMensagem(error),
        duration: 20000,
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-0 bg-transparent shadow-none">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-3 px-4 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                <PackagePlus className="size-5" />
              </span>
              <div>
                <h1 className="text-lg leading-tight font-semibold tracking-tight">
                  Cobrideira
                </h1>
                <p className="text-xs text-muted-foreground">
                  Cadastro e controle de bobinas
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onChangeArea}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border-0 bg-[#e3262e] px-4 text-xs font-bold text-black shadow-sm transition-colors hover:bg-[#ff3b42] hover:text-black"
            >
              <ArrowLeft className="size-4" />
              Trocar setor
            </button>
          </div>
          <nav aria-label="Menus da Cobrideira" className="flex flex-wrap gap-2 pb-3">
            <button
              type="button"
              aria-current={secao === 'cadastro' ? 'page' : undefined}
              onClick={() => setSecao('cadastro')}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium ${secao === 'cadastro' ? 'bg-[#e3262e] text-black shadow-sm' : 'bg-[#e3262e] text-black hover:bg-[#ff3b42]'}`}
            >
              <PackagePlus className="size-4" />
              Cadastrar bobina
            </button>
            <button
              type="button"
              aria-current={secao === 'registros' ? 'page' : undefined}
              onClick={() => setSecao('registros')}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium ${secao === 'registros' ? 'bg-[#e3262e] text-black shadow-sm' : 'bg-[#e3262e] text-black hover:bg-[#ff3b42]'}`}
            >
              <ClipboardList className="size-4" />
              Bobinas registradas
            </button>
            <button type="button" aria-current={secao === 'lixeira' ? 'page' : undefined} onClick={() => { setSecao('lixeira'); void carregarLixeira() }} className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium ${secao === 'lixeira' ? 'bg-[#e3262e] text-black shadow-sm' : 'bg-[#e3262e] text-black hover:bg-[#ff3b42]'}`}>
              <Trash2 className="size-4" /> Lixeira
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-[90rem] gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {secao === 'cadastro' ? (
          <>
            <Panel
              title={editandoNumero ? `Editar bobina · ${editandoNumero}` : 'Cadastro de produção · nova bobina'}
              description="Preencha os dados da bobina. O peso líquido é calculado pelo peso final menos o peso do cilindro."
            >
              <form onSubmit={salvar} className="grid gap-6">
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Número da bobina" htmlFor="cb-numero-bobina">
                    <TextInput
                      id="cb-numero-bobina"
                      value={form.numeroBobina}
                      onChange={(e) =>
                        atualizar('numeroBobina', e.target.value.trim())
                      }
                      required
                      maxLength={80}
                      readOnly={Boolean(editandoNumero)}
                    />
                  </Field>
                  <Field label="Cód. bobina (externo)" htmlFor="cb-codigo">
                    <TextInput
                      id="cb-codigo"
                      value={form.codBob}
                      onChange={(e) =>
                        atualizar('codBob', e.target.value.toUpperCase())
                      }
                      required
                      maxLength={100}
                    />
                  </Field>
                  <Field label="Data" htmlFor="cb-data">
                    <TextInput
                      id="cb-data"
                      type="date"
                      value={form.data}
                      onChange={(e) => atualizar('data', e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Aba / período de destino" htmlFor="cb-aba">
                    <TextInput
                      id="cb-aba"
                      value={form.aba}
                      readOnly
                      placeholder="Mês atual selecionado automaticamente"
                      required
                      maxLength={80}
                    />
                  </Field>
                </section>

                <div className="grid gap-6 xl:grid-cols-2">
                  <Panel title="Bobina e produção">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Material" htmlFor="cb-material">
                        <TextInput
                          id="cb-material"
                          value={form.material}
                          onChange={(e) =>
                            atualizar('material', e.target.value.toUpperCase())
                          }
                          required
                          maxLength={100}
                        />
                      </Field>
                      <Field label="Largura" htmlFor="cb-largura">
                        <SelectInput
                          id="cb-largura"
                          value={form.largura}
                          onChange={(e) =>
                            setForm((atual) => ({
                              ...atual,
                              largura: e.target.value,
                              pesoCilindro: pesoCilindroPadrao(e.target.value),
                              vareta:
                                varetaPadrao(e.target.value) || atual.vareta,
                            }))
                          }
                          options={LARGURAS}
                        />
                      </Field>
                      <CampoDecimal
                        id="cb-peso-bruto"
                        label="Peso bruto (kg)"
                        value={form.pesoBruto}
                        onChange={(value) => atualizar('pesoBruto', value)}
                      />
                      <CampoDecimal
                        id="cb-peso-final"
                        label="Peso final (kg)"
                        value={form.pesoFinal}
                        onChange={(value) => atualizar('pesoFinal', value)}
                        required
                      />
                      <CampoDecimal
                        id="cb-cilindro"
                        label="Peso cilindro (kg)"
                        value={form.pesoCilindro}
                        onChange={(value) => atualizar('pesoCilindro', value)}
                      />
                      <CampoDecimal
                        id="cb-peso-liquido"
                        label="Peso líquido (kg)"
                        value={pesoLiquido}
                        readOnly
                      />
                      <Field label="Metragem" htmlFor="cb-metragem">
                        <TextInput
                          id="cb-metragem"
                          type="number"
                          min={1}
                          step={1}
                          value={form.metragem}
                          onChange={(e) =>
                            atualizar('metragem', e.target.value)
                          }
                          required
                        />
                      </Field>
                      <CampoDecimal
                        id="cb-perda"
                        label="Perda (kg)"
                        value={form.perda}
                        onChange={(value) => atualizar('perda', value)}
                      />
                      <Field
                        label="Fornecedor do filme"
                        htmlFor="cb-fornecedor-filme"
                      >
                        <SelectInput
                          id="cb-fornecedor-filme"
                          value={form.fornecedorFilme}
                          onChange={(e) =>
                            atualizar('fornecedorFilme', e.target.value)
                          }
                          options={FORNECEDORES_FILME}
                        />
                      </Field>
                      <Field label="Vareta (g)" htmlFor="cb-vareta">
                        <SelectInput
                          id="cb-vareta"
                          value={form.vareta}
                          onChange={(e) => atualizar('vareta', e.target.value)}
                          options={VARETAS}
                        />
                      </Field>
                    </div>
                  </Panel>

                  <Panel title="Cola, turno e linha">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <CampoDecimal
                        id="cb-kg-cola"
                        label="Cola (kg)"
                        value={form.kgCola}
                        onChange={(value) => atualizar('kgCola', value)}
                      />
                      <Field label="Lote da cola" htmlFor="cb-lote-cola">
                        <TextInput
                          id="cb-lote-cola"
                          value={form.loteCola}
                          onChange={(e) =>
                            atualizar('loteCola', e.target.value.toUpperCase())
                          }
                          maxLength={100}
                        />
                      </Field>
                      <Field
                        label="Código interno da cola"
                        htmlFor="cb-codigo-interno"
                      >
                        <TextInput
                          id="cb-codigo-interno"
                          value={form.codigoInterno}
                          onChange={(e) =>
                            atualizar(
                              'codigoInterno',
                              e.target.value.toUpperCase(),
                            )
                          }
                          maxLength={100}
                        />
                      </Field>
                      <Field
                        label="Fornecedor da cola"
                        htmlFor="cb-fornecedor-cola"
                      >
                        <TextInput
                          id="cb-fornecedor-cola"
                          value={form.fornecedorCola}
                          onChange={(e) =>
                            atualizar(
                              'fornecedorCola',
                              e.target.value.toUpperCase(),
                            )
                          }
                          maxLength={100}
                        />
                      </Field>
                      <Field label="Turno" htmlFor="cb-turno">
                        <SelectInput
                          id="cb-turno"
                          value={form.turno}
                          onChange={(e) => atualizar('turno', e.target.value)}
                          options={['1º TURNO', '2º TURNO']}
                        />
                      </Field>
                      <Field label="Linha" htmlFor="cb-linha">
                        <SelectInput
                          id="cb-linha"
                          value={form.linha}
                          onChange={(e) => atualizar('linha', e.target.value)}
                          options={LINHAS}
                        />
                      </Field>
                      {clienteVisivel && (
                        <Field label="Cliente" htmlFor="cb-cliente">
                          <TextInput
                            id="cb-cliente"
                            value={form.cliente}
                            onChange={(e) =>
                              atualizar('cliente', e.target.value.toUpperCase())
                            }
                            maxLength={160}
                          />
                        </Field>
                      )}
                      {corImpressaoVisivel && (
                        <Field
                          label="Cor de impressão"
                          htmlFor="cb-cor-impressao"
                        >
                          <TextInput
                            id="cb-cor-impressao"
                            value={form.corImpressao}
                            onChange={(e) =>
                              atualizar(
                                'corImpressao',
                                e.target.value.toUpperCase(),
                              )
                            }
                            maxLength={100}
                          />
                        </Field>
                      )}
                    </div>
                  </Panel>
                </div>

                <Panel title="Cor, pigmento e emenda">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Cor de fundo" htmlFor="cb-cor-fundo">
                      <TextInput
                        id="cb-cor-fundo"
                        value={form.corFundo}
                        onChange={(e) =>
                          atualizar('corFundo', e.target.value.toUpperCase())
                        }
                        required
                        maxLength={100}
                      />
                    </Field>
                    <CampoDecimal
                      id="cb-pigmento"
                      label="Pigmento (kg)"
                      value={form.pigmento}
                      onChange={(value) => atualizar('pigmento', value)}
                    />
                    <Field label="Cor da mistura" htmlFor="cb-cor-mistura">
                      <TextInput
                        id="cb-cor-mistura"
                        value={form.corMistura}
                        onChange={(e) =>
                          atualizar('corMistura', e.target.value.toUpperCase())
                        }
                        maxLength={100}
                      />
                    </Field>
                    <Field
                      label="Pigmento da mistura"
                      htmlFor="cb-pigmento-mistura"
                    >
                      <TextInput
                        id="cb-pigmento-mistura"
                        value={form.pigmentoMistura}
                        onChange={(e) =>
                          atualizar(
                            'pigmentoMistura',
                            e.target.value.toUpperCase(),
                          )
                        }
                        maxLength={100}
                      />
                    </Field>
                    <Field label="Emenda" htmlFor="cb-emenda">
                      <SelectInput
                        id="cb-emenda"
                        value={form.emenda}
                        onChange={(e) => atualizar('emenda', e.target.value)}
                        options={['NÃO', 'SIM']}
                      />
                    </Field>
                    {form.emenda === 'SIM' && (
                      <Field
                        label="Código da emenda"
                        htmlFor="cb-codigo-emenda"
                      >
                        <TextInput
                          id="cb-codigo-emenda"
                          value={form.codigoEmenda}
                          onChange={(e) =>
                            atualizar(
                              'codigoEmenda',
                              e.target.value.toUpperCase(),
                            )
                          }
                          required
                          maxLength={100}
                        />
                      </Field>
                    )}
                  </div>
                </Panel>

                <div className="flex justify-end gap-2">
                  {editandoNumero && (
                    <button
                      type="button"
                      onClick={cancelarEdicao}
                      disabled={salvando}
                      className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                    >
                      Cancelar edição
                    </button>
                  )}
                  <PrimaryButton
                    type="submit"
                    disabled={salvando}
                    className="sm:w-auto"
                  >
                    <Save className="size-4" />
                    {salvando ? 'Salvando...' : editandoNumero ? 'Salvar alterações' : 'Salvar registro'}
                  </PrimaryButton>
                </div>
              </form>
            </Panel>
          </>
        ) : secao === 'registros' ? (
          <Panel
            title="Bobinas registradas"
            description="Todos os registros da Cobrideira."
            action={
              <button
                type="button"
                onClick={() => void carregarRegistros()}
                className="inline-flex h-10 items-center gap-2 rounded-full border-0 bg-[#e3262e] px-4 text-sm font-bold text-black hover:bg-[#ff3b42]"
              >
                Atualizar
              </button>
            }
          >
            {logSincronizacao.length > 0 && (
              <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="mb-2 font-bold">Log da última sincronização</p>
                <ul className="list-inside list-disc space-y-1">
                  {logSincronizacao.map((linha, index) => <li key={index}>{linha}</li>)}
                </ul>
              </div>
            )}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[#e3262e] px-4 text-sm font-bold text-black hover:bg-[#ff3b42]">
                <FileUp className="size-4" /> Importar CSV
                <input type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(e) => { void lerArquivoCSV(e.target.files?.[0]); e.currentTarget.value = '' }} />
              </label>
              {registrosOrdenados.length > 0 && (
                <button type="button" onClick={() => selecionarVisiveis(!registrosOrdenados.every((registro) => selecionadas.has(registro.numero_bobina)))} className="h-10 rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted">
                  {registrosOrdenados.every((registro) => selecionadas.has(registro.numero_bobina)) ? 'Desmarcar visíveis' : 'Selecionar visíveis'}
                </button>
              )}
              {selecionadas.size > 0 && (
                <>
                  <span className="text-sm font-semibold">{selecionadas.size} selecionada(s)</span>
                  <button type="button" onClick={() => void moverSelecionadasParaLixeira()} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#e3262e] px-4 text-sm font-bold text-black hover:bg-[#ff3b42]"><Trash2 className="size-4" /> Mover selecionadas para lixeira</button>
                </>
              )}
            </div>
            {mostrarPreviaCSV && (
              <section className="mb-5 rounded-xl border border-border bg-white p-4 text-black">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div><h3 className="font-bold">Prévia da importação: {csvNome}</h3><p className="text-sm text-gray-600">{csvLinhas.filter((item) => item.bobina).length} válida(s) · {csvLinhas.filter((item) => item.erro).length} com erro</p></div>
                  <button type="button" onClick={() => setMostrarPreviaCSV(false)} className="rounded-full border px-3 py-2 text-sm">Fechar</button>
                </div>
                <div className="max-h-72 overflow-auto rounded-lg border">
                  <table className="w-full min-w-[42rem] text-left text-xs">
                    <thead className="sticky top-0 bg-gray-100"><tr><th className="p-2">Linha CSV</th><th className="p-2">Bobina</th><th className="p-2">Data</th><th className="p-2">Largura</th><th className="p-2">Peso bruto</th><th className="p-2">Resultado</th></tr></thead>
                    <tbody>{csvLinhas.map((item) => <tr key={item.linha} className="border-t"><td className="p-2">{item.linha}</td><td className="p-2 font-mono">{item.bobina?.numero_bobina ?? '—'}</td><td className="p-2">{item.bobina?.data ?? '—'}</td><td className="p-2">{item.bobina ? `${item.bobina.largura},${String(item.bobina.micragem).padStart(2, '0')}` : '—'}</td><td className="p-2">{item.bobina?.peso_bruto ?? '—'}</td><td className={`p-2 font-semibold ${item.erro ? 'text-red-700' : 'text-green-700'}`}>{item.erro ?? (item.bobina ? 'Pronta para importar' : 'Já cadastrada — sem alterações')}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => { setMostrarPreviaCSV(false); setCsvLinhas([]) }} className="rounded-full border px-4 py-2 text-sm font-semibold">Cancelar</button>
                  <button type="button" onClick={() => void importarCSVParaBanco()} disabled={importandoCSV || !csvLinhas.some((item) => item.bobina)} className="rounded-full bg-[#e3262e] px-4 py-2 text-sm font-bold text-black disabled:opacity-50">{importandoCSV ? 'Importando...' : `Importar ${csvLinhas.filter((item) => item.bobina).length} válidas`}</button>
                </div>
                <p className="mt-2 text-xs text-gray-500">Aceita CSV com separador vírgula, ponto e vírgula ou tabulação; reconhece decimal com vírgula ou ponto e datas brasileiras ou ISO. Linhas inválidas ficam de fora.</p>
              </section>
            )}
            <section className="mb-5 grid gap-3 rounded-xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
              <label className="grid gap-1 text-xs font-semibold text-black">
                Data inicial
                <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-black">
                Data final
                <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-black">
                Turno
                <select value={turnoFiltro} onChange={(e) => setTurnoFiltro(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm text-black">
                  <option value="">Todos</option>
                  {Array.from(new Set(registros.map((r) => r.turno))).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-black">
                Fornecedor
                <select value={fornecedorFiltro} onChange={(e) => setFornecedorFiltro(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm text-black">
                  <option value="">Todos</option>
                  {Array.from(new Set(registros.map((r) => r.fornecedor_filme))).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-black">
                Linha
                <select value={linhaFiltro} onChange={(e) => setLinhaFiltro(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm text-black">
                  <option value="">Todas</option>
                  {Array.from(new Set(registros.map((r) => r.linha))).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => { setBusca(''); setDataInicial(''); setDataFinal(''); setTurnoFiltro(''); setFornecedorFiltro(''); setLinhaFiltro('') }} className="h-10 rounded-full bg-[#e3262e] px-4 text-sm font-bold text-black hover:bg-[#ff3b42] sm:col-span-2 lg:col-span-5">
                Limpar filtros
              </button>
            </section>

            <div className="relative mb-4 max-w-md">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <TextInput
                aria-label="Buscar por IDP ou código da bobina"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar IDP ou código da bobina"
                className="pl-9"
              />
            </div>
            {erroConsulta ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              >
                {erroConsulta}
              </p>
            ) : carregando ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Carregando bobinas...
              </p>
            ) : registrosFiltrados.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {busca
                  ? 'Nenhuma bobina encontrada para essa busca.'
                  : 'Nenhuma bobina cadastrada.'}
              </p>
            ) : (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">{registrosFiltrados.length} registro(s) encontrado(s)</p>
                  <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                    <button type="button" onClick={() => setModoVisualizacao('lista')} aria-pressed={modoVisualizacao === 'lista'} className={`rounded-md px-3 py-2 text-sm font-medium ${modoVisualizacao === 'lista' ? 'bg-white text-black shadow-sm' : 'text-muted-foreground'}`}>Lista</button>
                    <button type="button" onClick={() => setModoVisualizacao('cards')} aria-pressed={modoVisualizacao === 'cards'} className={`rounded-md px-3 py-2 text-sm font-medium ${modoVisualizacao === 'cards' ? 'bg-white text-black shadow-sm' : 'text-muted-foreground'}`}>Cards</button>
                  </div>
                </div>
                {modoVisualizacao === 'lista' ? (
                  <div className="scroll-area overflow-x-auto">
                    <table className="w-full min-w-[58rem] text-left text-sm">
                      <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                        <tr>
                          <th className="w-10 px-2 py-3"><input type="checkbox" aria-label="Selecionar todas as bobinas visíveis" checked={registrosOrdenados.length > 0 && registrosOrdenados.every((r) => selecionadas.has(r.numero_bobina))} onChange={(e) => selecionarVisiveis(e.target.checked)} /></th>
                          <th className="px-3 py-3"><button type="button" onClick={() => setOrdenacao(o => ({ campo: 'numero_bobina', asc: o.campo === 'numero_bobina' ? !o.asc : true }))}>Nº Bobina ↕</button></th>
                          <th className="px-3 py-3"><button type="button" onClick={() => setOrdenacao(o => ({ campo: 'data', asc: o.campo === 'data' ? !o.asc : true }))}>Data ↕</button></th>
                          <th className="px-3 py-3"><button type="button" onClick={() => setOrdenacao(o => ({ campo: 'cod_bob', asc: o.campo === 'cod_bob' ? !o.asc : true }))}>Cód. bobina ↕</button></th>
                          <th className="px-3 py-3"><button type="button" onClick={() => setOrdenacao(o => ({ campo: 'fornecedor_filme', asc: o.campo === 'fornecedor_filme' ? !o.asc : true }))}>Fornecedor ↕</button></th>
                          <th className="px-3 py-3"><button type="button" onClick={() => setOrdenacao(o => ({ campo: 'largura', asc: o.campo === 'largura' ? !o.asc : true }))}>Largura ↕</button></th>
                          <th className="px-3 py-3"><button type="button" onClick={() => setOrdenacao(o => ({ campo: 'peso_liquido', asc: o.campo === 'peso_liquido' ? !o.asc : true }))}>Peso líquido ↕</button></th>
                          <th className="px-3 py-3"><button type="button" onClick={() => setOrdenacao(o => ({ campo: 'metragem', asc: o.campo === 'metragem' ? !o.asc : true }))}>Metragem ↕</button></th>
                          <th className="px-3 py-3">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registrosOrdenados.map((registro) => {
                          const expandido = registrosExpandidos.has(registro.numero_bobina)
                          const detalhes: [string, string | number][] = [
                            ['Aba / período', registro.aba], ['Material', registro.material],
                            ['Peso bruto', pesoBrutoContabilizado(registro) > 0 ? `${formatarPeso(pesoBrutoContabilizado(registro))} kg` : 'Já contabilizado pelo mesmo código'],
                            ['Peso final', `${formatarPeso(Number(registro.peso_final))} kg`],
                            ['Peso do cilindro', `${formatarPeso(Number(registro.peso_cilindro))} kg`],
                            ['Perda', `${formatarPeso(Number(registro.perda_kg))} kg`],
                            ['Vareta', `${registro.vareta_g} g`], ['Cola', `${formatarPeso(Number(registro.kg_cola))} kg`],
                            ['Lote da cola', registro.lote_cola], ['Código interno', registro.codigo_interno],
                            ['Fornecedor da cola', registro.fornecedor_cola], ['Turno', registro.turno],
                            ['Linha', registro.linha], ['Cor de fundo', registro.cor_fundo],
                            ['Pigmento', `${formatarPeso(Number(registro.pigmento_kg))} kg`],
                            ['Cor da mistura', registro.cor_mistura], ['Pigmento da mistura', registro.pigmento_mistura],
                            ['Cliente', registro.cliente], ['Cor de impressão', registro.cor_impressao],
                            ['Emenda', registro.emenda ? 'Sim' : 'Não'], ['Código da emenda', registro.codigo_emenda],
                            ['Criado por', registro.created_by], ['Criado em', new Date(registro.created_at).toLocaleString('pt-BR')],
                          ]
                          return (
                            <React.Fragment key={registro.numero_bobina}>
                              <tr className="border-b border-border/70">
                                <td className="px-2 py-3">
                                  <div className="flex items-center gap-2">
                                    <input type="checkbox" aria-label={`Selecionar bobina ${registro.numero_bobina}`} checked={selecionadas.has(registro.numero_bobina)} onChange={() => alternarSelecao(registro.numero_bobina)} />
                                    <button type="button" onClick={() => alternarExpansao(registro.numero_bobina)} aria-label={expandido ? 'Recolher detalhes' : 'Expandir detalhes'} aria-expanded={expandido} className="grid size-8 place-items-center rounded-md hover:bg-muted">
                                    {expandido ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-3 py-3 font-mono">{registro.numero_bobina}</td>
                                <td className="px-3 py-3">{formatarData(registro.data)}</td>
                                <td className="px-3 py-3 font-mono">{registro.cod_bob}</td>
                                <td className="px-3 py-3">{registro.fornecedor_filme}</td>
                                <td className="px-3 py-3">{registro.largura}.{String(registro.micragem).padStart(2, '0')}</td>
                                <td className="px-3 py-3">{formatarPeso(Number(registro.peso_liquido))} kg</td>
                                <td className="px-3 py-3">{registro.metragem.toLocaleString('pt-BR')} m</td>
                                <td className="px-3 py-3 text-xs text-muted-foreground">Cadastrada</td>
                              </tr>
                              {expandido && (
                                <tr className="border-b border-border bg-muted/30">
                                  <td colSpan={9} className="px-4 py-4">
                                    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                      {detalhes.map(([rotulo, valor]) => <div key={rotulo} className="min-w-0"><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className="break-words text-sm font-medium">{valor || '—'}</dd></div>)}
                                    </dl>
                                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                                      <button type="button" onClick={() => void sincronizarBobina(registro)} disabled={sincronizandoBobina !== null} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50">
                                        <RefreshCw className={`size-4 ${sincronizandoBobina === registro.numero_bobina ? 'animate-spin' : ''}`} />
                                        {sincronizandoBobina === registro.numero_bobina ? 'Sincronizando...' : 'Sincronizar'}
                                      </button>
                                      <button type="button" onClick={() => iniciarEdicao(registro)} className="rounded-full bg-[#e3262e] px-4 py-2 text-sm font-bold text-black hover:bg-[#ff3b42]">Editar dados</button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {registrosOrdenados.map((registro) => {
                      const expandido = registrosExpandidos.has(registro.numero_bobina)
                      const detalhes: [string, string | number][] = [
                        ['Cód. bobina', registro.cod_bob], ['Data', formatarData(registro.data)],
                        ['Aba / período', registro.aba], ['Material', registro.material],
                        ['Largura', `${registro.largura}.${String(registro.micragem).padStart(2, '0')}`], ['Peso bruto', pesoBrutoContabilizado(registro) > 0 ? `${formatarPeso(pesoBrutoContabilizado(registro))} kg` : 'Já contabilizado pelo mesmo código'],
                        ['Peso final', `${formatarPeso(Number(registro.peso_final))} kg`],
                        ['Peso cilindro', `${formatarPeso(Number(registro.peso_cilindro))} kg`],
                        ['Peso líquido', `${formatarPeso(Number(registro.peso_liquido))} kg`],
                        ['Metragem', `${registro.metragem} m`], ['Perda', `${formatarPeso(Number(registro.perda_kg))} kg`],
                        ['Fornecedor filme', registro.fornecedor_filme], ['Vareta', `${registro.vareta_g} g`],
                        ['Cola', `${formatarPeso(Number(registro.kg_cola))} kg`], ['Lote cola', registro.lote_cola],
                        ['Código interno', registro.codigo_interno], ['Fornecedor cola', registro.fornecedor_cola],
                        ['Turno', registro.turno], ['Linha', registro.linha], ['Cor de fundo', registro.cor_fundo],
                        ['Pigmento', `${formatarPeso(Number(registro.pigmento_kg))} kg`],
                        ['Cor mistura', registro.cor_mistura], ['Pigmento mistura', registro.pigmento_mistura],
                        ['Cliente', registro.cliente], ['Cor impressão', registro.cor_impressao],
                        ['Emenda', registro.emenda ? 'Sim' : 'Não'], ['Código emenda', registro.codigo_emenda],
                        ['Criado por', registro.created_by], ['Criado em', new Date(registro.created_at).toLocaleString('pt-BR')],
                      ]
                      return (
                        <article key={registro.numero_bobina} className="rounded-xl border border-border bg-white p-4 text-black shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-2"><input type="checkbox" aria-label={`Selecionar bobina ${registro.numero_bobina}`} checked={selecionadas.has(registro.numero_bobina)} onChange={() => alternarSelecao(registro.numero_bobina)} className="mt-1" /><div className="min-w-0">
                              <p className="text-xs text-gray-500">Nº Bobina</p>
                              <h3 className="break-words font-mono text-lg font-bold">{registro.numero_bobina}</h3>
                              <p className="mt-1 text-sm text-gray-600">{registro.cod_bob} · {formatarData(registro.data)}</p>
                            </div></div>
                            <button type="button" onClick={() => alternarExpansao(registro.numero_bobina)} aria-expanded={expandido} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50">
                              {expandido ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                              {expandido ? 'Recolher' : 'Detalhes'}
                            </button>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-sm">
                            <div><p className="text-xs text-gray-500">Peso líquido</p><p className="font-semibold">{formatarPeso(Number(registro.peso_liquido))} kg</p></div>
                            <div><p className="text-xs text-gray-500">Metragem</p><p className="font-semibold">{registro.metragem.toLocaleString('pt-BR')} m</p></div>
                            <div><p className="text-xs text-gray-500">Fornecedor</p><p className="font-semibold">{registro.fornecedor_filme}</p></div>
                            <div><p className="text-xs text-gray-500">Situação</p><p className="font-semibold">Cadastrada</p></div>
                          </div>
                          {expandido && (
                            <>
                              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">{detalhes.map(([rotulo, valor]) => <div key={rotulo} className="min-w-0"><dt className="text-xs text-gray-500">{rotulo}</dt><dd className="break-words text-sm font-medium">{valor || '—'}</dd></div>)}</dl>
                              <div className="mt-4 flex flex-wrap justify-end gap-2">
                                <button type="button" onClick={() => void sincronizarBobina(registro)} disabled={sincronizandoBobina !== null} className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-bold hover:bg-gray-50 disabled:opacity-50">
                                  <RefreshCw className={`size-4 ${sincronizandoBobina === registro.numero_bobina ? 'animate-spin' : ''}`} />
                                  {sincronizandoBobina === registro.numero_bobina ? 'Sincronizando...' : 'Sincronizar'}
                                </button>
                                <button type="button" onClick={() => iniciarEdicao(registro)} className="rounded-full bg-[#e3262e] px-4 py-2 text-sm font-bold text-black hover:bg-[#ff3b42]">Editar dados</button>
                              </div>
                            </>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </Panel>
        ) : (
          <Panel title="Lixeira de bobinas" description="Bobinas removidas do cadastro ativo. Você pode restaurar ou excluir definitivamente.">
            <div className="mb-4 flex justify-end">
              <button type="button" onClick={() => void carregarLixeira()} disabled={carregandoLixeira} className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">{carregandoLixeira ? 'Atualizando...' : 'Atualizar lixeira'}</button>
            </div>
            {carregandoLixeira ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando lixeira...</p> : itensLixeira.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">A lixeira está vazia.</p> : (
              <div className="grid gap-3">
                {itensLixeira.map((item) => (
                  <article key={item.numero_bobina} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
                    <div>
                      <p className="font-mono font-bold">{item.numero_bobina}</p>
                      <p className="text-sm text-muted-foreground">{item.dados.cod_bob} · Guia: {item.dados.aba} · Excluída em {new Date(item.excluida_em).toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void restaurarDaLixeira(item.numero_bobina)} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"><RotateCcw className="size-4" /> Restaurar</button>
                      <button type="button" onClick={() => void excluirDefinitivamente(item.numero_bobina)} className="inline-flex items-center gap-2 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="size-4" /> Excluir definitivamente</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        )}
      </main>
    </div>
  )
}
