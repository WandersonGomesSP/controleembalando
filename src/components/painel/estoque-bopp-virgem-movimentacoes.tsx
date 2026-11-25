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
type BobinaLinha = { id?: string; codigo: string; peso_kg?: number | null; peso_rateado_kg?: number | null; medida_texto?: string | null; fornecedor?: string | null }

const hoje = new Date().toISOString().slice(0, 10)
const formatarData = (v?: string | null) => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const formatarKg = (v: number | string | null | undefined) => v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
const lerCodigos = (v: string) => [...new Set(v.split(/[\r\n;,\t]+/).map(x => x.trim()).filter(Boolean))]

export function BoppVirgemMovimentacoes({ aba }: { aba: AbaBopp }) {
  const db = supabase.schema('estoque_atual') as any
  const [fornecedor, setFornecedor] = React.useState('')
  const [medida, setMedida] = React.useState('')
  const [empresa, setEmpresa] = React.useState('')
  const [nf, setNf] = React.useState('')
  const [dataEmissao, setDataEmissao] = React.useState('')
  const [dataEntrada, setDataEntrada] = React.useState(hoje)
  const [pesoTotal, setPesoTotal] = React.useState('')
  const [codigosEntrada, setCodigosEntrada] = React.useState('')
  const [dataEnvio, setDataEnvio] = React.useState(hoje)
  const [codigosRetirada, setCodigosRetirada] = React.useState('')
  const [entradas, setEntradas] = React.useState<RegistroEntrada[]>([])
  const [retiradas, setRetiradas] = React.useState<RegistroRetirada[]>([])
  const [consumo, setConsumo] = React.useState<any[]>([])
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
        const { data, error } = await db.from('bobinas_utilizadas').select('id,codigo,data_utilizacao,fornecedor,medida,peso_kg,metragem_m,cor,linha,origem_arquivo').order('data_utilizacao', { ascending: false, nullsFirst: false }).order('codigo').range(0, 4999)
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

  async function alternarEntrada(item: RegistroEntrada) {
    const novo = new Set(abertos)
    if (novo.has(item.id)) { novo.delete(item.id); setAbertos(novo); return }
    novo.add(item.id); setAbertos(novo)
    if (!itensEntrada[item.id]) {
      const { data, error } = await db.from('entradas_bopp_virgem_itens').select('codigo,peso_rateado_kg').eq('entrada_id', item.id).order('codigo')
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
    const codigos = lerCodigos(codigosEntrada)
    const peso = Number(pesoTotal.replace(',', '.'))
    if (!fornecedor.trim() || !medida.trim() || !dataEntrada || !Number.isFinite(peso) || peso <= 0 || !codigos.length) {
      return toast.error('Preencha fornecedor, medida, data de entrada, peso total e pelo menos um código.')
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
      const medidaNumero = Number(medida.replace(',', '.'))
      const pesoMedio = peso / codigos.length
      const registros = codigos.map(codigo => ({
        categoria: 'BOPP',
        data_entrada: dataEntrada,
        fornecedor: fornecedor.trim().toUpperCase(),
        medida: Number.isFinite(medidaNumero) ? medidaNumero : null,
        medida_texto: medida.trim(),
        nf: nf.trim() || null,
        peso_kg: Number(pesoMedio.toFixed(3)),
        codigo,
        cliente: empresa.trim() || null,
        localizacao: 'ESTOQUE',
        entrada_id: entrada.id,
        origem_arquivo: 'Entrada agrupada BOPP',
        observacoes: 'Peso médio rateado do peso total informado no recebimento; não representa pesagem individual.',
      }))
      const { data: bobinasCriadas, error: bobinasError } = await db.from('bobinas_estoque_virgem').insert(registros).select('id,codigo')
      if (bobinasError) {
        await db.from('entradas_bopp_virgem').delete().eq('id', entrada.id)
        throw bobinasError
      }
      const itensEntrada = (bobinasCriadas ?? []).map((bobina: any) => ({
        entrada_id: entrada.id,
        bobina_id: bobina.id,
        codigo: bobina.codigo,
        peso_rateado_kg: Number(pesoMedio.toFixed(3)),
      }))
      const { error: itensEntradaError } = await db.from('entradas_bopp_virgem_itens').insert(itensEntrada)
      if (itensEntradaError) {
        await db.from('bobinas_estoque_virgem').delete().eq('entrada_id', entrada.id)
        await db.from('entradas_bopp_virgem').delete().eq('id', entrada.id)
        throw itensEntradaError
      }
      toast.success(`Entrada salva: ${codigos.length} bobina(s) vinculada(s) ao recebimento.`)
      setFornecedor(''); setMedida(''); setEmpresa(''); setNf(''); setDataEmissao(''); setDataEntrada(hoje); setPesoTotal(''); setCodigosEntrada('')
      await carregar()
    } catch (error) {
      toast.error('Não foi possível registrar a entrada.', { description: error instanceof Error ? error.message : 'Verifique os dados.' })
    } finally { setSalvando(false) }
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
          <label className="grid gap-1 text-xs font-semibold">Fornecedor<input value={fornecedor} onChange={e => setFornecedor(e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">Medida<input value={medida} onChange={e => setMedida(e.target.value)} placeholder="1270.20" className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">Empresa<input value={empresa} onChange={e => setEmpresa(e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">NF<input value={nf} onChange={e => setNf(e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">Data de emissão<input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">Data de entrada<input type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
          <label className="grid gap-1 text-xs font-semibold">Peso total (kg)<input inputMode="decimal" value={pesoTotal} onChange={e => setPesoTotal(e.target.value)} placeholder="1723,50" className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal" /></label>
        </div>
        <label className="grid gap-1 text-xs font-semibold">Códigos das bobinas · um por linha
          <textarea value={codigosEntrada} onChange={e => setCodigosEntrada(e.target.value)} rows={6} placeholder={'Cole os códigos aqui, um em cada linha'} className="w-full min-w-0 rounded-md border border-slate-300 p-3 font-mono text-sm font-normal" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">{lerCodigos(codigosEntrada).length} código(s) únicos · peso médio rateado: {pesoTotal.trim() && lerCodigos(codigosEntrada).length ? formatarKg(Number(pesoTotal.replace(',', '.')) / lerCodigos(codigosEntrada).length) : '—'}</p>
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
            {abertos.has(item.id) && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3 lg:grid-cols-4">{(itensEntrada[item.id] ?? []).map(b => <div key={b.codigo} className="rounded-md bg-slate-50 p-2"><p className="break-all font-mono text-xs font-bold">{b.codigo}</p><p className="text-[10px] text-slate-500">{formatarKg(b.peso_rateado_kg)} · peso médio rateado</p></div>)}</div>}
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
        <div><h3 className="text-base font-bold">Histórico de Consumo Virgem</h3><p className="text-xs text-slate-500">Bobinas adesivas importadas como consumo histórico. Campos que não vieram no arquivo permanecem em branco.</p></div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm font-semibold">{consumo.length.toLocaleString('pt-BR')} registro(s) carregados</div>
        <div className="max-h-[560px] overflow-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{['Código','Data de consumo','Fornecedor','Medida','Peso','Origem'].map(x => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody>{consumo.map(item => <tr key={item.id} className="border-t border-slate-100"><td className="px-3 py-2 font-mono font-bold">{item.codigo}</td><td className="px-3 py-2">{formatarData(item.data_utilizacao)}</td><td className="px-3 py-2">{item.fornecedor || '—'}</td><td className="px-3 py-2">{item.medida || '—'}</td><td className="px-3 py-2">{formatarKg(item.peso_kg)}</td><td className="px-3 py-2">{item.origem_arquivo || '—'}</td></tr>)}</tbody></table></div>
      </>}

      {aba === 'envios' && <>
        <div><h3 className="text-base font-bold">Histórico de envio para BA</h3><p className="text-xs text-slate-500">Cada retirada fica salva com a relação de códigos e os dados das bobinas retiradas.</p></div>
        {retiradas.map(item => <article key={item.id} className="rounded-lg border border-slate-200 p-3">
          <button type="button" onClick={() => void alternarRetirada(item)} className="flex w-full items-center gap-2 text-left">
            {abertos.has(item.id) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <span className="flex-1"><strong className="block text-sm">{item.destino} · {formatarData(item.data_envio)}</strong><span className="text-xs text-slate-500">{item.quantidade_bobinas} bobinas enviadas</span></span>
            <strong className="text-sm">{formatarKg(item.peso_total_kg)}</strong>
          </button>
          {abertos.has(item.id) && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3 lg:grid-cols-4">{(itensRetirada[item.id] ?? []).map((b, i) => <div key={i} className="rounded-md bg-slate-50 p-2"><p className="break-all font-mono text-xs font-bold">{b.codigo}</p><p className="text-[10px] text-slate-500">{b.dados_bobina?.medida_texto || '—'} · {formatarKg(b.dados_bobina?.peso_kg)}</p></div>)}</div>}
        </article>)}
        {!retiradas.length && <p className="py-6 text-center text-xs text-slate-500">Nenhum envio para Bahia registrado.</p>}
      </>}

      {carregando && <div className="flex items-center gap-2 text-xs text-slate-500"><RefreshCw className="size-4 animate-spin" /> Atualizando registros...</div>}
    </section>
  )
}
