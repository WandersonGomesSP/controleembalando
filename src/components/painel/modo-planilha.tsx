import * as React from 'react'
import type { CobrideiraBobinaRow } from '@/lib/database.types'
import { CelulaEditavel } from './celula-editavel'

type Campo = keyof CobrideiraBobinaRow
type Coluna = { campo: Campo; titulo: string; numerico?: boolean; mono?: boolean; somenteLeitura?: boolean; tipo?: 'numero' | 'data' | 'texto' }
const COLUNAS: Coluna[] = [
  { campo: 'numero_bobina', titulo: 'Número da bobina', mono: true },
  { campo: 'data', titulo: 'Data', tipo: 'data' },
  { campo: 'cod_bob', titulo: 'Código da bobina', mono: true },
  { campo: 'fornecedor_filme', titulo: 'Fornecedor do filme' },
  { campo: 'largura', titulo: 'Largura', numerico: true, tipo: 'numero' },
  { campo: 'peso_bruto', titulo: 'Peso bruto', numerico: true, tipo: 'numero' },
  { campo: 'peso_final', titulo: 'Peso final', numerico: true, tipo: 'numero' },
  { campo: 'peso_liquido', titulo: 'Peso líquido', numerico: true, somenteLeitura: true },
  { campo: 'metragem', titulo: 'Metragem', numerico: true, tipo: 'numero' },
  { campo: 'material', titulo: 'Material' },
  { campo: 'perda_kg', titulo: 'Perda', numerico: true, tipo: 'numero' },
  { campo: 'vareta_g', titulo: 'Vareta', numerico: true, tipo: 'numero' },
  { campo: 'kg_cola', titulo: 'Cola', numerico: true, tipo: 'numero' },
  { campo: 'lote_cola', titulo: 'Lote da cola' },
  { campo: 'codigo_interno', titulo: 'Código interno', mono: true },
  { campo: 'fornecedor_cola', titulo: 'Fornecedor da cola' },
  { campo: 'linha', titulo: 'Linha' },
  { campo: 'cor_fundo', titulo: 'Cor de fundo' },
  { campo: 'pigmento_kg', titulo: 'Pigmento', numerico: true, tipo: 'numero' },
  { campo: 'cor_mistura', titulo: 'Cor da mistura' },
  { campo: 'pigmento_mistura', titulo: 'Pigmento da mistura' },
  { campo: 'cliente', titulo: 'Cliente' },
  { campo: 'cor_impressao', titulo: 'Cor de impressão' },
]
const LETRAS = (n: number) => { let s = ''; let x = n + 1; while (x) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26) } return s }
const SITUACOES = ['Cadastrada'] as const

function formatar(valor: unknown, campo: Campo) {
  if (valor === null || valor === undefined || valor === '') return ''
  if (campo === 'data' && typeof valor === 'string') return new Date(`${valor}T00:00:00`).toLocaleDateString('pt-BR')
  if (typeof valor === 'number') return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(valor)
  return String(valor)
}
function numeroBr(valor: string) { return Number(valor.trim().replace(/\./g, '').replace(',', '.')) }
function validar(coluna: Coluna, valor: string, rows: CobrideiraBobinaRow[], atual: CobrideiraBobinaRow) {
  const v = valor.trim()
  if (coluna.campo === 'numero_bobina' && !v) return 'Número da bobina obrigatório.'
  if (coluna.campo === 'numero_bobina' && rows.some((r) => r.numero_bobina === v && r.numero_bobina !== atual.numero_bobina)) return 'Já existe outra bobina com esse número.'
  if (coluna.campo === 'cod_bob' && !v) return 'Código da bobina obrigatório.'
  if (coluna.campo === 'fornecedor_filme' && !v) return 'Fornecedor obrigatório.'
  if (coluna.tipo === 'numero') {
    const n = numeroBr(v)
    if (!v || !Number.isFinite(n) || n <= 0) return 'Informe um número positivo.'
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(v)) return 'Use até duas casas decimais.'
  }
  if (coluna.tipo === 'data' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Data inválida.'
  return ''
}

