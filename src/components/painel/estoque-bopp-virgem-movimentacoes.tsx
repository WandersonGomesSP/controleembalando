import * as React from 'react'
import { ArrowDownToLine, ArrowUpFromLine, History, RefreshCw, ChevronDown, ChevronRight, Package, Save } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

type AbaBopp = 'entrada' | 'retirada' | 'consumo' | 'envios'
type RegistroEntrada = {
  id: string
  fornecedor: string
  medida_texto: string
  empresa: string | null
  nf: string | null
  data_emissao: string | null
  data_entrada: string
  peso_total_kg: number
  quantidade_bobinas: number
  created_at: string
}
type RegistroRetirada = {
  id: string
  data_envio: string
  destino: string
  quantidade_bobinas: number
  peso_total_kg: number
  created_at: string
}
type BobinaLinha = { id?: string; codigo: string; peso_kg?: number | null; medida_texto?: string | null; fornecedor?: string | null }
type EventoConsumo = {
  id: string; codigo: string; data_utilizacao: string | null; fornecedor: string | null;
  nota_fiscal: string | null; nota_fiscal_texto: string | null; data_entrada_origem: string | null; medida: number | null;
  peso_kg: number | null; operador: string | null; linha_arquivo: number | null;
}
type DadosEntradaCache = { fornecedor: string; empresa: string; nf: string; dataEmissao: string; dataEntrada: string }

const hoje = new Date().toISOString().slice(0, 10)
const formatarData = (v?: string | null) => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const formatarKg = (v: number | string | null | undefined) => v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
const lerCodigos = (v: string) => [...new Set(v.split(/[\r\n;,\t]+/).map(x => x.trim()).filter(Boolean))]
const numeroBR = (valor: string) => {
  let texto = valor.trim().replace(/\s/g, '')
  if (!texto) return NaN
  if (texto.includes(',') && texto.includes('.')) {
    texto = texto.lastIndexOf(',') > texto.lastIndexOf('.') ? texto.replace(/\./g, '').replace(',', '.') : texto.replace(/,/g, '')
  } else if (texto.includes(',')) texto = texto.replace(',', '.')
  return Number(texto)
}
const lerLinhasEntrada = (v: string) => v.split(/\\r?\\n/).map((linha, indice) => {
  const partes = linha.split(/[;|\\t]/).map(x => x.trim())
  const codigo = partes[0] || ''
  const peso = partes.length > 1 ? numeroBR(partes[1]) : NaN
  return { codigo, peso, linha: indice + 1 }
}).filter(x => x.codigo)

