import * as React from 'react'
import { Plus, Pencil, Trash2, RefreshCw, Search, X, Package, Weight, Ruler, Boxes, FileUp, Bell, BellOff, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  listCurrentStock,
  createCurrentStockRecord,
  updateCurrentStockRecord,
  moveCurrentStockToTrash,
  importCurrentStockCsv,
} from '@/lib/admin.functions'

type Categoria = 'BOPP' | 'PEBD' | 'CREPE' | 'KRAFT' | 'DUPLA FACE'
type BobinaEstoque = {
  id: string; categoria: Categoria; data_entrada: string | null; fornecedor: string | null; localizacao?: 'ESTOQUE' | 'GALPAO_MARIO_COVAS' | null
  medida: number | null; medida_texto?: string | null; nf?: string | null; aba?: string | null; peso_kg: number | null; metragem_m: number | null; codigo: string | null
  cor: string | null; cliente: string | null; linha: string | null; origem_arquivo: string; observacoes: string | null
}
type ResumoProduto = {
  id: string; medida_produto: string; peso_estoque_kg: number; metragem_disponivel_m: number
  consumo_movel_semanal_m: number | null; estoque_projetado_m: number | null
  estoque_minimo_semanal_m: number | null; quantidade_jumbos: number | null
  estoque_minimo_jumbos: number | null; status_origem: string | null; folga_estoque: string | null
  categoria: string
}
type ResumoMinimoVirgem = {
  referencia: string
  bobinas_estoque: number
  peso_estoque_kg: number
  minimo_calculado_kg: number
  minimo_calibrado_kg: number | null
  minimo_calibrado_bobinas: number | null
  peso_medio_bobina_kg: number | null
}
type FormEstoque = {
  categoria: Categoria; data_entrada: string; fornecedor: string; medida: string; nf: string; aba: string; localizacao: 'ESTOQUE' | 'GALPAO_MARIO_COVAS'
  peso_kg: string; metragem_m: string; codigo: string; cor: string; cliente: string; linha: string; observacoes: string
}
const vazio: FormEstoque = { categoria: 'BOPP', localizacao: 'ESTOQUE', data_entrada: new Date().toISOString().slice(0, 10), fornecedor: '', medida: '', nf: '', aba: '', peso_kg: '', metragem_m: '', codigo: '', cor: '', cliente: '', linha: '', observacoes: '' }
const numero = (v: number | null | undefined) => Number(v ?? 0)
const fmt = (v: number | null | undefined, casas = 0) => numero(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const categorias: Categoria[] = ['BOPP', 'PEBD', 'CREPE', 'KRAFT', 'DUPLA FACE']
const fmtMedida = (v: number | null | undefined) => v == null ? '—' : Number(v).toFixed(2)
const chaveAlertaEstoque = (valor: string) => valor.trim().toLocaleLowerCase('pt-BR')
const ordenarReferenciaEstoque = (a: string, b: string) => {
  const especial = (valor: string) => /(metalizad|pebd|crepe|kraft|dupla\s*face)/i.test(valor)
  const ea = especial(a), eb = especial(b)
  if (ea !== eb) return ea ? 1 : -1
  const na = a.match(/\d{3,4}(?:[.,]\d{2})?/)?.[0]
  const nb = b.match(/\d{3,4}(?:[.,]\d{2})?/)?.[0]
  if (na && nb) {
    const delta = Number(na.replace(',', '.')) - Number(nb.replace(',', '.'))
    if (delta) return delta
  } else if (na || nb) return na ? -1 : 1
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
}
function normalizarCabecalho(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function lerCsv(texto: string, nomeArquivo: string) {
  const linhasTexto = texto.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const primeiraLinha = linhasTexto.split('\n').find((linha) => linha.trim()) ?? ''
  const delimitador = (primeiraLinha.match(/;/g)?.length ?? 0) > (primeiraLinha.match(/,/g)?.length ?? 0) ? ';' : ','
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < linhasTexto.length; i++) {
    const caractere = linhasTexto[i]
    if (caractere === '"') {
      if (aspas && linhasTexto[i + 1] === '"') { campo += '"'; i++ }
      else aspas = !aspas
    } else if (caractere === delimitador && !aspas) {
      linha.push(campo); campo = ''
    } else if (caractere === '\n' && !aspas) {
      linha.push(campo); campo = ''
      if (linha.some((valor) => valor.trim())) linhas.push(linha)
      linha = []
    } else campo += caractere
  }
  linha.push(campo)
  if (linha.some((valor) => valor.trim())) linhas.push(linha)
  if (linhas.length < 2) return []

  const cabecalhos = linhas[0].map(normalizarCabecalho)
  const indice = (...nomes: string[]) => {
    const procurados = nomes.map(normalizarCabecalho)
    return cabecalhos.findIndex((cabecalho) => procurados.includes(cabecalho))
  }
  const valor = (registro: string[], ...nomes: string[]) => {
    const posicao = indice(...nomes)
    return posicao >= 0 ? (registro[posicao] ?? '').trim() : ''
  }
  const categoriaDoArquivo: Categoria | null = (() => {
    const nome = normalizarCabecalho(nomeArquivo)
    if (nome.includes('dupla_face') || nome.includes('dupla')) return 'DUPLA FACE'
    if (nome.includes('crepe')) return 'CREPE'
    if (nome.includes('kraft')) return 'KRAFT'
    if (nome.includes('pebd')) return 'PEBD'
    if (nome.includes('bopp')) return 'BOPP'
    return null
  })()
  const converterNumero = (bruto: string): number | null => {
    let numero = bruto.trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '')
    if (!numero) return null
    if (numero.includes(',') && numero.includes('.')) {
      numero = numero.lastIndexOf(',') > numero.lastIndexOf('.')
        ? numero.replace(/\./g, '').replace(',', '.')
        : numero.replace(/,/g, '')
    } else if (numero.includes(',')) numero = numero.replace(',', '.')
    const convertido = Number(numero)
    return Number.isFinite(convertido) ? convertido : null
  }
  const converterData = (bruta: string): string | null => {
    const valorData = bruta.trim()
    if (!valorData) return null
    const brasileira = valorData.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (brasileira) return `${brasileira[3]}-${brasileira[2]}-${brasileira[1]}`
    const iso = valorData.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    const serial = Number(valorData)
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      const data = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
      return data.toISOString().slice(0, 10)
    }
    return null
  }
  const registros = linhas.slice(1).map((colunas, indiceLinha) => {
    const aba = valor(colunas, 'aba', 'guia', 'planilha', 'aba_origem')
    const categoriaBruta = (valor(colunas, 'categoria', 'tipo_categoria') || aba).toUpperCase().replace(/_/g, ' ')
    const abaEhBopp = /^\d{3,4}[.,]\d{2}$/.test(aba.trim()) || /METALIZAD/i.test(aba)
    const categoria: Categoria | null = categoriaBruta === 'BOPP' || abaEhBopp ? 'BOPP'
      : categoriaBruta === 'PEBD' || /^PEBD$/i.test(aba) ? 'PEBD'
      : categoriaBruta === 'CREPE' ? 'CREPE'
      : categoriaBruta === 'KRAFT' ? 'KRAFT'
      : categoriaBruta === 'DUPLA FACE' ? 'DUPLA FACE'
      : categoriaDoArquivo
    const codigo = valor(colunas, 'codigo', 'codigo_bobina', 'codigo_da_bobina', 'cod_bob', 'cod_bobina', 'numero_bobina', 'numero_da_bobina', 'numero', 'id_bobina', 'identificacao')
    if (!colunas.some((v) => v.trim()) || !codigo) return null
    if (!categoria) throw new Error(`${nomeArquivo}: informe a categoria em cada linha ou use BOPP, PEBD, CREPE, KRAFT ou DUPLA_FACE no nome do arquivo (linha ${indiceLinha + 2}).`)
    const medidaTexto = valor(colunas, 'medida', 'medidas', 'largura', 'largura_bobina', 'largura_bobina_texto', 'medida_texto', 'especificacao', 'medida_produto')
    const medida = converterNumero(medidaTexto)
    const peso = converterNumero(valor(colunas, 'peso_kg', 'peso', 'peso_bobina', 'peso_bobina_kg', 'peso_bobina_texto', 'peso_atual', 'kg'))
    const metragem = converterNumero(valor(colunas, 'metragem_m', 'metragem', 'metros', 'metragem_disponivel_m', 'metragem_bobina_texto', 'comprimento', 'metragem_unica'))
    const dataOriginal = valor(colunas, 'data_entrada', 'data', 'entrada', 'data_de_entrada')
    const dataConvertida = converterData(dataOriginal)
    const data = dataConvertida && dataConvertida >= '2000-01-01' ? dataConvertida : null
    const nfBruta = valor(colunas, 'nf', 'nota_fiscal', 'nota', 'numero_nf')
    const nf = nfBruta.match(/\d+/)?.[0] ?? ''
    const corExplicita = valor(colunas, 'cor', 'cor_filme', 'cor_do_filme')
    const corDaMedida = medidaTexto.match(/^\s*\d+(?:[.,]\d+)?(?:\.\s*|\s+)([A-ZÀ-ÿ][A-ZÀ-ÿ\s]+)$/i)?.[1]?.trim() || ''
    const cor = corExplicita || corDaMedida || null
    const observacoesOriginais = valor(colunas, 'observacoes', 'observacao', 'obs')
    const observacoesGeradas = [
      nf ? `NF: ${nf}` : '',
      aba ? `ABA: ${aba}` : '',
      medidaTexto && /[A-Za-zÀ-ÿ]/.test(medidaTexto) ? `MEDIDA original: ${medidaTexto}` : '',
      dataOriginal && !data ? `DATA_ENTRADA original não convertida: ${dataOriginal}` : '',
      observacoesOriginais,
    ].filter(Boolean).join(' | ')
    return {
      categoria, data_entrada: data, fornecedor: valor(colunas, 'fornecedor', 'fornec_filme', 'fornecedor_filme', 'fornec') || null,
      medida, medida_texto: medidaTexto || null, nf: nf || null, aba: aba || null,
      peso_kg: peso, metragem_m: metragem, codigo,
      cor,
      cliente: valor(colunas, 'cliente', 'cliente_personalizado', 'pedido') || null,
      linha: valor(colunas, 'linha', 'tipo_linha') || null,
      observacoes: observacoesGeradas || null,
    }
  }).filter((registro): registro is NonNullable<typeof registro> => Boolean(registro))
  return registros
}