export function ModoPlanilha({ registros, selecionadas, onAlternarSelecao, onSalvarCelula }: {
  registros: CobrideiraBobinaRow[]
  selecionadas: Set<string>
  onAlternarSelecao: (numero: string) => void
  onSalvarCelula: (registro: CobrideiraBobinaRow, campo: Campo, valor: string | number) => Promise<void>
}) {
  const [linha, setLinha] = React.useState(0)
  const [coluna, setColuna] = React.useState(0)
  const [editando, setEditando] = React.useState(false)
  const [status, setStatus] = React.useState<'salvo' | 'salvando'>('salvo')
  const [aba, setAba] = React.useState<'Novembro' | 'Outubro' | 'Totais'>('Novembro')
  const [formula, setFormula] = React.useState<Record<string, string>>({})
  const dados = aba === 'Totais' ? registros : registros.filter((r) => {
    const mes = Number(r.data.slice(5, 7))
    return aba === 'Novembro' ? mes === 11 : mes === 10
  })
  const atual = dados[linha]
  const colunaAtual = COLUNAS[coluna]
  const endereco = `${LETRAS(coluna)}${linha + 2}`
  const valorAtual = atual && colunaAtual ? String(atual[colunaAtual.campo] ?? '') : ''
  const peso = dados.map((r) => Number(r.peso_liquido) || 0)
  const metragem = dados.reduce((s, r) => s + (Number(r.metragem) || 0), 0)
  const somaPeso = peso.reduce((s, n) => s + n, 0)
  const mediaPeso = peso.length ? somaPeso / peso.length : 0
  const maxPeso = peso.length ? Math.max(...peso) : 0
  const totais = new Set<Campo>(['largura', 'peso_bruto', 'peso_final', 'peso_liquido', 'metragem', 'perda_kg', 'vareta_g', 'kg_cola', 'pigmento_kg'])
  const formulaSelecionada = formula[endereco] ?? ''
  const iniciar = () => { if (atual && colunaAtual && !colunaAtual.somenteLeitura) setEditando(true) }
  const salvar = async (valor: string) => {
    if (!atual || !colunaAtual || colunaAtual.somenteLeitura) return
    const erro = validar(colunaAtual, valor, dados, atual)
    if (erro) { setStatus('salvo'); window.alert(erro); return }
    const convertido = colunaAtual.tipo === 'numero' ? numeroBr(valor) : valor.trim()
    setStatus('salvando')
    try { await onSalvarCelula(atual, colunaAtual.campo, convertido); setStatus('salvo'); setEditando(false) }
    catch { setStatus('salvo') }
  }
  const navegar = (dl: number, dc: number) => {
    setLinha((n) => Math.max(0, Math.min(dados.length - 1, n + dl)))
    setColuna((n) => Math.max(0, Math.min(COLUNAS.length - 1, n + dc)))
    setEditando(false)
  }
  const inserirTecla = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editando) return
    if (event.key === 'ArrowDown') { event.preventDefault(); navegar(1, 0) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); navegar(-1, 0) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); navegar(0, 1) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); navegar(0, -1) }
    else if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); iniciar() }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) { iniciar() }
  }
  return (
    <section className="space-y-3 text-[#1E293B]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label className="mr-2 text-xs text-[#64748B]">Célula</label>
          <span className="inline-block min-w-16 rounded border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-sm">{endereco}</span>
          <input aria-label="Barra de fórmulas" value={formulaSelecionada || valorAtual} onChange={(e) => setFormula((a) => ({ ...a, [endereco]: e.target.value }))} className="ml-2 min-w-40 rounded border border-[#E2E8F0] px-2 py-1 text-sm" />
        </div>
        <span className="text-xs text-[#64748B]">{status === 'salvando' ? 'salvando…' : 'salvo'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[['Soma do peso', somaPeso], ['Soma da metragem', metragem], ['Média do peso', mediaPeso], ['Quantidade', dados.length], ['Máximo do peso', maxPeso]].map(([label, value]) => (
          <div key={String(label)} className="rounded border border-[#E2E8F0] bg-white p-3"><p className="text-xs text-[#64748B]">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-[#0B1F4D]">{new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value))}</p></div>
        ))}
      </div>
      <div className="overflow-x-auto rounded border border-[#E2E8F0]" onKeyDown={inserirTecla} tabIndex={0}>
        <table className="w-max min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-[#F1F5F9]">
            <tr><th className="sticky left-0 z-30 min-w-16 border border-[#E2E8F0] bg-[#F1F5F9]"> </th>{COLUNAS.map((c, i) => <th key={c.campo} className="min-w-32 border border-[#E2E8F0] px-2 py-2 text-center font-semibold text-[#0B1F4D]">{LETRAS(i)}</th>)}</tr>
            <tr><th className="sticky left-0 z-30 border border-[#E2E8F0] bg-[#F1F5F9]">Linha</th>{COLUNAS.map((c) => <th key={c.campo} className="border border-[#E2E8F0] px-2 py-2 text-left">{c.titulo}</th>)}</tr>
          </thead>
          <tbody>
            {dados.map((registro, i) => <tr key={registro.numero_bobina} className={i % 2 ? 'bg-[#F8FAFC]' : 'bg-white'}>
              <th className="sticky left-0 z-10 border border-[#E2E8F0] bg-[#F1F5F9] px-2 text-center font-normal text-[#64748B]">
                <div className="flex items-center gap-2"><input type="checkbox" checked={selecionadas.has(registro.numero_bobina)} onChange={() => onAlternarSelecao(registro.numero_bobina)} aria-label={`Selecionar ${registro.numero_bobina}`} />{i + 1}</div>
              </th>
              {COLUNAS.map((c, j) => <CelulaEditavel key={c.campo} value={formatar(registro[c.campo], c.campo)} numeric={c.numerico} mono={c.mono} selected={linha === i && coluna === j} editing={linha === i && coluna === j && editando} onSelect={() => { setLinha(i); setColuna(j); setEditando(false) }} onStartEdit={() => { setLinha(i); setColuna(j); setEditando(true) }} onCommit={(v) => void salvar(v)} onCancel={() => setEditando(false)} onMove={(d) => navegar(d === 'down' ? 1 : 0, d === 'next' ? 1 : 0)} />)}
            </tr>)}
            <tr className="bg-[#B91C1C] font-semibold text-white"><th className="sticky left-0 z-10 bg-[#B91C1C] px-2 py-2">Σ</th>{COLUNAS.map((c) => <td key={c.campo} className="border border-[#E2E8F0] px-2 py-2 text-right tabular-nums">{totais.has(c.campo) ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(dados.reduce((s, r) => s + (Number(r[c.campo]) || 0), 0)) : ''}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <div className="flex gap-1 border-b border-[#E2E8F0]">
        {(['Novembro', 'Outubro', 'Totais'] as const).map((nome) => <button key={nome} type="button" onClick={() => { setAba(nome); setLinha(0); setColuna(0) }} className={`border-b-2 px-4 py-2 text-sm ${aba === nome ? 'border-[#B91C1C] font-semibold text-[#0B1F4D]' : 'border-transparent text-[#64748B]'}`}>{nome}</button>)}
      </div>
    </section>
  )
}