export function BoppVirgemMovimentacoes({ aba }: { aba: AbaBopp }) {
  const db = supabase.schema('estoque_atual') as any
  const [cacheEntrada, setCacheEntrada] = React.useState<DadosEntradaCache>(() => {
    try {
      const salvo = localStorage.getItem('controleembalando-bopp-entrada-cache')
      return salvo ? { ...{ fornecedor: '', empresa: '', nf: '', dataEmissao: '', dataEntrada: hoje }, ...JSON.parse(salvo) } : { fornecedor: '', empresa: '', nf: '', dataEmissao: '', dataEntrada: hoje }
    } catch { return { fornecedor: '', empresa: '', nf: '', dataEmissao: '', dataEntrada: hoje } }
  })
  const { fornecedor, empresa, nf, dataEmissao, dataEntrada } = cacheEntrada
  const atualizarCacheEntrada = (campo: keyof DadosEntradaCache, valor: string) => setCacheEntrada(atual => ({ ...atual, [campo]: valor }))
  const [medida, setMedida] = React.useState('')
  const [codigosEntrada, setCodigosEntrada] = React.useState('')
  const [dataEnvio, setDataEnvio] = React.useState(hoje)
  const [codigosRetirada, setCodigosRetirada] = React.useState('')
  const [entradas, setEntradas] = React.useState<RegistroEntrada[]>([])
  const [retiradas, setRetiradas] = React.useState<RegistroRetirada[]>([])
  const [consumo, setConsumo] = React.useState<EventoConsumo[]>([])
  const [detalhesConsumo, setDetalhesConsumo] = React.useState<Record<string, any[]>>({})
  const [carregandoDetalhes, setCarregandoDetalhes] = React.useState<string | null>(null)
  const [itensEntrada, setItensEntrada] = React.useState<Record<string, BobinaLinha[]>>({})
  const [itensRetirada, setItensRetirada] = React.useState<Record<string, any[]>>({})
  const [abertos, setAbertos] = React.useState<Set<string>>(new Set())
  const [carregando, setCarregando] = React.useState(false)
  const [salvando, setSalvando] = React.useState(false)

  const carregar = React.useCallback(async () => {
    setCarregando(true)
    try {
      if (aba === 'entrada') {
        const { data, error } = await db.from('entradas_bopp_virgem').select('*').order('data_entrada', { ascending: false }).order('created_at', { ascending: false })
        if (error) throw error
        setEntradas((data ?? []) as RegistroEntrada[])
      }
      if (aba === 'envios') {
        const { data, error } = await db.from('retiradas_bopp_virgem').select('*').order('data_envio', { ascending: false }).order('created_at', { ascending: false })
        if (error) throw error
        setRetiradas((data ?? []) as RegistroRetirada[])
      }
      if (aba === 'consumo') {
        const { data, error } = await db.from('bobinas_utilizadas_eventos').select('id,codigo,data_utilizacao,fornecedor,nota_fiscal,nota_fiscal_texto,data_entrada_origem,medida,peso_kg,operador,linha_arquivo').order('data_utilizacao', { ascending: false, nullsFirst: false }).order('codigo').range(0, 4999)
        if (error) throw error
        setConsumo(data ?? [])
      }
    } catch (error) {
      toast.error('Não foi possível carregar esta seção.', { description: error instanceof Error ? error.message : 'Verifique a conexão.' })
    } finally {
      setCarregando(false)
    }
  }, [aba])

  React.useEffect(() => { void carregar() }, [carregar])
  React.useEffect(() => {
    try { localStorage.setItem('controleembalando-bopp-entrada-cache', JSON.stringify(cacheEntrada)) } catch { /* cache local indisponível */ }
  }, [cacheEntrada])

  async function alternarEntrada(item: RegistroEntrada) {
    const novo = new Set(abertos)
    if (novo.has(item.id)) { novo.delete(item.id); setAbertos(novo); return }
    novo.add(item.id); setAbertos(novo)
    if (!itensEntrada[item.id]) {
      const { data, error } = await db.from('entradas_bopp_virgem_itens').select('codigo,peso_kg').eq('entrada_id', item.id).order('codigo')
      if (error) return toast.error('Não foi possível abrir os códigos da entrada.', { description: error.message })
      setItensEntrada(atual => ({ ...atual, [item.id]: data ?? [] }))
    }
  }

  async function alternarRetirada(item: RegistroRetirada) {
    const novo = new Set(abertos)
    if (novo.has(item.id)) { novo.delete(item.id); setAbertos(novo); return }
    novo.add(item.id); setAbertos(novo)
    if (!itensRetirada[item.id]) {
      const { data, error } = await db.from('retiradas_bopp_virgem_itens').select('codigo,dados_bobina').eq('retirada_id', item.id).order('codigo')
      if (error) return toast.error('Não foi possível abrir os códigos enviados.', { description: error.message })
      setItensRetirada(atual => ({ ...atual, [item.id]: data ?? [] }))
    }
  }

  async function salvarEntrada() {
    const linhas = lerLinhasEntrada(codigosEntrada)
    const codigos = linhas.map(x => x.codigo)
    const duplicados = codigos.filter((codigo, indice) => codigos.findIndex(x => x.toUpperCase() === codigo.toUpperCase()) !== indice)
    const linhasInvalidas = linhas.filter(x => !Number.isFinite(x.peso) || x.peso <= 0)
    const peso = linhas.reduce((total, x) => total + (Number.isFinite(x.peso) ? x.peso : 0), 0)
    if (!fornecedor.trim() || !medida.trim() || !dataEntrada || !linhas.length || linhasInvalidas.length || duplicados.length) {
      return toast.error('Informe fornecedor, medida, data de entrada e cada código com seu peso individual. Não repita códigos.')
    }
    setSalvando(true)
    try {
      const { data: sessao } = await supabase.auth.getSession()
      if (!sessao.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.')
      const { data: existentes, error: consultaError } = await db.from('bobinas_estoque_virgem').select('codigo').in('codigo', codigos)
      if (consultaError) throw consultaError
      if ((existentes ?? []).length) throw new Error(`Já existem no estoque: ${(existentes ?? []).map((x: any) => x.codigo).join(', ')}`)
      const { data: historicos, error: histError } = await db.from('bobinas_utilizadas').select('codigo').in('codigo', codigos)
      if (histError) throw histError
      if ((historicos ?? []).length) throw new Error(`Já constam no histórico de consumo: ${(historicos ?? []).map((x: any) => x.codigo).join(', ')}`)
      const { data: entrada, error: entradaError } = await db.from('entradas_bopp_virgem').insert({
        fornecedor: fornecedor.trim().toUpperCase(),
        medida_texto: medida.trim(),
        empresa: empresa.trim() || null,
        nf: nf.trim() || null,
        data_emissao: dataEmissao || null,
        data_entrada: dataEntrada,
        peso_total_kg: peso,
        quantidade_bobinas: codigos.length,
      }).select('*').single()
      if (entradaError) throw entradaError
      const medidaNumero = numeroBR(medida)
      const registros = linhas.map(({ codigo, peso: pesoIndividual }) => ({
        categoria: 'BOPP',
        data_entrada: dataEntrada,
        fornecedor: fornecedor.trim().toUpperCase(),
        medida: Number.isFinite(medidaNumero) ? medidaNumero : null,
        medida_texto: medida.trim(),
        nf: nf.trim() || null,
        peso_kg: Number(pesoIndividual.toFixed(3)),
        codigo,
        cliente: empresa.trim() || null,
        localizacao: 'ESTOQUE',
        entrada_id: entrada.id,
        origem_arquivo: 'Entrada agrupada BOPP',
        observacoes: 'Peso individual informado ao lado do código no recebimento.',
      }))
      const { data: bobinasCriadas, error: bobinasError } = await db.from('bobinas_estoque_virgem').insert(registros).select('id,codigo')
      if (bobinasError) {
        await db.from('entradas_bopp_virgem').delete().eq('id', entrada.id)
        throw bobinasError
      }
      const pesosPorCodigo = new Map(linhas.map(x => [x.codigo.toUpperCase(), x.peso]))
      const itensEntrada = (bobinasCriadas ?? []).map((bobina: any) => ({
        entrada_id: entrada.id,
        bobina_id: bobina.id,
        codigo: bobina.codigo,
        peso_kg: Number((pesosPorCodigo.get(String(bobina.codigo).toUpperCase()) ?? 0).toFixed(3)),
      }))
      const { error: itensEntradaError } = await db.from('entradas_bopp_virgem_itens').insert(itensEntrada)
      if (itensEntradaError) {
        await db.from('bobinas_estoque_virgem').delete().eq('entrada_id', entrada.id)
        await db.from('entradas_bopp_virgem').delete().eq('id', entrada.id)
        throw itensEntradaError
      }
      toast.success(`Entrada salva: ${codigos.length} bobina(s), total de ${formatarKg(peso)}.`)
      setMedida(''); setCodigosEntrada('')
      await carregar()
    } catch (error) {
      toast.error('Não foi possível registrar a entrada.', { description: error instanceof Error ? error.message : 'Verifique os dados.' })
    } finally { setSalvando(false) }
  }

  async function abrirDetalhesConsumo(codigo: string) {
    if (detalhesConsumo[codigo]) {
      setDetalhesConsumo(atual => { const novo = { ...atual }; delete novo[codigo]; return novo })
      return
    }
    setCarregandoDetalhes(codigo)
    try {
      const { data, error } = await supabase.schema('cobrideira').from('bobinas')
        .select('numero_bobina,data,material,largura,micragem,peso_final')
        .eq('cod_bob', codigo).order('data', { ascending: true }).order('numero_bobina')
      if (error) throw error
      setDetalhesConsumo(atual => ({ ...atual, [codigo]: data ?? [] }))
    } catch (error) {
      toast.error('Não foi possível consultar as bobinas produzidas.', { description: error instanceof Error ? error.message : 'Verifique a conexão.' })
    } finally { setCarregandoDetalhes(null) }
  }

  async function salvarRetirada() {
    const codigos = lerCodigos(codigosRetirada)
    if (!codigos.length) return toast.error('Cole um código de bobina por linha.')
    setSalvando(true)
    try {
      const { data: bobinas, error: consultaError } = await db.from('bobinas_estoque_virgem').select('*').in('codigo', codigos)
      if (consultaError) throw consultaError
      const encontradas = bobinas ?? []
      const codigosEncontrados = new Set(encontradas.map((x: any) => x.codigo))
      const faltantes = codigos.filter(codigo => !codigosEncontrados.has(codigo))
      if (faltantes.length) throw new Error(`Não encontrei no estoque: ${faltantes.join(', ')}`)
      if (encontradas.length !== codigos.length) throw new Error('Há códigos repetidos ou mais de um registro com o mesmo código no estoque.')
      const peso = encontradas.reduce((total: number, item: any) => total + Number(item.peso_kg ?? 0), 0)
      const { data: retirada, error: retiradaError } = await db.from('retiradas_bopp_virgem').insert({
        data_envio: dataEnvio,
        destino: 'BAHIA',
        quantidade_bobinas: encontradas.length,
        peso_total_kg: Number(peso.toFixed(3)),
      }).select('*').single()
      if (retiradaError) throw retiradaError
      const itens = encontradas.map((item: any) => ({ retirada_id: retirada.id, codigo: item.codigo, dados_bobina: item }))
      const { error: itensError } = await db.from('retiradas_bopp_virgem_itens').insert(itens)
      if (itensError) { await db.from('retiradas_bopp_virgem').delete().eq('id', retirada.id); throw itensError }
      const { error: excluirError } = await db.from('bobinas_estoque_virgem').delete().in('id', encontradas.map((x: any) => x.id))
      if (excluirError) { await db.from('retiradas_bopp_virgem').delete().eq('id', retirada.id); throw excluirError }
      toast.success(`${encontradas.length} bobina(s) retirada(s) do estoque e registradas para Bahia.`)
      setCodigosRetirada('')
      await carregar()
    } catch (error) {
      toast.error('Não foi possível registrar a retirada.', { description: error instanceof Error ? error.message : 'Verifique os códigos.' })
    } finally { setSalvando(false) }
  }

  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 sm:p-4">
      {aba === 'entrada' && <>
        <div>
          <h3 className="text-base font-bold">Entrada de BOPP</h3>
          <p className="text-xs text-slate-500">Cadastre um recebimento agrupado e vincule todos os códigos individuais a ele.</p>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold">Fornecedor<input value={fornecedor} onChange={e => atualizarCacheEntrada('fornecedor', e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">Medida<input value={medida} onChange={e => setMedida(e.target.value)} placeholder="1270.20" className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">Empresa<input value={empresa} onChange={e => atualizarCacheEntrada('empresa', e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">NF<input value={nf} onChange={e => atualizarCacheEntrada('nf', e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">Data de emissão<input type="date" value={dataEmissao} onChange={e => atualizarCacheEntrada('dataEmissao', e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">Data de entrada<input type="date" value={dataEntrada} onChange={e => atualizarCacheEntrada('dataEntrada', e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
        </div>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          <strong>Atenção:</strong> informe o peso individual ao lado de cada código, separados por ponto e vírgula, tabulação ou barra vertical. Exemplo: <code>9003065584; 440</code>. O sistema não divide o peso total por média.
        </div>
        <label className="grid gap-1 text-xs font-semibold">Código da bobina; peso individual (kg) · uma bobina por linha
          <textarea value={codigosEntrada} onChange={e => setCodigosEntrada(e.target.value)} rows={7} placeholder={'9003065584; 440\n9003065425; 432\n9003065583; 439'} className="w-full min-w-0 rounded-md border border-slate-300 p-3 font-mono text-sm font-normal" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">{lerLinhasEntrada(codigosEntrada).length} código(s) · peso total calculado: {formatarKg(lerLinhasEntrada(codigosEntrada).reduce((t,x)=>t+(Number.isFinite(x.peso)?x.peso:0),0))}</p>
          <button type="button" onClick={() => void salvarEntrada()} disabled={salvando} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#c91d26] px-4 text-xs font-bold text-white hover:bg-[#a9151e] disabled:opacity-50"><Save className="size-4" />{salvando ? 'Salvando...' : 'Salvar entrada'}</button>
        </div>
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-bold">Recebimentos registrados</h4><button onClick={() => void carregar()} className="text-xs font-semibold text-red-700">Atualizar</button></div>
          {entradas.map(item => <article key={item.id} className="rounded-lg border border-slate-200 p-3">
            <button type="button" onClick={() => void alternarEntrada(item)} className="flex w-full min-w-0 items-center gap-2 text-left">
              {abertos.has(item.id) ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
              <span className="min-w-0 flex-1"><strong className="block text-sm">{item.fornecedor} · {item.medida_texto}</strong><span className="text-xs text-slate-500">{item.empresa || 'Empresa não informada'} · NF {item.nf || '—'} · Emissão {formatarData(item.data_emissao)} · Entrada {formatarData(item.data_entrada)}</span></span>
              <span className="text-right text-xs font-bold">{formatarKg(item.peso_total_kg)}<span className="block font-normal text-slate-500">{item.quantidade_bobinas} bobinas</span></span>
            </button>
            {abertos.has(item.id) && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3 lg:grid-cols-4">{(itensEntrada[item.id] ?? []).map(b => <div key={b.codigo} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-slate-50 p-2"><p className="break-all font-mono text-xs font-bold">{b.codigo}</p><p className="shrink-0 text-xs font-semibold">{formatarKg(b.peso_kg)}</p></div>)}</div>}
          </article>)}
          {!entradas.length && <p className="py-4 text-center text-xs text-slate-500">Nenhum recebimento registrado.</p>}
        </div>
      </>}

      {aba === 'retirada' && <>
        <div><h3 className="text-base font-bold">Retirada para Bahia</h3><p className="text-xs text-slate-500">Cole os códigos que estão no estoque. As bobinas encontradas sairão do saldo e ficarão no histórico de envio.</p></div>
        <label className="grid gap-1 text-xs font-semibold">Data de envio<input type="date" value={dataEnvio} onChange={e => setDataEnvio(e.target.value)} className="h-9 w-full max-w-xs rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
        <label className="grid gap-1 text-xs font-semibold">Códigos das bobinas · um por linha<textarea rows={7} value={codigosRetirada} onChange={e => setCodigosRetirada(e.target.value)} placeholder={'Cole um código por linha'} className="w-full min-w-0 rounded-md border border-slate-300 p-3 font-mono text-sm font-normal" /></label>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">{lerCodigos(codigosRetirada).length} código(s) únicos</p><button type="button" onClick={() => void salvarRetirada()} disabled={salvando} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#c91d26] px-4 text-xs font-bold text-white disabled:opacity-50"><ArrowUpFromLine className="size-4" />{salvando ? 'Salvando...' : 'Registrar retirada'}</button></div>
      </>}

      {aba === 'consumo' && <>
        <div><h3 className="text-base font-bold">Histórico de Consumo Virgem</h3><p className="text-xs text-slate-500">Consumos importados do CSV, com fornecedor, NF, entrada, peso e operador.</p></div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm font-semibold">{consumo.length.toLocaleString('pt-BR')} evento(s) de produção carregados</div>
        <div className="max-h-[620px] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-100"><tr>{['Código','Data produção','Fornecedor / NF','Data entrada','Medida','Peso','Operador','Detalhes'].map(x => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead>
            <tbody>{consumo.map(item => <React.Fragment key={item.id}>
              <tr className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono font-bold">{item.codigo}</td>
                <td className="px-3 py-2">{formatarData(item.data_utilizacao)}</td>
                <td className="px-3 py-2">{item.fornecedor || '—'}<span className="block text-[10px] text-slate-500">NF {item.nota_fiscal || '—'}</span><span className="block max-w-48 truncate text-[10px] text-slate-400" title={item.nota_fiscal_texto || ''}>{item.nota_fiscal_texto || ''}</span></td>
                <td className="px-3 py-2">{formatarData(item.data_entrada_origem)}</td>
                <td className="px-3 py-2">{item.medida ?? '—'}</td>
                <td className="px-3 py-2">{formatarKg(item.peso_kg)}</td>
                <td className="px-3 py-2">{item.operador || '—'}</td>
                <td className="px-3 py-2"><button type="button" onClick={() => void abrirDetalhesConsumo(item.codigo)} className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:border-red-500 hover:text-red-700">{carregandoDetalhes === item.codigo ? 'Buscando...' : detalhesConsumo[item.codigo] ? 'Ocultar' : 'Detalhes'}</button></td>
              </tr>
              {detalhesConsumo[item.codigo] && <tr className="border-t border-slate-100 bg-slate-50"><td colSpan={8} className="p-3">
                <p className="mb-2 font-semibold">Bobinas produzidas com o código {item.codigo}</p>
                {detalhesConsumo[item.codigo].length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{detalhesConsumo[item.codigo].map((b:any)=><div key={b.numero_bobina} className="rounded-md border border-slate-200 bg-white p-2"><strong className="font-mono">{b.numero_bobina}</strong><p className="text-[10px] text-slate-500">{formatarData(b.data)} · {b.material} · {b.largura}.{String(b.micragem).padStart(2,'0')}</p><p className="text-[10px] text-slate-500">{formatarKg(b.peso_final)}</p></div>)}</div> : <p className="text-xs text-slate-500">Não localizei número de bobina produzido para este código no cadastro da Cobrideira.</p>}
              </td></tr>}
            </React.Fragment>)}</tbody>
          </table>
        </div>
      </>}

      {aba === 'envios' && <>
        <div><h3 className="text-base font-bold">Histórico de envio para BA</h3><p className="text-xs text-slate-500">Cada retirada fica salva com a relação de códigos e os dados das bobinas retiradas.</p></div>
        {retiradas.map(item => <article key={item.id} className="rounded-lg border border-slate-200 p-3">
          <button type="button" onClick={() => void alternarRetirada(item)} className="flex w-full items-center gap-2 text-left">
            {abertos.has(item.id) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <span className="flex-1"><strong className="block text-sm">{item.destino} · {formatarData(item.data_envio)}</strong><span className="text-xs text-slate-500">{item.quantidade_bobinas} bobinas enviadas</span></span>
            <strong className="text-sm">{formatarKg(item.peso_total_kg)}</strong>
          </button>
          {abertos.has(item.id) && <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-3">{(itensRetirada[item.id] ?? []).map((b, i) => <div key={i} className="min-w-0 rounded-md bg-slate-50 p-2"><p className="break-all font-mono text-xs font-bold">{b.codigo}</p><p className="text-[10px] text-slate-600">{b.dados_bobina?.fornecedor || 'Fornecedor não informado'} · {b.dados_bobina?.medida_texto || b.dados_bobina?.medida || 'Medida não informada'}</p><p className="text-[10px] text-slate-600">{formatarKg(b.dados_bobina?.peso_kg)} · NF {b.dados_bobina?.nf || '—'}</p><p className="text-[10px] text-slate-500">Entrada: {formatarData(b.dados_bobina?.data_entrada)} · Produção/envio: {formatarData(b.dados_bobina?.data_envio)}</p><p className="text-[10px] text-slate-500">Registro: {b.dados_bobina?.operador_origem || 'Enviado para Bahia'}</p></div>)}</div>}
        </article>)}
        {!retiradas.length && <p className="py-6 text-center text-xs text-slate-500">Nenhum envio para Bahia registrado.</p>}
      </>}

      {carregando && <div className="flex items-center gap-2 text-xs text-slate-500"><RefreshCw className="size-4 animate-spin" /> Atualizando registros...</div>}
    </section>
  )
}
