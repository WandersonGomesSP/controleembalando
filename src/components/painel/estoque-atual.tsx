import * as React from 'react'
import { Plus, Pencil, Trash2, RefreshCw, Search, X, Package, Weight, Ruler, Boxes, FileUp, Bell, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  listCurrentStock,
  createCurrentStockRecord,
  updateCurrentStockRecord,
  listCurrentStockTrash,
  moveCurrentStockToTrash,
  restoreCurrentStockRecord,
  permanentlyDeleteCurrentStockTrashRecord,
  importCurrentStockCsv,
} from '@/lib/admin.functions'

type Categoria = 'BOPP' | 'CREPE' | 'KRAFT' | 'DUPLA FACE'
type BobinaEstoque = {
  id: string; categoria: Categoria; data_entrada: string | null; fornecedor: string | null
  medida: number | null; peso_kg: number | null; metragem_m: number | null; codigo: string | null
  cor: string | null; cliente: string | null; linha: string | null; origem_arquivo: string; observacoes: string | null
}
type ResumoProduto = {
  id: string; medida_produto: string; peso_estoque_kg: number; metragem_disponivel_m: number
  consumo_movel_semanal_m: number | null; estoque_projetado_m: number | null
  estoque_minimo_semanal_m: number | null; quantidade_jumbos: number | null
  estoque_minimo_jumbos: number | null; status_origem: string | null; folga_estoque: string | null
  categoria: string
}
type BobinaLixeira = { id: string; categoria: Categoria; codigo: string | null; dados: BobinaEstoque; excluida_em: string }
type FormEstoque = {
  categoria: Categoria; data_entrada: string; fornecedor: string; medida: string
  peso_kg: string; metragem_m: string; codigo: string; cor: string; cliente: string; linha: string; observacoes: string
}
const vazio: FormEstoque = { categoria: 'BOPP', data_entrada: new Date().toISOString().slice(0, 10), fornecedor: '', medida: '', peso_kg: '', metragem_m: '', codigo: '', cor: '', cliente: '', linha: '', observacoes: '' }
const numero = (v: number | null | undefined) => Number(v ?? 0)
const fmt = (v: number | null | undefined, casas = 0) => numero(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const categorias: Categoria[] = ['BOPP', 'CREPE', 'KRAFT', 'DUPLA FACE']
const fmtMedida = (v: number | null | undefined) => v == null ? '—' : Number(v).toFixed(2)
const chaveAlertaEstoque = (valor: string) => valor.trim().toLocaleLowerCase('pt-BR')
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
    const categoriaBruta = valor(colunas, 'categoria', 'tipo_categoria').toUpperCase().replace(/_/g, ' ')
    const categoria: Categoria | null = categoriaBruta === 'BOPP' ? 'BOPP'
      : categoriaBruta === 'CREPE' ? 'CREPE'
      : categoriaBruta === 'KRAFT' ? 'KRAFT'
      : categoriaBruta === 'DUPLA FACE' ? 'DUPLA FACE'
      : categoriaDoArquivo
    const codigo = valor(colunas, 'codigo', 'codigo_bobina', 'codigo_da_bobina', 'cod_bob', 'cod_bobina', 'numero_bobina', 'numero_da_bobina', 'numero', 'id_bobina', 'identificacao')
    if (!colunas.some((v) => v.trim()) || !codigo) return null
    if (!categoria) throw new Error(`${nomeArquivo}: informe a categoria em cada linha ou use BOPP, CREPE, KRAFT ou DUPLA_FACE no nome do arquivo (linha ${indiceLinha + 2}).`)
    const medida = converterNumero(valor(colunas, 'medida', 'medidas', 'largura', 'largura_bobina', 'largura_bobina_texto', 'medida_texto', 'especificacao', 'medida_produto'))
    const peso = converterNumero(valor(colunas, 'peso_kg', 'peso', 'peso_bobina', 'peso_bobina_kg', 'peso_bobina_texto', 'peso_atual', 'kg'))
    const metragem = converterNumero(valor(colunas, 'metragem_m', 'metragem', 'metros', 'metragem_disponivel_m', 'metragem_bobina_texto', 'comprimento', 'metragem_unica'))
    const data = converterData(valor(colunas, 'data_entrada', 'data', 'entrada', 'data_de_entrada'))
    return {
      categoria, data_entrada: data, fornecedor: valor(colunas, 'fornecedor', 'fornec_filme', 'fornecedor_filme', 'fornec') || null,
      medida, peso_kg: peso, metragem_m: metragem, codigo,
      cor: valor(colunas, 'cor', 'cor_filme', 'cor_do_filme') || null,
      cliente: valor(colunas, 'cliente', 'cliente_personalizado', 'pedido') || null,
      linha: valor(colunas, 'linha', 'tipo_linha') || null,
      observacoes: valor(colunas, 'observacoes', 'observacao', 'obs') || null,
    }
  }).filter((registro): registro is NonNullable<typeof registro> => Boolean(registro))
  return registros
}

