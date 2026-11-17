import * as React from 'react'
import { Plus, Pencil, Trash2, RefreshCw, Search, X, Package, Weight, Ruler, Boxes } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  listCurrentStock,
  createCurrentStockRecord,
  updateCurrentStockRecord,
  deleteCurrentStockRecord,
} from '@/lib/admin.functions'

type Categoria = 'BOPP' | 'CREPE' | 'KRAFT' | 'DUPLA FACE'
type BobinaEstoque = {
  id: string; categoria: Categoria; data_entrada: string | null; fornecedor: string | null
  medida: number | null; peso_kg: number | null; metragem_m: number | null; codigo: string | null
  cor: string | null; linha: string | null; origem_arquivo: string; observacoes: string | null
}
type ResumoProduto = {
  id: string; medida_produto: string; peso_estoque_kg: number; metragem_disponivel_m: number
  consumo_movel_semanal_m: number | null; estoque_projetado_m: number | null
  estoque_minimo_semanal_m: number | null; quantidade_jumbos: number | null
  estoque_minimo_jumbos: number | null; status_origem: string | null; folga_estoque: string | null
  categoria: string
}
type FormEstoque = {
  categoria: Categoria; data_entrada: string; fornecedor: string; medida: string
  peso_kg: string; metragem_m: string; codigo: string; cor: string; linha: string; observacoes: string
}
const vazio: FormEstoque = { categoria: 'BOPP', data_entrada: new Date().toLocaleDateString('en-CA'), fornecedor: '', medida: '', peso_kg: '', metragem_m: '', codigo: '', cor: '', linha: '', observacoes: '' }
const numero = (v: number | null | undefined) => Number(v ?? 0)
const fmt = (v: number | null | undefined, casas = 0) => numero(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const categorias: Categoria[] = ['BOPP', 'CREPE', 'KRAFT', 'DUPLA FACE']

export function EstoqueAtualCobrideira() {
  const [bobinas, setBobinas] = React.useState<BobinaEstoque[]>([])
  const [resumos, setResumos] = React.useState<ResumoProduto[]>([])
  const [carregando, setCarregando] = React.useState(true)
  const [salvando, setSalvando] = React.useState(false)
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o estoque atual.')
    } finally { setCarregando(false) }
  }
  React.useEffect(() => { void carregar() }, [])

  const filtradas = React.useMemo(() => bobinas.filter((b) => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    const bateCategoria = categoria === 'TODAS' || b.categoria === categoria
    const bateBusca = !termo || [b.codigo, b.fornecedor, b.cor, b.linha, b.medida, b.categoria]
      .some((v) => String(v ?? '').toLocaleLowerCase('pt-BR').includes(termo))
    return bateCategoria && bateBusca
  }), [bobinas, busca, categoria])

  const totalKg = bobinas.reduce((s, b) => s + numero(b.peso_kg), 0)
  const totalM = bobinas.reduce((s, b) => s + numero(b.metragem_m), 0)
  const porCategoria = categorias.map((c) => ({
    categoria: c,
    quantidade: bobinas.filter((b) => b.categoria === c).length,
    kg: bobinas.filter((b) => b.categoria === c).reduce((s, b) => s + numero(b.peso_kg), 0),
    metros: bobinas.filter((b) => b.categoria === c).reduce((s, b) => s + numero(b.metragem_m), 0),
  }))
  const maxKg = Math.max(1, ...resumos.map((r) => numero(r.peso_estoque_kg)))

  function abrirNovo() { setEditando(null); setForm({ ...vazio }); setFormAberto(true) }
  function abrirEdicao(b: BobinaEstoque) {
    setEditando(b.id)
    setForm({
      categoria: b.categoria, data_entrada: b.data_entrada ?? '', fornecedor: b.fornecedor ?? '',
      medida: b.medida == null ? '' : String(b.medida), peso_kg: b.peso_kg == null ? '' : String(b.peso_kg),
      metragem_m: b.metragem_m == null ? '' : String(b.metragem_m), codigo: b.codigo ?? '',
      cor: b.cor ?? '', linha: b.linha ?? '', observacoes: b.observacoes ?? '',
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
        codigo: form.codigo.trim(), cor: form.cor.trim() || null, linha: form.linha.trim() || null,
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
  async function excluir(b: BobinaEstoque) {
    if (!window.confirm(`Excluir a bobina ${b.codigo ?? ''} do Estoque Atual? Essa ação não altera o histórico de produção.`)) return
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.')
      await deleteCurrentStockRecord({ data: { accessToken, id: b.id } })
      toast.success('Bobina removida do estoque atual.')
      await carregar()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível excluir a bobina.') }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold text-slate-900">Posição do estoque físico</h2><p className="text-sm text-slate-500">Edite ou exclua os itens daqui sem alterar o histórico de produção.</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void carregar()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="size-4"/> Atualizar</button>
          <button type="button" onClick={abrirNovo} className="inline-flex items-center gap-2 rounded-lg bg-[#57534E] px-3 py-2 text-sm font-semibold text-white hover:brightness-110"><Plus className="size-4"/> Nova bobina</button>
        </div>
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
              <div className="flex justify-between gap-2 text-sm"><span className="font-semibold text-slate-700">{p.categoria}</span><span className="text-slate-500">{p.quantidade} bobinas · {fmt(p.kg, 1)} kg</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#78716c]" style={{ width: `${Math.min(100, totalKg ? p.kg / totalKg * 100 : 0)}%` }}/></div>
              <div className="mt-1 text-xs text-slate-500">{fmt(p.metros)} m</div>
            </div>)}
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-900">Resumo por produto · estoque mínimo</h3>
          <div className="mt-3 max-h-64 space-y-3 overflow-auto">
            {resumos.map((r) => <div key={r.id}>
              <div className="flex justify-between gap-2 text-sm"><span className="font-medium text-slate-700">{r.medida_produto}</span><span className="text-slate-500">{fmt(r.peso_estoque_kg, 1)} kg</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#78716c]" style={{ width: `${Math.min(100, numero(r.peso_estoque_kg) / maxKg * 100)}%` }}/></div>
              <div className="mt-1 flex justify-between gap-2 text-xs text-slate-500"><span>{fmt(r.metragem_disponivel_m)} m · {r.quantidade_jumbos ?? 0} jumbos</span><span>{r.status_origem ?? 'Sem status'}</span></div>
            </div>)}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-slate-900">Bobinas em estoque</h3>
          <div className="flex flex-wrap gap-2">
            <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-slate-400"/><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código, fornecedor..." className="h-9 w-56 rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-slate-500"/></div>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm"><option value="TODAS">Todas as categorias</option>{categorias.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
        </div>
        {carregando ? <p className="py-8 text-center text-sm text-slate-500">Carregando estoque...</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="p-2">Entrada</th><th className="p-2">Categoria / medida</th><th className="p-2">Código</th><th className="p-2">Fornecedor</th><th className="p-2 text-right">Peso</th><th className="p-2 text-right">Metros</th><th className="p-2 text-right">Ações</th></tr></thead>
              <tbody>{filtradas.map((b) => <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-2 text-slate-600">{b.data_entrada ? new Date(`${b.data_entrada}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</td>
                <td className="p-2"><div className="font-semibold text-slate-800">{b.categoria}</div><div className="text-xs text-slate-500">{b.medida ?? '—'} {b.categoria === 'BOPP' ? 'mm' : 'mm'}</div></td>
                <td className="p-2 font-medium text-slate-800">{b.codigo ?? '—'}{b.cor ? <div className="text-xs text-slate-500">{b.cor} {b.linha ? `· ${b.linha}` : ''}</div> : null}</td>
                <td className="p-2 text-slate-600">{b.fornecedor ?? '—'}</td><td className="p-2 text-right tabular-nums">{fmt(b.peso_kg, 1)} kg</td><td className="p-2 text-right tabular-nums">{fmt(b.metragem_m)} m</td>
                <td className="p-2"><div className="flex justify-end gap-1"><button type="button" title="Editar" onClick={() => abrirEdicao(b)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100"><Pencil className="size-4"/></button><button type="button" title="Excluir do estoque atual" onClick={() => void excluir(b)} className="rounded-md p-2 text-red-600 hover:bg-red-50"><Trash2 className="size-4"/></button></div></td>
              </tr>)}</tbody>
            </table>
            {!filtradas.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma bobina encontrada.</p>}
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
            <label className="grid gap-1 text-sm font-medium text-slate-700">Medida (mm)<input inputMode="decimal" value={form.medida} onChange={(e) => setForm({ ...form, medida: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Peso (kg)<input inputMode="decimal" value={form.peso_kg} onChange={(e) => setForm({ ...form, peso_kg: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Metragem (m)<input inputMode="decimal" value={form.metragem_m} onChange={(e) => setForm({ ...form, metragem_m: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Cor<input value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Linha<input value={form.linha} onChange={(e) => setForm({ ...form, linha: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3"/></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">Observações<textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} className="rounded-lg border border-slate-300 px-3 py-2"/></label>
          </div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setFormAberto(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button><button disabled={salvando} type="submit" className="rounded-lg bg-[#57534E] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">{salvando ? 'Salvando...' : 'Salvar bobina'}</button></div>
        </form>
      </div>}
    </div>
  )
}