export function EstoqueAtualCobrideira({ isDeveloper, tipoEstoque = 'VIRGEM' }: { isDeveloper: boolean; tipoEstoque?: 'VIRGEM' | 'ADESIVADO' }) {
  const [bobinas, setBobinas] = React.useState<BobinaEstoque[]>([])
  const [resumos, setResumos] = React.useState<ResumoProduto[]>([])
  const [minimosVirgem, setMinimosVirgem] = React.useState<ResumoMinimoVirgem[]>([])
  const [usosPorProduto, setUsosPorProduto] = React.useState<Record<string, number>>({})
  const [alertasDesativados, setAlertasDesativados] = React.useState<string[]>([])
  const [codigoPorProduto, setCodigoPorProduto] = React.useState<Record<string, string>>({})
  const [paginaAlertas, setPaginaAlertas] = React.useState(0)
  const [detalhesMedida, setDetalhesMedida] = React.useState<string | null>(null)
  const [carregando, setCarregando] = React.useState(true)
  const [salvando, setSalvando] = React.useState(false)
  const [importando, setImportando] = React.useState(false)
  const inputCsvRef = React.useRef<HTMLInputElement>(null)
  const [busca, setBusca] = React.useState('')
  const [categoria, setCategoria] = React.useState<'TODAS' | Categoria>('TODAS')
  const [ordemEstoque, setOrdemEstoque] = React.useState<'data-desc' | 'data-asc' | 'alfabetica'>('data-desc')
  const [form, setForm] = React.useState<FormEstoque>(vazio)
  const [editando, setEditando] = React.useState<string | null>(null)
  const [formAberto, setFormAberto] = React.useState(false)
  const categoriasVisiveis: Categoria[] = tipoEstoque === 'VIRGEM' ? ['BOPP', 'PEBD'] : categorias.filter((categoria) => categoria !== 'PEBD')

  async function carregar() {
    setCarregando(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.')
      const result = await listCurrentStock({ data: { accessToken: sessionData.session.access_token, tipoEstoque } })
      setBobinas(result.bobinas as BobinaEstoque[])
      setResumos(result.resumos as ResumoProduto[])
      setMinimosVirgem((result.minimosVirgem ?? []) as ResumoMinimoVirgem[])
      if (tipoEstoque === 'ADESIVADO') {
        try {
        const dataLimite = new Date()
        dataLimite.setDate(dataLimite.getDate() - 90)
        const desde = dataLimite.toISOString().slice(0, 10)
        const { data: produtos, error: produtosError } = await supabase.schema('rebobinadeira')
          .from('produtos_jumbo').select('codigo, descricao, alerta_estoque_baixo_ativo').eq('ativo', true)
        if (produtosError) throw produtosError
        setAlertasDesativados((produtos ?? []).filter((p) => p.alerta_estoque_baixo_ativo === false).map((p) => chaveAlertaEstoque(p.descricao)))
        setCodigoPorProduto(Object.fromEntries((produtos ?? []).map((p) => [chaveAlertaEstoque(p.descricao), p.codigo])))
        const descricaoPorCodigo = new Map((produtos ?? []).map((p) => [p.codigo, p.descricao]))
        const usos = new Map<string, Set<string>>()
        for (let inicio = 0; ; inicio += 1000) {
          const { data: linhas, error: linhasError } = await supabase.schema('rebobinadeira')
            .from('bobinas').select('produto_codigo, numero_bobina, metragem_unica_m')
            .gte('data', desde).order('id', { ascending: true }).range(inicio, inicio + 999)
          if (linhasError) throw linhasError
          for (const linha of linhas ?? []) {
            const descricao = descricaoPorCodigo.get(linha.produto_codigo ?? '')
            if (!descricao) continue
            const chaves = usos.get(descricao) ?? new Set<string>()
            chaves.add(`${linha.numero_bobina ?? ''}|${linha.metragem_unica_m ?? ''}`)
            usos.set(descricao, chaves)
          }
          if (!linhas || linhas.length < 1000) break
        }
        setUsosPorProduto(Object.fromEntries(Array.from(usos, ([descricao, chaves]) => [descricao, chaves.size])))
        } catch (consumoError) {
          console.error('Falha ao calcular frequência de uso móvel:', consumoError)
          setUsosPorProduto({})
        }
      } else {
        setCodigoPorProduto({})
        try {
          const preferencias = JSON.parse(localStorage.getItem('estoque-atual-alertas-virgem') || '[]')
          setAlertasDesativados(Array.isArray(preferencias) ? preferencias.filter((item) => typeof item === 'string') : [])
        } catch {
          setAlertasDesativados([])
        }
        setUsosPorProduto({})
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o estoque atual.')
    } finally { setCarregando(false) }
  }
  React.useEffect(() => { void carregar() }, [tipoEstoque])

  const filtradas = React.useMemo(() => {
    const resultado = bobinas.filter((b) => {
      const termo = busca.trim().toLocaleLowerCase('pt-BR')
      const bateCategoria = categoria === 'TODAS' || b.categoria === categoria
      const bateBusca = !termo || [b.codigo, b.fornecedor, b.cor, b.cliente, b.linha, b.medida, b.categoria]
        .some((v) => String(v ?? '').toLocaleLowerCase('pt-BR').includes(termo))
      return bateCategoria && bateBusca
    })
    return resultado.sort((a, b) => {
      if (ordemEstoque === 'alfabetica') {
        const nomeA = [a.codigo, a.categoria, a.fornecedor].map((v) => String(v ?? '')).join(' ').toLocaleLowerCase('pt-BR')
        const nomeB = [b.codigo, b.categoria, b.fornecedor].map((v) => String(v ?? '')).join(' ').toLocaleLowerCase('pt-BR')
        return nomeA.localeCompare(nomeB, 'pt-BR', { numeric: true })
      }
      if (!a.data_entrada && !b.data_entrada) return 0
      if (!a.data_entrada) return 1
      if (!b.data_entrada) return -1
      return ordemEstoque === 'data-desc' ? b.data_entrada.localeCompare(a.data_entrada) : a.data_entrada.localeCompare(b.data_entrada)
    })
  }, [bobinas, busca, categoria, ordemEstoque])

  const totalKg = bobinas.reduce((s, b) => s + numero(b.peso_kg), 0)
  const totalM = bobinas.reduce((s, b) => s + numero(b.metragem_m), 0)
  const porCategoria = [
    ...categoriasVisiveis.map((c) => ({
      categoria: c,
      quantidade: bobinas.filter((b) => b.categoria === c).length,
      unidade: 'bobinas' as const,
      kg: bobinas.filter((b) => b.categoria === c).reduce((s, b) => s + numero(b.peso_kg), 0),
      metros: bobinas.filter((b) => b.categoria === c).reduce((s, b) => s + numero(b.metragem_m), 0),
    })),
    {
      categoria: 'KRAFT LISA',
      quantidade: resumos.filter((r) => /^KRAFT LISA\b/i.test(r.medida_produto)).reduce((s, r) => s + numero(r.quantidade_jumbos), 0),
      unidade: 'jumbos' as const,
      kg: resumos.filter((r) => /^KRAFT LISA\b/i.test(r.medida_produto)).reduce((s, r) => s + numero(r.peso_estoque_kg), 0),
      metros: resumos.filter((r) => /^KRAFT LISA\b/i.test(r.medida_produto)).reduce((s, r) => s + numero(r.metragem_disponivel_m), 0),
    },
  ]
  const maxKg = Math.max(1, ...resumos.map((r) => numero(r.peso_estoque_kg)))

  async function alternarAlertaVirgem(referencia: string) {
    const chave = chaveAlertaEstoque(referencia)
    const desativado = alertasDesativados.includes(chave)
    const proxima = desativado ? alertasDesativados.filter((item) => item !== chave) : [...alertasDesativados, chave]
    setAlertasDesativados(proxima)
    try {
      localStorage.setItem('estoque-atual-alertas-virgem', JSON.stringify(proxima))
      toast.success(desativado ? 'Notificação ativada.' : 'Notificação desativada.')
    } catch {
      setAlertasDesativados(alertasDesativados)
      toast.error('Não foi possível salvar a preferência de notificação neste navegador.')
    }
  }

  async function alternarAlertaProduto(codigo: string, descricao: string) {
    if (!codigo) return toast.error('Não encontrei o código do produto para alterar a notificação.')
    const chave = chaveAlertaEstoque(descricao)
    const estavaDesativado = alertasDesativados.includes(chave)
    const novoAtivo = estavaDesativado
    setAlertasDesativados((atuais) => novoAtivo ? atuais.filter((item) => item !== chave) : [...atuais, chave])
    const { error } = await supabase.schema('rebobinadeira').from('produtos_jumbo')
      .update({ alerta_estoque_baixo_ativo: novoAtivo }).eq('codigo', codigo)
    if (error) {
      setAlertasDesativados((atuais) => estavaDesativado ? [...atuais, chave] : atuais.filter((item) => item !== chave))
      toast.error('Não foi possível salvar a preferência de notificação.', { description: error.message })
    } else {
      toast.success(novoAtivo ? 'Notificação ativada.' : 'Notificação desativada.')
    }
  }

  function abrirNovo() { setEditando(null); setForm({ ...vazio }); setFormAberto(true) }
  function abrirEdicao(b: BobinaEstoque) {
    setEditando(b.id)
    setForm({
      categoria: b.categoria, localizacao: b.localizacao ?? 'ESTOQUE', data_entrada: b.data_entrada ?? '', fornecedor: b.fornecedor ?? '',
      medida: b.medida_texto || (b.medida == null ? '' : String(b.medida)), nf: b.nf ?? '', aba: b.aba ?? '', peso_kg: b.peso_kg == null ? '' : String(b.peso_kg),
      metragem_m: b.metragem_m == null ? '' : String(b.metragem_m), codigo: b.codigo ?? '',
      cor: b.cor ?? '', cliente: b.cliente ?? '', linha: b.linha ?? '', observacoes: b.observacoes ?? '',
    })
    setFormAberto(true)
  }
  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const peso = form.peso_kg.trim() ? Number(form.peso_kg.replace(',', '.')) : null
    const metros = form.metragem_m.trim() ? Number(form.metragem_m.replace(',', '.')) : null
    const medidaTexto = form.medida.trim()
    const medida = medidaTexto ? Number.parseFloat(medidaTexto.replace(',', '.').replace(/[^0-9.,].*$/, '')) : null
    if (peso !== null && (!Number.isFinite(peso) || peso < 0)) return toast.error('Informe um peso válido.')
    if (metros !== null && (!Number.isFinite(metros) || metros < 0)) return toast.error('Informe uma metragem válida.')
    if (medida !== null && (!Number.isFinite(medida) || medida <= 0)) return toast.error('Informe uma medida válida.')
    if (!form.codigo.trim()) return toast.error('Informe o código da bobina.')
    setSalvando(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      const registro = {
        categoria: form.categoria, data_entrada: form.data_entrada || null,
        fornecedor: form.fornecedor.trim() || null, medida, medida_texto: medidaTexto || null, nf: form.nf.trim().match(/\d+/)?.[0] ?? null, aba: form.aba.trim() || null, peso_kg: peso, metragem_m: metros,
        codigo: form.codigo.trim(), cor: form.cor.trim() || null, cliente: form.cliente.trim() || null, linha: form.linha.trim() || null,
        observacoes: form.observacoes.trim() || null,
        ...(tipoEstoque === 'VIRGEM' ? { localizacao: form.localizacao } : {}),
      }
      if (editando) await updateCurrentStockRecord({ data: { accessToken, tipoEstoque, id: editando, registro } })
      else await createCurrentStockRecord({ data: { accessToken, tipoEstoque, registro } })
      toast.success(editando ? 'Bobina atualizada.' : 'Bobina adicionada ao estoque atual.')
      setFormAberto(false)
      await carregar()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a bobina.') }
    finally { setSalvando(false) }
  }

  async function importarCsvs(arquivos: FileList | null) {
    if (!arquivos?.length) return
    setImportando(true)
    try {
      const consolidados = new Map<string, ReturnType<typeof lerCsv>[number]>()
      let arquivosLidos = 0
      for (const arquivo of Array.from(arquivos)) {
        if (!arquivo.name.toLowerCase().endsWith('.csv')) continue
        const registros = lerCsv(await arquivo.text(), arquivo.name)
      if (tipoEstoque === 'VIRGEM' && registros.some((registro) => !['BOPP', 'PEBD'].includes(registro.categoria))) throw new Error('O Estoque Atual Virgem aceita somente BOPP e PEBD.')
        if (registros.length) arquivosLidos++
        for (const registro of registros) {
          const chave = tipoEstoque === 'VIRGEM' ? `${registro.categoria}|${registro.medida_texto ?? ''}|${registro.codigo}` : `${registro.categoria}|${registro.codigo}`
          const anterior = consolidados.get(chave)
          consolidados.set(chave, anterior ? {
            ...anterior,
            ...registro,
            cliente: registro.cliente ?? anterior.cliente,
            observacoes: registro.observacoes ?? anterior.observacoes,
          } : registro)
        }
      }
      const registros = Array.from(consolidados.values())
      if (!registros.length) throw new Error('Não encontrei bobinas nos CSVs selecionados. Confira os cabeçalhos e os nomes dos arquivos.')
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      let totalImportado = 0
      for (let inicio = 0; inicio < registros.length; inicio += 500) {
        const lote = registros.slice(inicio, inicio + 500)
        const resultado = await importCurrentStockCsv({ data: { accessToken, tipoEstoque, registros: lote } })
        totalImportado += resultado.importados
      }
      toast.success(`${totalImportado} bobinas consolidadas/importadas de ${arquivosLidos} arquivo(s). Códigos repetidos foram reunidos.`)
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível importar os CSVs.')
    } finally {
      setImportando(false)
      if (inputCsvRef.current) inputCsvRef.current.value = ''
    }
  }

  async function excluir(b: BobinaEstoque) {
    if (!window.confirm(`Mover a bobina ${b.codigo ?? ''} para a lixeira do Estoque Atual? Você poderá restaurá-la depois.`)) return
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      await moveCurrentStockToTrash({ data: { accessToken, tipoEstoque, id: b.id } })
      toast.success('Bobina movida para a lixeira do Estoque Atual.')
      await carregar()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível excluir a bobina.') }
  }



  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        
        <div className="flex gap-2">
          <button type="button" onClick={() => void carregar()} className="inline-flex items-center gap-2 rounded-lg bg-[#e3262e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c91f27]"><RefreshCw className="size-4"/> Atualizar</button>
          {<>
            <input ref={inputCsvRef} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => void importarCsvs(e.target.files)} />
            <button type="button" disabled={importando} onClick={() => inputCsvRef.current?.click()} className="csv-import-control inline-flex items-center gap-2 rounded-lg border border-[#e3262e] bg-[#e3262e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c91f27] disabled:opacity-50"><FileUp className="size-4"/> {importando ? 'Importando...' : 'Importar CSV'}</button>
            <button type="button" onClick={abrirNovo} className="inline-flex items-center gap-2 rounded-lg bg-[#e3262e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c91f27]"><Plus className="size-4"/> Nova bobina</button>
          </>}
        </div>
      </div>

      {tipoEstoque === 'ADESIVADO' && (() => {
        const alertas = (tipoEstoque === 'ADESIVADO' ? resumos : []).filter((r) => numero(r.estoque_minimo_semanal_m) > 0 && numero(r.metragem_disponivel_m) < numero(r.estoque_minimo_semanal_m) && !alertasDesativados.includes(chaveAlertaEstoque(r.medida_produto)))
        const porPagina = 4
        const totalPaginas = Math.ceil(alertas.length / porPagina)
        const paginaAtual = totalPaginas ? paginaAlertas % totalPaginas : 0
        const inicio = paginaAtual * porPagina
        const visiveis = alertas.slice(inicio, inicio + porPagina)
        return (
          <section className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
            <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 px-4 py-3 text-sm font-bold text-amber-950">
              <Bell className="size-4" /> Avisos de estoque baixo
              <span className="ml-auto rounded-full bg-amber-200 px-2.5 py-0.5 text-xs">{alertas.length} {alertas.length === 1 ? 'produto' : 'produtos'}</span>
            </div>
            {alertas.length === 0 ? <p className="px-4 py-3 text-sm text-amber-900">Nenhum produto abaixo do mínimo de metragem com notificação ativa.</p> : <>
              <div className="divide-y divide-amber-200">
                {visiveis.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="flex min-w-0 items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" /><div className="min-w-0">
                    <div className="text-sm font-bold text-amber-950">{r.medida_produto}</div>
                    <div className="text-xs text-amber-900">Atual: {fmt(r.metragem_disponivel_m)} m · mínimo: {fmt(r.estoque_minimo_semanal_m)} m</div>
                  </div></div>
                  <div className="text-right text-xs text-amber-900"><div className="font-bold">{usosPorProduto[r.medida_produto] ?? 0} utilizações</div><div>nos últimos 90 dias</div></div>
                </div>)}
              </div>
              {totalPaginas > 1 && <div className="flex items-center justify-between border-t border-amber-200 px-4 py-2">
                <button type="button" onClick={() => setPaginaAlertas((p) => (p - 1 + totalPaginas) % totalPaginas)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100"><ChevronLeft className="size-4" /> Anterior</button>
                <span className="text-xs text-amber-900">{inicio + 1}–{Math.min(inicio + porPagina, alertas.length)} de {alertas.length} · página {paginaAtual + 1}/{totalPaginas}</span>
                <button type="button" onClick={() => setPaginaAlertas((p) => (p + 1) % totalPaginas)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100">Próximos <ChevronRight className="size-4" /></button>
              </div>}
            </>}
          </section>
        )
      })()}
      {tipoEstoque === 'VIRGEM' && (() => {
        const avisos = minimosVirgem.map((item) => {
          const minimo = item.minimo_calibrado_kg ?? item.minimo_calculado_kg
          const valido = minimo != null && Number(minimo) > 0
          const bobinasMedida = bobinas.filter((b) => b.categoria === 'BOPP' && (b.medida_texto || fmtMedida(b.medida)) === item.referencia)
          const minimoBobinas = item.minimo_calibrado_bobinas ?? (valido && Number(item.peso_medio_bobina_kg) > 0 ? Math.ceil(Number(minimo) / Number(item.peso_medio_bobina_kg)) : null)
          const folga = minimoBobinas == null ? null : bobinasMedida.length - Number(minimoBobinas)
          const status = folga == null ? 'ATENÇÃO' : folga < 0 ? 'COMPRAR' : folga === 0 ? 'ATENÇÃO' : 'OK'
          return { referencia: item.referencia, atual: bobinasMedida.length, minimo: minimoBobinas, folga, status }
        }).filter((item) => item.status !== 'OK' && !alertasDesativados.includes(chaveAlertaEstoque(item.referencia)))
        if (!avisos.length) return null
        return (
          <section className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
            <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-3 text-sm font-bold text-amber-950"><Bell className="size-4" /> Notificações de estoque <span className="ml-auto rounded-full bg-amber-200 px-2.5 py-0.5 text-xs">{avisos.length}</span></div>
            <div className="divide-y divide-amber-200">
              {avisos.map((item) => <div key={item.referencia} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-700" /><span className="font-bold text-sm text-amber-950">{item.referencia}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${item.status === 'COMPRAR' ? 'bg-red-100 text-red-800' : 'bg-amber-200 text-amber-950'}`}>{item.status}</span></div>
                <span className="text-xs text-amber-900">Atual: {item.atual} · mínimo: {item.minimo ?? 'não definido'} bobinas</span>
              </div>)}
            </div>
          </section>
        )
      })()}

      {tipoEstoque === 'VIRGEM' && (
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">

          </div>
          {minimosVirgem.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              Os indicadores por medida aparecerão quando houver dados de estoque mínimo virgem.
            </div>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {[...minimosVirgem].sort((a, b) => ordenarReferenciaEstoque(a.referencia, b.referencia)).map((item) => {
                const minimo = item.minimo_calibrado_kg ?? item.minimo_calculado_kg
                const minimoValido = minimo != null && Number(minimo) > 0
                const atual = Number(item.peso_estoque_kg ?? 0)
                const bobinasMedida = bobinas.filter((b) => b.categoria === 'BOPP' && (b.medida_texto || fmtMedida(b.medida)) === item.referencia)
                const minimoBobinas = item.minimo_calibrado_bobinas ?? (minimoValido && Number(item.peso_medio_bobina_kg) > 0 ? Math.ceil(Number(minimo) / Number(item.peso_medio_bobina_kg)) : null)
                const folgaJumbos = minimoBobinas == null ? null : bobinasMedida.length - Number(minimoBobinas)
                const status = folgaJumbos == null ? 'ATENÇÃO' : folgaJumbos < 0 ? 'COMPRAR' : folgaJumbos === 0 ? 'ATENÇÃO' : 'OK'
                const estilo = status === 'COMPRAR' ? 'bg-red-100 text-red-800' : status === 'ATENÇÃO' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                return (
                  <article key={item.referencia} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Medida</p>
                        <h4 className="truncate text-lg font-bold text-slate-900">{item.referencia}</h4>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${estilo}`}>{status}</span>
                        {folgaJumbos !== null && <span className={`text-xs font-bold tabular-nums ${folgaJumbos < 0 ? 'text-red-700' : folgaJumbos === 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{folgaJumbos > 0 ? '+' : ''}{folgaJumbos} {Math.abs(folgaJumbos) === 1 ? 'jumbo' : 'jumbos'}</span>}
                        {folgaJumbos === null && <span className="text-[10px] text-amber-800">Mínimo não definido</span>}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] text-slate-500">Quantidade atual</p>
                        <p className="text-sm font-bold tabular-nums text-slate-900">{fmt(item.bobinas_estoque)} bobinas</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] text-slate-500">Peso atual</p>
                        <p className="text-sm font-bold tabular-nums text-slate-900">{fmt(atual, 1)} kg</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] text-slate-500">Mínimo em kg</p>
                        <p className="text-sm font-bold tabular-nums text-slate-900">{minimoValido ? `${fmt(Number(minimo), 1)} kg` : '—'}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] text-slate-500">Mínimo em bobinas</p>
                        <p className="text-sm font-bold tabular-nums text-slate-900">{minimoBobinas == null ? '—' : fmt(minimoBobinas)}</p>
                      </div>
                    </div>
                    <div className="mt-2 border-t border-slate-100 pt-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setDetalhesMedida((atual) => atual === item.referencia ? null : item.referencia)} aria-expanded={detalhesMedida === item.referencia} className="inline-flex items-center rounded-md bg-[#b91c26] px-3 py-2 text-xs font-bold text-white hover:bg-[#991b1b]">
                          {detalhesMedida === item.referencia ? 'Ocultar' : 'Detalhes'} · {bobinasMedida.length} bobinas
                        </button>
                        <button type="button" onClick={() => void alternarAlertaVirgem(item.referencia)} aria-label={alertasDesativados.includes(chaveAlertaEstoque(item.referencia)) ? 'Ativar notificação' : 'Desativar notificação'} title={alertasDesativados.includes(chaveAlertaEstoque(item.referencia)) ? 'Ativar notificação' : 'Desativar notificação'} className="inline-flex size-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100">
                          {alertasDesativados.includes(chaveAlertaEstoque(item.referencia)) ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                        </button>
                      </div>
                      {detalhesMedida === item.referencia && (
                        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetalhesMedida(null) }}>
                          <section role="dialog" aria-modal="true" aria-label={`Bobinas da medida ${item.referencia}`} className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                              <div><h3 className="font-bold text-slate-900">Bobinas da medida {item.referencia}</h3><p className="text-xs text-slate-500">{bobinasMedida.length} bobinas no estoque</p></div>
                              <button type="button" onClick={() => setDetalhesMedida(null)} className="rounded-md bg-[#b91c26] px-4 py-2 text-sm font-bold text-white hover:bg-[#991b1b]">Ocultar</button>
                            </header>
                            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4">
                              {bobinasMedida.length === 0 ? <p className="text-sm text-slate-500">Não há bobinas individuais cadastradas nesta medida.</p> : bobinasMedida.map((b) => (
                                <div key={b.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div><p className="font-mono text-sm font-bold text-slate-900">{b.codigo}</p><p className="text-xs text-slate-500">{b.categoria} · {b.fornecedor || 'Fornecedor não informado'}</p></div>
                                    <div className="flex gap-1">
                                      <button type="button" onClick={() => { setDetalhesMedida(null); abrirEdicao(b) }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Editar dados</button>
                                      {isDeveloper && <button type="button" onClick={() => void excluir(b)} className="rounded-md bg-[#e3262e] px-3 py-2 text-xs font-semibold text-white">Mover para lixeira</button>}
                                    </div>
                                  </div>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3">
                                    <span>Entrada: {b.data_entrada ? new Date(`${b.data_entrada}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</span>
                                    <span>Peso: {fmt(b.peso_kg, 1)} kg</span>
                                    <span>Local: {b.localizacao === 'GALPAO_MARIO_COVAS' ? 'Galpão Mario Covas' : 'Estoque'}</span>
                                    <span>NF: {b.nf || '—'}</span><span>Cor: {b.cor || '—'}</span><span>Cliente: {b.cliente || '—'}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {tipoEstoque === 'ADESIVADO' && (
        <section className="space-y-3">
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {[...resumos].sort((a, b) => ordenarReferenciaEstoque(a.medida_produto, b.medida_produto)).map((item) => {
              const atual = numero(item.metragem_disponivel_m)
              const minimo = numero(item.estoque_minimo_semanal_m)
              const folga = atual - minimo
              const status = minimo <= 0 ? 'ATENÇÃO' : folga < 0 ? 'COMPRAR' : folga === 0 ? 'ATENÇÃO' : 'OK'
              const estilo = status === 'COMPRAR' ? 'bg-red-100 text-red-800' : status === 'ATENÇÃO' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
              const chave = chaveAlertaEstoque(item.medida_produto)
              const desativado = alertasDesativados.includes(chave)
              return (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><h3 className="font-bold text-slate-900">{item.medida_produto}</h3><p className="text-xs text-slate-500">{item.categoria}</p></div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${estilo}`}>{status}</span>
                      <button type="button" onClick={() => void alternarAlertaProduto(codigoPorProduto[chave] ?? '', item.medida_produto)} aria-label={desativado ? 'Ativar notificação' : 'Desativar notificação'} title={desativado ? 'Ativar notificação' : 'Desativar notificação'} className="inline-flex size-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100">
                        {desativado ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">Quantidade atual</p><p className="text-sm font-bold text-slate-900">{fmt(item.quantidade_jumbos)} jumbos</p></div>
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">Peso atual</p><p className="text-sm font-bold text-slate-900">{fmt(item.peso_estoque_kg, 1)} kg</p></div>
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">Metragem atual</p><p className="text-sm font-bold text-slate-900">{fmt(atual)} m</p></div>
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">Mínimo semanal</p><p className="text-sm font-bold text-slate-900">{fmt(minimo)} m</p></div>
                  </div>
                  <p className={`mt-2 text-right text-xs font-bold tabular-nums ${folga < 0 ? 'text-red-700' : folga === 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{folga > 0 ? '+' : ''}{fmt(folga)} m sobre o mínimo</p>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Boxes className="size-4"/> Bobinas no estoque</div><div className="mt-2 text-2xl font-bold text-slate-900">{fmt(bobinas.length)}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Weight className="size-4"/> Peso disponível</div><div className="mt-2 text-2xl font-bold text-slate-900">{fmt(totalKg, 1)} <span className="text-sm font-medium">kg</span></div></div>
        {tipoEstoque === 'ADESIVADO' && <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Ruler className="size-4"/> Metragem disponível</div><div className="mt-2 text-2xl font-bold text-slate-900">{fmt(totalM)} <span className="text-sm font-medium">m</span></div></div>}
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Package className="size-4"/> {tipoEstoque === 'VIRGEM' ? 'Categoria' : 'Produtos monitorados'}</div><div className="mt-2 text-2xl font-bold text-slate-900">{tipoEstoque === 'VIRGEM' ? 'BOPP virgem' : fmt(resumos.length)}</div></div>
      </div>


        {tipoEstoque === 'ADESIVADO' && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-slate-900">Bobinas em estoque</h3>
            <div className="flex flex-wrap gap-2">
              <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-slate-400"/><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código, fornecedor..." className="h-9 w-56 rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-slate-500"/></div>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm"><option value="TODAS">Todas as categorias</option>{categoriasVisiveis.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
          </div>
          {carregando ? <p className="py-8 text-center text-sm text-slate-500">Carregando estoque...</p> : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="p-2">Entrada</th><th className="p-2">Categoria / medida</th><th className="p-2">Código / nome</th><th className="p-2">NF</th><th className="p-2">Fornecedor</th><th className="p-2 text-right">Peso</th><th className="p-2 text-right">Metros</th><th className="p-2 text-right">Ações</th></tr></thead>
                <tbody>{filtradas.map((b) => <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-2 text-slate-600">{b.data_entrada ? new Date(`${b.data_entrada}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="p-2"><div className="font-semibold text-slate-800">{b.categoria}</div><div className="text-xs text-slate-500">{b.medida_texto || fmtMedida(b.medida)}</div></td>
                  <td className="p-2 font-medium text-slate-800">{b.codigo ?? '—'}</td>
                  <td className="p-2">{b.nf || '—'}</td><td className="p-2">{b.fornecedor ?? '—'}</td><td className="p-2 text-right">{fmt(b.peso_kg,1)} kg</td><td className="p-2 text-right">{fmt(b.metragem_m)} m</td>
                  <td className="p-2"><div className="flex justify-end gap-1"><button type="button" title="Editar" onClick={() => abrirEdicao(b)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100"><Pencil className="size-4"/></button>{isDeveloper && <button type="button" title="Mover para lixeira" onClick={() => void excluir(b)} className="rounded-md bg-[#e3262e] p-2 text-white hover:bg-[#c91f27]"><Trash2 className="size-4"/></button>}</div></td>
                </tr>)}</tbody>
              </table>
              {!filtradas.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma bobina encontrada.</p>}
            </div>
          )}
        </section>
      )}

      {formAberto && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) setFormAberto(false) }}>
        <form onSubmit={salvar} className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="text-lg font-bold text-slate-900">{editando ? 'Editar bobina do estoque' : 'Adicionar bobina ao estoque'}</h3><p className="text-sm text-slate-500">Esta alteração afeta somente o saldo do Estoque Atual.</p></div><button type="button" onClick={() => setFormAberto(false)} className="rounded-lg p-2 hover:bg-slate-100"><X className="size-5"/></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">Categoria<select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as Categoria })} className="h-10 rounded-lg border border-slate-300 px-3">{categorias.map((c) => <option key={c}>{c}</option>)}</select></label>
            {tipoEstoque === 'VIRGEM' && <label className="grid gap-1 text-sm font-medium text-slate-700">Localização<select value={form.localizacao} onChange={(e) => setForm({ ...form, localizacao: e.target.value as FormEstoque['localizacao'] })} className="h-10 rounded-lg border border-slate-300 px-3"><option value="ESTOQUE">Estoque</option><option value="GALPAO_MARIO_COVAS">Galpão Mario Covas</option></select></label>}
            <label className="grid gap-1 text-sm font-medium text-slate-700">Data de entrada<input type="date" value={form.data_entrada} onChange={(e) => setForm({ ...form, data_entrada: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Código da bobina *<input required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Fornecedor<input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">NF<input value={form.nf} onChange={(e) => setForm({ ...form, nf: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">ABA / guia<input value={form.aba} onChange={(e) => setForm({ ...form, aba: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Medida / especificação<input inputMode="decimal" value={form.medida} onChange={(e) => setForm({ ...form, medida: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Peso (kg)<input inputMode="decimal" value={form.peso_kg} onChange={(e) => setForm({ ...form, peso_kg: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            {tipoEstoque === 'ADESIVADO' && <label className="grid gap-1 text-sm font-medium text-slate-700">Metragem (m)<input inputMode="decimal" value={form.metragem_m} onChange={(e) => setForm({ ...form, metragem_m: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>}
            <label className="grid gap-1 text-sm font-medium text-slate-700">Cor<input value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Cliente (pedido personalizado)<input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Linha<input value={form.linha} onChange={(e) => setForm({ ...form, linha: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">Observações<textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} className="rounded-lg border border-slate-300 px-3 py-2"/></label>
          </div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setFormAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button><button disabled={salvando} type="submit" className="rounded-lg bg-[#e3262e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c91f27] disabled:opacity-50">{salvando ? 'Salvando...' : 'Salvar bobina'}</button></div>
        </form>
      </div>}
    </div>
  )
}
