import * as React from 'react'
import type { CobrideiraBobinaRow } from '@/lib/database.types'
import { CelulaEditavel } from './celula-editavel'

type Campo = keyof CobrideiraBobinaRow
type Coluna = { campo: Campo; titulo: string; numerico?: boolean; mono?: boolean; somenteLeitura?: boolean; tipo?: 'numero' | 'data' }
const COLUNAS: Coluna[] = [
  { campo: 'numero_bobina', titulo: 'Número da bobina', mono: true },
  { campo: 'data', titulo: 'Data', tipo: 'data' },
  { campo: 'cod_bob', titulo: 'Código da bobina', mono: true },
  { campo: 'fornecedor_filme', titulo: 'Fornecedor do filme' },
  { campo: 'largura', titulo: 'Largura', numerico: true, tipo: 'numero' },
  { campo: 'micragem', titulo: 'Micragem', numerico: true, tipo: 'numero' },
  { campo: 'peso_liquido', titulo: 'Peso líquido', numerico: true, somenteLeitura: true },
  { campo: 'metragem', titulo: 'Metragem', numerico: true, tipo: 'numero' },
  { campo: 'material', titulo: 'Material' },
  { campo: 'peso_bruto', titulo: 'Peso bruto', numerico: true, tipo: 'numero' },
  { campo: 'peso_final', titulo: 'Peso final', numerico: true, tipo: 'numero' },
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
function numeroBr(valor: string) {
  const limpo = valor.trim().replace(/\s/g, '')
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo
  return Number(normalizado)
}
function formatar(valor: unknown, campo: Campo) {
  if (valor === null || valor === undefined || valor === '') return ''
  if (campo === 'data' && typeof valor === 'string') return new Date(`${valor}T00:00:00`).toLocaleDateString('pt-BR')
  if (typeof valor === 'number') return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(valor)
  return String(valor)
}
function validar(coluna: Coluna, valor: string, todos: CobrideiraBobinaRow[], atual: CobrideiraBobinaRow) {
  const v = valor.trim()
  if (coluna.campo === 'numero_bobina' && !v) return 'Número da bobina obrigatório.'
  if (coluna.campo === 'numero_bobina' && todos.some((r) => r.numero_bobina === v && r.numero_bobina !== atual.numero_bobina)) return 'Já existe outra bobina com esse número.'
  if (coluna.campo === 'cod_bob' && !v) return 'Código da bobina obrigatório.'
  if (coluna.campo === 'fornecedor_filme' && !v) return 'Fornecedor obrigatório.'
  if (coluna.tipo === 'numero') {
    const n = numeroBr(v)
    const formatoValido = /^\d+(?:[.,]\d{1,2})?$/.test(v) || /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(v)
    if (!v || !Number.isFinite(n) || n <= 0) return 'Informe um número positivo.'
    if (!formatoValido) return 'Use até duas casas decimais.'
    if ((coluna.campo === 'metragem' || coluna.campo === 'micragem' || coluna.campo === 'vareta_g') && !Number.isInteger(n)) return 'Este campo aceita apenas números inteiros.'
  }
  if (coluna.tipo === 'data' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Data inválida.'
  return ''
}
function dividirArgumentos(texto: string) {
  const partes: string[] = []
  let atual = ''
  let aspas = false
  let nivel = 0
  for (const ch of texto) {
    if (ch === '"') aspas = !aspas
    if (!aspas && ch === '(') nivel++
    if (!aspas && ch === ')') nivel--
    if (!aspas && nivel === 0 && (ch === ';' || ch === ',')) { partes.push(atual.trim()); atual = '' }
    else atual += ch
  }
  if (atual.trim()) partes.push(atual.trim())
  return partes
}
function avaliarFormula(
  formula: string,
  resolver: (ref: string) => unknown,
  intervalo: (ref: string) => unknown[],
): unknown {
  const chamada = formula.trim().match(/^=([A-ZÁÉÍÓÚ.]+)\((.*)\)$/i)
  if (!chamada) return formula
  const nome = chamada[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').toUpperCase()
  const args = dividirArgumentos(chamada[2])
  if (nome === 'SE') {
    const condicao = (args[0] ?? '').match(/^([A-Z]+\d+)\s*(>=|<=|<>|=|>|<)\s*(.+)$/i)
    if (!condicao) return 'Erro na condição'
    const esquerda = resolver(condicao[1])
    const literal = condicao[3].trim().replace(/^"|"$/g, '')
    const direita: unknown = /^-?\d+(?:[.,]\d+)?$/.test(literal) ? Number(literal.replace(',', '.')) : literal
    const a = Number(esquerda); const b = Number(direita)
    const ambosNumericos = Number.isFinite(a) && Number.isFinite(b)
    const comparacao = ambosNumericos ? a - b : String(esquerda ?? '').localeCompare(String(direita))
    const iguais = ambosNumericos ? comparacao === 0 : String(esquerda ?? '') === String(direita)
    const ok = condicao[2] === '>' ? comparacao > 0 : condicao[2] === '<' ? comparacao < 0 : condicao[2] === '>=' ? comparacao >= 0 : condicao[2] === '<=' ? comparacao <= 0 : condicao[2] === '<>' ? !iguais : iguais
    return ok ? (args[1] ?? '').replace(/^"|"$/g, '') : (args[2] ?? '').replace(/^"|"$/g, '')
  }
  const valores = args.flatMap((arg) => /^[A-Z]+\d+:[A-Z]+\d+$/i.test(arg) ? intervalo(arg) : /^[A-Z]+\d+$/i.test(arg) ? [resolver(arg)] : [arg.replace(/^"|"$/g, '')])
  if (nome === 'CONTVALORES') return valores.filter((v) => v !== '' && v !== null && v !== undefined).length
  const numeros = valores.filter((v) => v !== '' && v !== null && v !== undefined).map((v) => Number(v)).filter(Number.isFinite)
  if (nome === 'SOMA') return numeros.reduce((s, n) => s + n, 0)
  if (nome === 'MÉDIA' || nome === 'MEDIA') return numeros.length ? numeros.reduce((s, n) => s + n, 0) / numeros.length : 0
  if (nome === 'MÁXIMO' || nome === 'MAXIMO') return numeros.length ? Math.max(...numeros) : 0
  if (nome === 'MÍNIMO' || nome === 'MINIMO') return numeros.length ? Math.min(...numeros) : 0
  return 'Função não suportada'
}

export function ModoPlanilha({ registros, todosRegistros, selecionadas, onAlternarSelecao, onSalvarCelula }: {
  registros: CobrideiraBobinaRow[]
  todosRegistros: CobrideiraBobinaRow[]
  selecionadas: Set<string>
  onAlternarSelecao: (numero: string) => void
  onSalvarCelula: (registro: CobrideiraBobinaRow, campo: Campo, valor: string | number) => Promise<void>
}) {
  const [linha, setLinha] = React.useState(0)
  const [coluna, setColuna] = React.useState(0)
  const [editando, setEditando] = React.useState(false)
  const [status, setStatus] = React.useState<'salvo' | 'salvando'>('salvo')
  const [aba, setAba] = React.useState<'Novembro' | 'Outubro' | 'Totais'>('Novembro')
  const [formulas, setFormulas] = React.useState<Record<string, string>>({})
  const [rascunhoFormula, setRascunhoFormula] = React.useState('')
  const [erros, setErros] = React.useState<Record<string, string>>({})
  const dados = aba === 'Totais' ? registros : registros.filter((r) => Number(r.data.slice(5, 7)) === (aba === 'Novembro' ? 11 : 10))
  const atual = dados[linha]
  const colunaAtual = COLUNAS[coluna]
  const endereco = `${LETRAS(coluna)}${linha + 2}`
  const pesoColuna = COLUNAS.findIndex((c) => c.campo === 'peso_liquido')
  const metragemColuna = COLUNAS.findIndex((c) => c.campo === 'metragem')
  const enderecoPeso = (i: number) => `${LETRAS(pesoColuna)}${i + 2}`
  const enderecoMetragem = (i: number) => `${LETRAS(metragemColuna)}${i + 2}`
  function resolverReferencia(ref: string, pilha: Set<string> = new Set()): unknown {
    const match = ref.toUpperCase().match(/^([A-Z]+)(\\d+)$/)
    if (!match) return ''
    let ci = 0
    for (const ch of match[1]) ci = ci * 26 + ch.charCodeAt(0) - 64
    const li = Number(match[2]) - 2
    if (li < 0 || li >= dados.length || ci < 1 || ci > COLUNAS.length) return ''
    const address = `${match[1]}${match[2]}`
    if (pilha.has(address)) return '#CICLO!'
    const formulaCell = formulas[address]
    if (formulaCell) {
      const next = new Set(pilha); next.add(address)
      return avaliarFormula(formulaCell, (r) => resolverReferencia(r, next), (range) => resolverIntervalo(range, next))
    }
    return dados[li]?.[COLUNAS[ci - 1].campo] ?? ''
  }
  function resolverIntervalo(range: string, pilha: Set<string> = new Set()): unknown[] {
    const [inicio, fim] = range.toUpperCase().split(':')
    const a = inicio.match(/^([A-Z]+)(\\d+)$/); const b = fim.match(/^([A-Z]+)(\\d+)$/)
    if (!a || !b) return []
    let c1 = 0; for (const ch of a[1]) c1 = c1 * 26 + ch.charCodeAt(0) - 64
    let c2 = 0; for (const ch of b[1]) c2 = c2 * 26 + ch.charCodeAt(0) - 64
    const l1 = Number(a[2]); const l2 = Number(b[2])
    const valores: unknown[] = []
    for (let l = Math.min(l1, l2); l <= Math.max(l1, l2); l++) {
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) valores.push(resolverReferencia(`${LETRAS(c - 1)}${l}`, pilha))
    }
    return valores
  }
  const valorCalculado = (i: number, j: number) => {
    const address = `${LETRAS(j)}${i + 2}`
    return formulas[address] ? avaliarFormula(formulas[address], resolverReferencia, resolverIntervalo) : dados[i]?.[COLUNAS[j].campo]
  }
  React.useEffect(() => {
    setRascunhoFormula(atual ? formulas[endereco] ?? String(atual[colunaAtual.campo] ?? '') : '')
  }, [endereco, atual, colunaAtual, formulas])
  const peso = dados.map((_, i) => Number(valorCalculado(i, pesoColuna)) || 0)
  const metragem = dados.reduce((s, _, i) => s + (Number(valorCalculado(i, metragemColuna)) || 0), 0)
  const somaPeso = peso.reduce((s, n) => s + n, 0)
  const mediaPeso = peso.length ? somaPeso / peso.length : 0
  const maxPeso = peso.length ? Math.max(...peso) : 0
  const colunasTotais = new Set<Campo>(['largura', 'micragem', 'peso_bruto', 'peso_final', 'peso_liquido', 'metragem', 'perda_kg', 'vareta_g', 'kg_cola', 'pigmento_kg'])
  const formulaDaCelula = formulas[endereco] ?? ''
  const valorAtual = atual && colunaAtual ? String(atual[colunaAtual.campo] ?? '') : ''
  const totalFormula = (j: number) => `=SOMA(${LETRAS(j)}2:${LETRAS(j)}${dados.length + 1})`
  const salvar = async (valor: string) => {
    if (!atual || !colunaAtual || colunaAtual.somenteLeitura) return
    const erro = validar(colunaAtual, valor, todosRegistros, atual)
    if (erro) { setErros((a) => ({ ...a, [endereco]: erro })); return }
    setErros((a) => { const n = { ...a }; delete n[endereco]; return n })
    const convertido = colunaAtual.tipo === 'numero' ? numeroBr(valor) : valor.trim()
    setStatus('salvando')
    try { await onSalvarCelula(atual, colunaAtual.campo, convertido); setStatus('salvo'); setEditando(false) }
    catch { setErros((a) => ({ ...a, [endereco]: 'Falha ao salvar. O valor anterior foi restaurado.' })); setStatus('salvo') }
  }
  const navegar = (dl: number, dc: number) => {
    setLinha((n) => Math.max(0, Math.min(Math.max(0, dados.length - 1), n + dl)))
    setColuna((n) => Math.max(0, Math.min(COLUNAS.length - 1, n + dc)))
    setEditando(false)
  }
  const inserirTecla = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editando) return
    if (event.key === 'ArrowDown') { event.preventDefault(); navegar(1, 0) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); navegar(-1, 0) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); navegar(0, 1) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); navegar(0, -1) }
    else if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); if (!colunaAtual.somenteLeitura) setEditando(true) }
  }
  const confirmarFormula = () => {
    if (!rascunhoFormula.trim().startsWith('=')) { setFormulas((a) => { const n = { ...a }; delete n[endereco]; return n }); return }
    if (!/^=(SOMA|MÉDIA|MAXIMO|MÁXIMO|MÍNIMO|MINIMO|CONT\.VALORES|SE)\(/i.test(rascunhoFormula.trim())) {
      setErros((a) => ({ ...a, [endereco]: 'Fórmula não reconhecida. Use SOMA, MÉDIA, MÁXIMO, MÍNIMO, CONT.VALORES ou SE.' }))
      return
    }
    setErros((a) => { const n = { ...a }; delete n[endereco]; return n })
    setFormulas((a) => ({ ...a, [endereco]: rascunhoFormula.trim() }))
  }
  return (
    <section className="space-y-3 text-[#1E293B]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label className="mr-2 text-xs text-[#64748B]">Célula</label>
          <span className="inline-block min-w-16 rounded border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-sm">{endereco}</span>
          <input aria-label="Barra de fórmulas" value={rascunhoFormula} onChange={(e) => setRascunhoFormula(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarFormula() } if (e.key === 'Escape') setRascunhoFormula(formulaDaCelula || valorAtual) }} className="ml-2 min-w-40 rounded border border-[#E2E8F0] px-2 py-1 text-sm" />
          <button type="button" onClick={confirmarFormula} className="ml-1 rounded border border-[#E2E8F0] px-2 py-1 text-xs text-[#0B1F4D]">Aplicar fórmula</button>
        </div>
        <span className="text-xs text-[#64748B]">{status === 'salvando' ? 'salvando…' : 'salvo'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ['Soma do peso', avaliarFormula(`=SOMA(${LETRAS(pesoColuna)}2:${LETRAS(pesoColuna)}${dados.length + 1})`, resolverReferencia, resolverIntervalo)],
          ['Soma da metragem', avaliarFormula(`=SOMA(${LETRAS(metragemColuna)}2:${LETRAS(metragemColuna)}${dados.length + 1})`, resolverReferencia, resolverIntervalo)],
          ['Média do peso', avaliarFormula(`=MÉDIA(${LETRAS(pesoColuna)}2:${LETRAS(pesoColuna)}${dados.length + 1})`, resolverReferencia, resolverIntervalo)],
          ['Quantidade', avaliarFormula(`=CONT.VALORES(A2:A${dados.length + 1})`, resolverReferencia, resolverIntervalo)],
          ['Máximo do peso', avaliarFormula(`=MÁXIMO(${LETRAS(pesoColuna)}2:${LETRAS(pesoColuna)}${dados.length + 1})`, resolverReferencia, resolverIntervalo)],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded border border-[#E2E8F0] bg-white p-3"><p className="text-xs text-[#64748B]">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-[#0B1F4D]">{new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value) || 0)}</p></div>
        ))}
      </div>
      <div className="overflow-x-auto rounded border border-[#E2E8F0]" onKeyDown={inserirTecla} onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.focus() }} tabIndex={0}>
        <table className="w-max min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-[#F1F5F9]">
            <tr><th className="sticky left-0 z-30 min-w-16 border border-[#E2E8F0] bg-[#F1F5F9]"></th>{COLUNAS.map((c, i) => <th key={c.campo} className="min-w-32 border border-[#E2E8F0] px-2 py-2 text-center font-semibold text-[#0B1F4D]">{LETRAS(i)}</th>)}</tr>
            <tr><th className="sticky left-0 z-30 border border-[#E2E8F0] bg-[#F1F5F9]">Linha</th>{COLUNAS.map((c) => <th key={c.campo} className="border border-[#E2E8F0] px-2 py-2 text-left">{c.titulo}</th>)}</tr>
          </thead>
          <tbody>
            {dados.map((registro, i) => <tr key={registro.numero_bobina} className={i % 2 ? 'bg-[#F8FAFC]' : 'bg-white'}>
              <th className="sticky left-0 z-10 border border-[#E2E8F0] bg-[#F1F5F9] px-2 text-center font-normal text-[#64748B]">
                <div className="flex items-center gap-2"><input type="checkbox" checked={selecionadas.has(registro.numero_bobina)} onChange={() => onAlternarSelecao(registro.numero_bobina)} aria-label={`Selecionar ${registro.numero_bobina}`} />{i + 2}</div>
              </th>
              {COLUNAS.map((c, j) => {
                const valor = valorCalculado(i, j)
                const valorTexto = typeof valor === 'number' ? String(valor) : String(valor ?? '')
                return <CelulaEditavel key={c.campo} value={c.tipo === 'data' ? String(registro[c.campo] ?? '') : valorTexto} displayValue={formatar(valor, c.campo)} error={erros[`${LETRAS(j)}${i + 2}`]} numeric={c.numerico} mono={c.mono} selected={linha === i && coluna === j} editing={linha === i && coluna === j && editando} onSelect={() => { setLinha(i); setColuna(j); setEditando(false) }} onStartEdit={() => { if (!c.somenteLeitura) { setLinha(i); setColuna(j); setEditando(true) } }} onCommit={(v) => void salvar(v)} onCancel={() => setEditando(false)} onMove={(d) => navegar(d === 'down' ? 1 : 0, d === 'next' ? 1 : 0)} />
              })}
            </tr>)}
            <tr className="bg-[#B91C1C] font-semibold text-white"><th className="sticky left-0 z-10 bg-[#B91C1C] px-2 py-2">Σ</th>{COLUNAS.map((c, j) => <td key={c.campo} className="border border-[#E2E8F0] px-2 py-2 text-right tabular-nums">{colunasTotais.has(c.campo) ? formatar(avaliarFormula(totalFormula(j), resolverReferencia, resolverIntervalo), c.campo) : ''}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <div className="flex gap-1 border-b border-[#E2E8F0]">
        {(['Novembro', 'Outubro', 'Totais'] as const).map((nome) => <button key={nome} type="button" onClick={() => { setAba(nome); setLinha(0); setColuna(0) }} className={`border-b-2 px-4 py-2 text-sm ${aba === nome ? 'border-[#B91C1C] font-semibold text-[#0B1F4D]' : 'border-transparent text-[#64748B]'}`}>{nome}</button>)}
      </div>
    </section>
  )
}
