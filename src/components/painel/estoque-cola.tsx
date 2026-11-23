import * as React from 'react'
import { ArrowDownToLine, ArrowUpFromLine, History, Package, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Field, Panel, PrimaryButton, TextInput } from '@/components/painel/fields'
import { supabase } from '@/lib/supabase'
import { listarControleCola, registrarEntradaCola, retirarContainersCola } from '@/lib/admin.functions'

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
type Saldo = Entrada & { containers_disponiveis: number }
type Historico = {
  numero_bobina: string
  codigo_container: string
  data_producao: string
  cola_liquida_kg: number
  lote_cola: string | null
  fornecedor_cola: string | null
  status_container: string | null
}
type Container = { codigo: string; status: string; entrada_id: number | null; primeira_bobina: string | null; primeiro_uso_em: string | null; enviado_em: string | null }
type Dados = { entradas: Entrada[]; saldo: Saldo[]; historico: Historico[]; containers: Container[] }
type Aba = 'estoque' | 'entrada' | 'retirada' | 'historico'

const hoje = () => new Date().toLocaleDateString('en-CA')
const dinheiro = (valor: number) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const kg = (valor: number) => `${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`

export function EstoqueColaCobrideira() {
  const [aba, setAba] = React.useState<Aba>('estoque')
  const [dados, setDados] = React.useState<Dados>({ entradas: [], saldo: [], historico: [], containers: [] })
  const [carregando, setCarregando] = React.useState(false)
  const [salvando, setSalvando] = React.useState(false)
  const [form, setForm] = React.useState({
    data_chegada: hoje(), nf: '', produto: 'PS-2001', lote: '',
    quantidade_containers: '1', peso_por_container_kg: '1000',
    valor_por_container: '0', fornecedor: 'DOW', observacoes: '',
  })
  const [codigos, setCodigos] = React.useState('')

  const carregar = React.useCallback(async () => {
    setCarregando(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.')
      const resultado = await listarControleCola({ data: { accessToken: sessionData.session.access_token } })
      setDados(resultado as Dados)
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
  const codigosInformados = [...new Set(codigos.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))]

  const historicoAgrupado = React.useMemo(() => {
    const mapa = new Map<string, { codigo: string; bobinas: number; cola: number; primeira: string; ultima: string; lote: string; fornecedor: string; status: string }>()
    for (const item of dados.historico) {
      const codigo = item.codigo_container || 'SEM CÓDIGO'
      const atual = mapa.get(codigo) ?? {
        codigo, bobinas: 0, cola: 0, primeira: item.data_producao, ultima: item.data_producao,
        lote: item.lote_cola || '', fornecedor: item.fornecedor_cola || '', status: item.status_container || 'HISTORICO_ANTERIOR',
      }
      atual.bobinas += 1
      atual.cola += Number(item.cola_liquida_kg || 0)
      if (item.data_producao < atual.primeira) atual.primeira = item.data_producao
      if (item.data_producao > atual.ultima) atual.ultima = item.data_producao
      if (!atual.lote && item.lote_cola) atual.lote = item.lote_cola
      if (!atual.fornecedor && item.fornecedor_cola) atual.fornecedor = item.fornecedor_cola
      mapa.set(codigo, atual)
    }
    return [...mapa.values()].sort((a, b) => b.ultima.localeCompare(a.ultima))
  }, [dados.historico])

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
      await registrarEntradaCola({ data: {
        accessToken, data_chegada: form.data_chegada, nf: form.nf.trim(), produto: form.produto.trim(),
        lote: form.lote.trim(), quantidade_containers: quantidade, peso_por_container_kg: peso,
        valor_por_container: valor, fornecedor: form.fornecedor.trim(), observacoes: form.observacoes.trim() || undefined,
      } })
      toast.success('Entrada de cola registrada.')
      setForm((atual) => ({ ...atual, nf: '', lote: '', quantidade_containers: '1', valor_por_container: '0', observacoes: '' }))
      setAba('estoque')
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a entrada.')
    } finally {
      setSalvando(false)
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
    { id: 'historico', label: 'Histórico de cola', icon: <History className="size-4" /> },
  ]

  return (
    <div className="space-y-4 rounded-xl border border-[#d9e0eb] bg-white p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Estoque de Cola</h1>
          <p className="text-sm text-slate-600">Entradas, retiradas para Bahia e consumo automático registrado pela Cobrideira.</p>
        </div>
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
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs text-slate-500">Containers disponíveis</p><p className="mt-1 text-2xl font-bold">{totalContainers.toLocaleString('pt-BR')}</p></div>
            <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs text-slate-500">Peso disponível</p><p className="mt-1 text-2xl font-bold">{kg(totalKg)}</p></div>
            <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs text-slate-500">Códigos no histórico</p><p className="mt-1 text-2xl font-bold">{historicoAgrupado.length.toLocaleString('pt-BR')}</p></div>
          </div>
          <Panel title="Entradas de cola" description="Saldo por lote de recebimento, descontando containers consumidos na produção ou enviados para Bahia.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-slate-100 text-slate-700"><tr>{['Chegada','NF','Produto','Lote','Fornecedor','Containers recebidos','Disponíveis','Peso por container','Valor/kg'].map((x) => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead>
                <tbody>{dados.saldo.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="px-3 py-2">{new Date(item.data_chegada + 'T12:00:00').toLocaleDateString('pt-BR')}</td><td className="px-3 py-2">{item.nf}</td><td className="px-3 py-2">{item.produto}</td><td className="px-3 py-2">{item.lote}</td><td className="px-3 py-2">{item.fornecedor}</td><td className="px-3 py-2">{item.quantidade_containers}</td><td className="px-3 py-2 font-bold">{item.containers_disponiveis}</td><td className="px-3 py-2">{kg(item.peso_por_container_kg)}</td><td className="px-3 py-2">{dinheiro(item.valor_por_kg)}</td></tr>)}</tbody>
              </table>
              {!dados.saldo.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma entrada de cola cadastrada.</p>}
            </div>
          </Panel>
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
        <Panel title="Histórico de cola por código" description="A quantidade de cola líquida é acumulada automaticamente conforme as bobinas utilizam o mesmo código interno.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-slate-100 text-slate-700"><tr>{['Código do container','Bobinas','Cola líquida utilizada','Primeira utilização','Última utilização','Lote','Fornecedor','Situação'].map((x) => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead>
              <tbody>{historicoAgrupado.map((item) => <tr key={item.codigo} className="border-b border-slate-100"><td className="px-3 py-2 font-semibold">{item.codigo}</td><td className="px-3 py-2">{item.bobinas}</td><td className="px-3 py-2 font-bold">{kg(item.cola)}</td><td className="px-3 py-2">{new Date(item.primeira + 'T12:00:00').toLocaleDateString('pt-BR')}</td><td className="px-3 py-2">{new Date(item.ultima + 'T12:00:00').toLocaleDateString('pt-BR')}</td><td className="px-3 py-2">{item.lote || '—'}</td><td className="px-3 py-2">{item.fornecedor || '—'}</td><td className="px-3 py-2">{item.status === 'ENVIADO_BAHIA' ? 'Enviado para Bahia' : item.status === 'CONSUMIDO_PRODUCAO' ? 'Utilizado na produção' : 'Histórico anterior'}</td></tr>)}</tbody>
            </table>
            {!historicoAgrupado.length && <p className="py-8 text-center text-sm text-slate-500">Ainda não há consumo registrado.</p>}
          </div>
        </Panel>
      )}
    </div>
  )
}