export function EstoqueAtualCobrideira({ isDeveloper }: { isDeveloper: boolean }) {
  const [bobinas, setBobinas] = React.useState<BobinaEstoque[]>([])
  const [resumos, setResumos] = React.useState<ResumoProduto[]>([])
  const [usosPorProduto, setUsosPorProduto] = React.useState<Record<string, number>>({})
  const [alertasDesativados, setAlertasDesativados] = React.useState<string[]>([])
  const [paginaAlertas, setPaginaAlertas] = React.useState(0)
  const [lixeira, setLixeira] = React.useState<BobinaLixeira[]>([])
  const [aba, setAba] = React.useState<'ATIVAS' | 'LIXEIRA'>('ATIVAS')
  const [carregando, setCarregando] = React.useState(true)
  const [salvando, setSalvando] = React.useState(false)
  const [importando, setImportando] = React.useState(false)
  const inputCsvRef = React.useRef<HTMLInputElement>(null)
  const [busca, setBusca] = React.useState('')
  const [categoria, setCategoria] = React.useState<'TODAS' | Categoria>('TODAS')
  const [form, setForm] = React.useState<FormEstoque>(vazio)
  const [editando, setEditando] = React.useState<string | null>(null)
  const [formAberto, setFormAberto] = React.useState(false)

  async function carregar() {
    setCarregando(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.')
      const result = await listCurrentStock({ data: { accessToken: sessionData.session.access_token } })
      setBobinas(result.bobinas as BobinaEstoque[])
      setResumos(result.resumos as ResumoProduto[])
      try {
        const dataLimite = new Date()
        dataLimite.setDate(dataLimite.getDate() - 90)
        const desde = dataLimite.toISOString().slice(0, 10)
        const { data: produtos, error: produtosError } = await supabase.schema('rebobinadeira')
          .from('produtos_jumbo').select('codigo, descricao, alerta_estoque_baixo_ativo').eq('ativo', true)
        if (produtosError) throw produtosError
        setAlertasDesativados((produtos ?? []).filter((p) => p.alerta_estoque_baixo_ativo === false).map((p) => chaveAlertaEstoque(p.descricao)))
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
      if (isDeveloper) {
        const arquivadas = await listCurrentStockTrash({ data: { accessToken: sessionData.session.access_token } })
        setLixeira(arquivadas as BobinaLixeira[])
      } else setLixeira([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o estoque atual.')
    } finally { setCarregando(false) }
  }
  React.useEffect(() => { void carregar() }, [])

  const filtradas = React.useMemo(() => bobinas.filter((b) => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    const bateCategoria = categoria === 'TODAS' || b.categoria === categoria
    const bateBusca = !termo || [b.codigo, b.fornecedor, b.cor, b.cliente, b.linha, b.medida, b.categoria]
      .some((v) => String(v ?? '').toLocaleLowerCase('pt-BR').includes(termo))
    return bateCategoria && bateBusca
  }), [bobinas, busca, categoria])

  const totalKg = bobinas.reduce((s, b) => s + numero(b.peso_kg), 0)
  const totalM = bobinas.reduce((s, b) => s + numero(b.metragem_m), 0)
  const porCategoria = [
    ...categorias.map((c) => ({
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

  function abrirNovo() { setEditando(null); setForm({ ...vazio }); setFormAberto(true) }
  function abrirEdicao(b: BobinaEstoque) {
    setEditando(b.id)
    setForm({
      categoria: b.categoria, data_entrada: b.data_entrada ?? '', fornecedor: b.fornecedor ?? '',
      medida: b.medida == null ? '' : String(b.medida), peso_kg: b.peso_kg == null ? '' : String(b.peso_kg),
      metragem_m: b.metragem_m == null ? '' : String(b.metragem_m), codigo: b.codigo ?? '',
      cor: b.cor ?? '', cliente: b.cliente ?? '', linha: b.linha ?? '', observacoes: b.observacoes ?? '',
    })
    setFormAberto(true)
  }
  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const peso = form.peso_kg.trim() ? Number(form.peso_kg.replace(',', '.')) : null
    const metros = form.metragem_m.trim() ? Number(form.metragem_m.replace(',', '.')) : null
    const medida = form.medida.trim() ? Number(form.medida.replace(',', '.')) : null
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
        fornecedor: form.fornecedor.trim() || null, medida, peso_kg: peso, metragem_m: metros,
        codigo: form.codigo.trim(), cor: form.cor.trim() || null, cliente: form.cliente.trim() || null, linha: form.linha.trim() || null,
        observacoes: form.observacoes.trim() || null,
      }
      if (editando) await updateCurrentStockRecord({ data: { accessToken, id: editando, registro } })
      else await createCurrentStockRecord({ data: { accessToken, registro } })
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
        if (registros.length) arquivosLidos++
        for (const registro of registros) {
          const chave = `${registro.categoria}|${registro.codigo}`
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
        const resultado = await importCurrentStockCsv({ data: { accessToken, registros: lote } })
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
      await moveCurrentStockToTrash({ data: { accessToken, id: b.id } })
      toast.success('Bobina movida para a lixeira do Estoque Atual.')
      await carregar()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível excluir a bobina.') }
  }

  async function restaurar(item: BobinaLixeira) {
    if (!window.confirm(`Restaurar a bobina ${item.codigo ?? ''} para o Estoque Atual?`)) return
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      await restoreCurrentStockRecord({ data: { accessToken, id: item.id } })
      toast.success('Bobina restaurada para o Estoque Atual.')
      await carregar()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível restaurar a bobina.') }
  }
  async function excluirDefinitivamente(item: BobinaLixeira) {
    if (!window.confirm(`Excluir definitivamente a bobina ${item.codigo ?? ''}? Esta ação não poderá ser desfeita.`)) return
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      await permanentlyDeleteCurrentStockTrashRecord({ data: { accessToken, id: item.id } })
      toast.success('Bobina excluída definitivamente da lixeira.')
      await carregar()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível excluir definitivamente a bobina.') }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold text-slate-900">Posição do estoque físico</h2><p className="text-sm text-slate-500">Edite ou exclua os itens daqui sem alterar o histórico de produção.</p><p className="mt-1 text-xs text-slate-500">Na importação, selecione vários CSVs de uma vez (BOPP, CREPE, DUPLA_FACE e KRAFT). Os arquivos são consolidados por categoria e código, sem duplicar bobinas.</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void carregar()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="size-4"/> Atualizar</button>
          {aba === 'ATIVAS' && <>
            <input ref={inputCsvRef} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => void importarCsvs(e.target.files)} />
            <button type="button" disabled={importando} onClick={() => inputCsvRef.current?.click()} className="csv-import-control inline-flex items-center gap-2 rounded-lg border border-[#e3262e] bg-[#e3262e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c91f27] disabled:opacity-50"><FileUp className="size-4"/> {importando ? 'Importando...' : 'Importar CSV'}</button>
            <button type="button" onClick={abrirNovo} className="inline-flex items-center gap-2 rounded-lg bg-[#57534E] px-3 py-2 text-sm font-semibold text-white hover:brightness-110"><Plus className="size-4"/> Nova bobina</button>
          </>}
        </div>
      </div>

      {aba === 'ATIVAS' && (() => {
        const alertas = resumos.filter((r) => numero(r.estoque_minimo_semanal_m) > 0 && numero(r.metragem_disponivel_m) < numero(r.estoque_minimo_semanal_m) && !alertasDesativados.includes(chaveAlertaEstoque(r.medida_produto)))
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
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAba('ATIVAS')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${aba === 'ATIVAS' ? 'bg-[#57534E] text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Estoque atual</button>
        {isDeveloper && <button type="button" onClick={() => setAba('LIXEIRA')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${aba === 'LIXEIRA' ? 'bg-[#57534E] text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Lixeira ({lixeira.length})</button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Boxes className="size-4"/> Bobinas no estoque</div><div className="mt-2 text-2xl font-bold text-slate-900">{fmt(bobinas.length)}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Weight className="size-4"/> Peso disponível</div><div className="mt-2 text-2xl font-bold text-slate-900">{fmt(totalKg, 1)} <span className="text-sm font-medium">kg</span></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Ruler className="size-4"/> Metragem disponível</div><div className="mt-2 text-2xl font-bold text-slate-900">{fmt(totalM)} <span className="text-sm font-medium">m</span></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Package className="size-4"/> Produtos monitorados</div><div className="mt-2 text-2xl font-bold text-slate-900">{fmt(resumos.length)}</div></div>
      </div>


      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-900">Estoque por categoria</h3>
          <div className="mt-3 grid gap-3">
            {porCategoria.map((p) => <div key={p.categoria}>
              <div className="flex justify-between gap-2 text-sm"><span className="font-semibold text-slate-700">{p.categoria}</span><span className="text-slate-500">{p.quantidade} {p.unidade} · {fmt(p.kg, 1)} kg</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#78716c]" style={{ width: `${Math.min(100, totalKg ? p.kg / totalKg * 100 : 0)}%` }}/></div>
              <div className="mt-1 text-xs text-slate-500">{fmt(p.metros)} m</div>
            </div>)}
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#E2E8F0] bg-[#F1F5F9] px-5 py-4">
            <h3 className="text-base font-bold text-[#0B1F4D]">Resumo por produto · planilha de referência</h3>
            <p className="mt-1 text-xs text-[#64748B]">Estoque mínimo e folga calculados em jumbos</p>
          </div>
          <div className="max-h-[520px] overflow-auto">
            {resumos.map((r, indice) => {
              const status = (r.status_origem ?? '').toUpperCase()
              const statusClass = status === 'OK'
                ? 'bg-[#15803D]'
                : status === 'ATENÇÃO'
                  ? 'bg-[#EA580C]'
                  : status === 'PRODUZIR' || status === 'COMPRAR'
                    ? 'bg-[#B91C1C]'
                    : 'bg-slate-500'
              const folga = Number.parseInt(r.folga_estoque ?? '0', 10) || 0
              const folgaLabel = folga > 0 ? `+${folga} ${folga === 1 ? 'jumbo' : 'jumbos'}` : folga < 0 ? `${folga} ${folga === -1 ? 'jumbo' : 'jumbos'}` : '0 jumbo'
              const folgaClass = folga > 0 ? 'text-[#15803D]' : folga < 0 ? 'text-[#B91C1C]' : 'text-[#64748B]'
              return (
                <div key={r.id} className={`grid grid-cols-1 gap-4 border-b border-[#E2E8F0] px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_240px] ${indice % 2 === 1 ? 'bg-[#F8FAFC]' : 'bg-white'}`}>
                  <div className="min-w-0">
                    <div className="text-base font-bold text-[#0B1F4D]">{r.medida_produto}</div>
                    <div className="my-2 h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
                      <div className="h-full rounded-full bg-[#0B1F4D]" style={{ width: `${Math.min(100, numero(r.peso_estoque_kg) / maxKg * 100)}%` }} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1 text-sm">
                      <span className="font-bold text-[#0B1F4D]">{fmt(r.peso_estoque_kg, 1)} kg</span>
                      <span className="text-[#64748B]">{fmt(r.metragem_disponivel_m)} m · {r.quantidade_jumbos ?? 0} jumbos</span>
                    </div>
                  </div>
                  <div className="text-left md:text-right">
                    <span className={`inline-block rounded-full px-3.5 py-1.5 text-xs font-bold text-white ${statusClass}`}>{r.status_origem ?? 'SEM STATUS'}</span>
                    <div className="mt-2 space-y-1 text-[13px] leading-[1.7] text-[#64748B]">
                      <div>Mínimo: <strong className="font-semibold text-[#1E293B]">{r.estoque_minimo_jumbos ?? '—'} jumbos</strong></div>
                      <div>Mínimo de metragem: <strong className="font-semibold text-[#1E293B]">{fmt(r.estoque_minimo_semanal_m)} m</strong></div>
                      <div className={`mt-1 text-sm font-bold ${folgaClass}`}>{folgaLabel}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-slate-900">{aba === 'ATIVAS' ? 'Bobinas em estoque' : 'Bobinas na lixeira'}</h3>
          {aba === 'ATIVAS' && <div className="flex flex-wrap gap-2">
            <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-slate-400"/><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código, fornecedor..." className="h-9 w-56 rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-slate-500"/></div>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm"><option value="TODAS">Todas as categorias</option>{categorias.map((c) => <option key={c}>{c}</option>)}</select>
          </div>}
        </div>
        {carregando ? <p className="py-8 text-center text-sm text-slate-500">Carregando estoque...</p> : aba === 'ATIVAS' ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="p-2">Entrada</th><th className="p-2">Categoria / medida</th><th className="p-2">Código</th><th className="p-2">Fornecedor</th><th className="p-2 text-right">Peso</th><th className="p-2 text-right">Metros</th><th className="p-2 text-right">Ações</th></tr></thead>
              <tbody>{filtradas.map((b) => <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-2 text-slate-600">{b.data_entrada ? new Date(`${b.data_entrada}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</td>
                <td className="p-2"><div className="font-semibold text-slate-800">{b.categoria}</div><div className="text-xs text-slate-500">{fmtMedida(b.medida)}</div></td>
                <td className="p-2 font-medium text-slate-800">{b.codigo ?? '—'}{b.cor || b.cliente ? <div className="text-xs text-slate-500">{b.cor ?? ''}{b.cliente ? ` · Cliente: ${b.cliente}` : ''} {b.linha ? `· ${b.linha}` : ''}</div> : null}</td>
                <td className="p-2 text-slate-600">{b.fornecedor ?? '—'}</td><td className="p-2 text-right tabular-nums">{fmt(b.peso_kg, 1)} kg</td><td className="p-2 text-right tabular-nums">{fmt(b.metragem_m)} m</td>
                <td className="p-2"><div className="flex justify-end gap-1"><button type="button" title="Editar" onClick={() => abrirEdicao(b)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100"><Pencil className="size-4"/></button>{isDeveloper && <button type="button" title="Mover para lixeira" onClick={() => void excluir(b)} className="rounded-md p-2 text-red-600 hover:bg-red-50"><Trash2 className="size-4"/></button>}</div></td>
              </tr>)}</tbody>
            </table>
            {!filtradas.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma bobina encontrada.</p>}
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="p-2">Excluída em</th><th className="p-2">Categoria / medida</th><th className="p-2">Código / cliente</th><th className="p-2">Fornecedor</th><th className="p-2 text-right">Peso</th><th className="p-2 text-right">Metros</th><th className="p-2 text-right">Ações</th></tr></thead>
              <tbody>{lixeira.map((item) => <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-2 text-slate-600">{new Date(item.excluida_em).toLocaleString('pt-BR')}</td>
                <td className="p-2"><div className="font-semibold text-slate-800">{item.dados.categoria}</div><div className="text-xs text-slate-500">{fmtMedida(item.dados.medida)}</div></td>
                <td className="p-2 font-medium text-slate-800">{item.codigo ?? '—'}{item.dados.cliente ? <div className="text-xs text-slate-500">Cliente: {item.dados.cliente}</div> : null}</td>
                <td className="p-2 text-slate-600">{item.dados.fornecedor ?? '—'}</td><td className="p-2 text-right tabular-nums">{fmt(item.dados.peso_kg, 1)} kg</td><td className="p-2 text-right tabular-nums">{fmt(item.dados.metragem_m)} m</td>
                <td className="p-2"><div className="flex justify-end gap-1"><button type="button" onClick={() => void restaurar(item)} className="rounded-md px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Restaurar</button><button type="button" title="Excluir definitivamente" onClick={() => void excluirDefinitivamente(item)} className="rounded-md p-2 text-red-600 hover:bg-red-50"><Trash2 className="size-4"/></button></div></td>
              </tr>)}</tbody>
            </table>
            {!lixeira.length && <p className="py-8 text-center text-sm text-slate-500">A lixeira está vazia.</p>}
          </div>
        )}
      </section>

      {formAberto && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) setFormAberto(false) }}>
        <form onSubmit={salvar} className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="text-lg font-bold text-slate-900">{editando ? 'Editar bobina do estoque' : 'Adicionar bobina ao estoque'}</h3><p className="text-sm text-slate-500">Esta alteração afeta somente o saldo do Estoque Atual.</p></div><button type="button" onClick={() => setFormAberto(false)} className="rounded-lg p-2 hover:bg-slate-100"><X className="size-5"/></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">Categoria<select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as Categoria })} className="h-10 rounded-lg border border-slate-300 px-3">{categorias.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Data de entrada<input type="date" value={form.data_entrada} onChange={(e) => setForm({ ...form, data_entrada: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Código da bobina *<input required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Fornecedor<input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Medida / especificação<input inputMode="decimal" value={form.medida} onChange={(e) => setForm({ ...form, medida: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Peso (kg)<input inputMode="decimal" value={form.peso_kg} onChange={(e) => setForm({ ...form, peso_kg: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Metragem (m)<input inputMode="decimal" value={form.metragem_m} onChange={(e) => setForm({ ...form, metragem_m: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Cor<input value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Cliente (pedido personalizado)<input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Linha<input value={form.linha} onChange={(e) => setForm({ ...form, linha: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">Observações<textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} className="rounded-lg border border-slate-300 px-3 py-2"/></label>
          </div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setFormAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button><button disabled={salvando} type="submit" className="rounded-lg bg-[#57534E] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">{salvando ? 'Salvando...' : 'Salvar bobina'}</button></div>
        </form>
      </div>}
    </div>
  )
}
