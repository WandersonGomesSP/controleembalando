import * as React from 'react'
import { toast } from 'sonner'
import type { StockOperationLogRow } from '@/lib/database.types'
import { int, kg, useStore } from '@/lib/store'
import { Field, Mono, Panel, TextInput } from '@/components/painel/fields'
import { ResumoPlanilha } from '@/components/painel/resumo-planilha'

function isoLocal(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function diaInclusivo(date: string, de: string, ate: string) {
  return date >= de && date <= ate
}

export function ResumoIndicadores() {
  const {
    insumosRolos,
    tubetes,
    producao,
    residuos,
    referenciasTubetes,
    consultarHistoricoEstoque,
  } = useStore()
  const hoje = isoLocal(new Date())
  const inicioMes = isoLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [de, setDe] = React.useState(inicioMes)
  const [ate, setAte] = React.useState(hoje)
  const [operador, setOperador] = React.useState('')
  const [logs, setLogs] = React.useState<StockOperationLogRow[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    const timeout = setTimeout(() => {
      void (async () => {
        setLoading(true)
        try {
          const all: StockOperationLogRow[] = []
          let inicio = 0
          let temMais = true
          while (temMais) {
            const page = await consultarHistoricoEstoque({
              de,
              ate,
              operador,
              inicio,
              limite: 100,
            })
            all.push(...page.registros)
            inicio += page.registros.length
            temMais = page.temMais
          }
          if (active) setLogs(all)
        } catch {
          if (active) {
            setLogs([])
            toast.error('Não foi possível carregar os indicadores do período.')
          }
        } finally {
          if (active) setLoading(false)
        }
      })()
    }, 200)
    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [de, ate, operador, consultarHistoricoEstoque])

  const movimentoPorAcao = (acao: StockOperationLogRow['acao']) =>
    logs.filter((log) => log.acao === acao)
  const entradas = movimentoPorAcao('ENTRADA')
  const saidas = movimentoPorAcao('SAÍDA')
  const alteracoes = movimentoPorAcao('ALTERAÇÃO')
  const perdaTubetes = tubetes
    .filter((lote) => diaInclusivo(lote.dataProducao, de, ate))
    .filter((lote) => !operador || lote.operador.toLocaleLowerCase().includes(operador.toLocaleLowerCase()))
    .reduce((total, lote) => total + lote.perdaKg, 0)
  const perdaProducao = producao
    .filter((item) => diaInclusivo(item.data, de, ate))
    .filter((item) => !operador || item.operador.toLocaleLowerCase().includes(operador.toLocaleLowerCase()))
    .reduce((total, item) => total + item.perda, 0)
  const perdaRolos = residuos
    .filter((item) => diaInclusivo(item.data, de, ate))
    .filter((item) => !operador || item.operador.toLocaleLowerCase().includes(operador.toLocaleLowerCase()))
    .reduce((total, item) => total + item.peso, 0)
  const producaoPeriodo = producao.filter(
    (item) =>
      diaInclusivo(item.data, de, ate) &&
      (!operador || item.operador.toLocaleLowerCase().includes(operador.toLocaleLowerCase())),
  )
  const tubosProduzidos = producaoPeriodo.reduce(
    (total, item) => total + item.quantidadeTubos,
    0,
  )
  const perdaPorOperador = new Map<string, number>()
  for (const lote of tubetes) {
    if (!diaInclusivo(lote.dataProducao, de, ate)) continue
    if (operador && !lote.operador.toLocaleLowerCase().includes(operador.toLocaleLowerCase())) continue
    perdaPorOperador.set(lote.operador, (perdaPorOperador.get(lote.operador) ?? 0) + lote.perdaKg)
  }
  for (const item of producaoPeriodo) {
    perdaPorOperador.set(item.operador, (perdaPorOperador.get(item.operador) ?? 0) + item.perda)
  }
  for (const residuo of residuos) {
    if (!diaInclusivo(residuo.data, de, ate)) continue
    if (operador && !residuo.operador.toLocaleLowerCase().includes(operador.toLocaleLowerCase())) continue
    perdaPorOperador.set(residuo.operador, (perdaPorOperador.get(residuo.operador) ?? 0) + residuo.peso)
  }
  const maioresPerdas = [...perdaPorOperador.entries()].sort((a, b) => b[1] - a[1])

  const cards = [
    {
      title: 'Rótulos / capas disponíveis',
      value: `${int(insumosRolos.length)} · ${kg(insumosRolos.reduce((sum, row) => sum + row.pesoLiqKg, 0))}`,
      unit: 'rolos · kg',
    },
    {
      title: 'Tubetes em estoque',
      value: int(tubetes.reduce((sum, lote) => sum + lote.caixas * lote.unidadesPorCaixa, 0)),
      unit: 'unidades',
    },
    { title: 'Registros de produção', value: int(producao.length), unit: 'lotes' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <ResumoPlanilha />
      <Panel
        title="Filtros dos indicadores"
        description="Movimentações, produção e perdas calculadas para o período e operador selecionados."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="De" htmlFor="dash-de">
            <TextInput id="dash-de" type="date" value={de} onChange={(event) => setDe(event.target.value)} />
          </Field>
          <Field label="Até" htmlFor="dash-ate">
            <TextInput id="dash-ate" type="date" value={ate} onChange={(event) => setAte(event.target.value)} />
          </Field>
          <Field label="Operador" htmlFor="dash-operador">
            <TextInput id="dash-operador" value={operador} onChange={(event) => setOperador(event.target.value)} placeholder="Todos" />
          </Field>
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.title} className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.title}</p>
            <Mono className="mt-3 block text-3xl font-semibold">{card.value}</Mono>
            <p className="mt-1 text-xs text-muted-foreground">{card.unit}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Movimentações no período" description="Eventos gravados pelo histórico do banco.">
          {loading ? (
            <p className="text-sm text-muted-foreground">Calculando movimentações...</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Entradas', entradas],
                ['Saídas', saidas],
                ['Alterações', alteracoes],
              ].map(([label, group]) => {
                const rows = group as StockOperationLogRow[]
                const porEntidade = new Map<string, number>()
                for (const row of rows) {
                  porEntidade.set(
                    row.entidade,
                    (porEntidade.get(row.entidade) ?? 0) + row.quantidade,
                  )
                }
                return (
                  <div key={label as string} className="rounded-md border border-border p-4">
                    <p className="text-xs text-muted-foreground">{label as string}</p>
                    <Mono className="mt-2 block text-2xl font-semibold">{int(rows.length)}</Mono>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {[...porEntidade.entries()].map(([entity, quantity]) => (
                        <li key={entity} className="flex justify-between gap-2">
                          <span>{entity}</span>
                          <Mono>{int(quantity)}</Mono>
                        </li>
                      ))}
                      {rows.length === 0 && <li>Sem operações</li>}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel title="Produção e perdas" description="Perdas em kg são informadas separadamente do saldo contado em unidades.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border p-4">
              <p className="text-xs text-muted-foreground">Tubos produzidos</p>
              <Mono className="mt-2 block text-2xl font-semibold">{int(tubosProduzidos)}</Mono>
              <p className="mt-1 text-xs text-muted-foreground">{int(producaoPeriodo.length)} lançamento(s) no período</p>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="text-xs text-muted-foreground">Perda total no período</p>
              <Mono className="mt-2 block text-2xl font-semibold">{kg(perdaTubetes + perdaProducao + perdaRolos)} kg</Mono>
              <p className="mt-1 text-xs text-muted-foreground">
                Tubetes: {kg(perdaTubetes)} · Tubos: {kg(perdaProducao)} · Rolos: {kg(perdaRolos)} kg
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Perdas por operador" description="Somatório das perdas em kg registradas em tubetes, produção e resíduos de rolos.">
        {maioresPerdas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Não há perdas registradas no período.</p>
        ) : (
          <div className="space-y-3">
            {maioresPerdas.map(([nome, perda]) => {
              const maximo = Math.max(...maioresPerdas.map((item) => item[1]), 1)
              return (
                <div key={nome} className="grid grid-cols-[minmax(6rem,12rem)_1fr_auto] items-center gap-3">
                  <span className="truncate text-sm">{nome}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-warning" style={{ width: `${(perda / maximo) * 100}%` }} />
                  </div>
                  <Mono className="text-sm">{kg(perda)} kg</Mono>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
      <Panel title="Estoque de tubetes por referência" description="Saldo em unidades e caixas; a perda de material é contabilizada separadamente em kg.">
        <div className="scroll-area max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Referência</th>
                <th className="px-3 py-2 text-right">Caixas</th>
                <th className="px-3 py-2 text-right">Unidades / caixa</th>
                <th className="px-3 py-2 text-right">Saldo (un)</th>
              </tr>
            </thead>
            <tbody>
              {referenciasTubetes.map((referencia) => {
                const lotes = tubetes.filter(
                  (lote) =>
                    lote.medida.toLocaleLowerCase() === referencia.medida.toLocaleLowerCase() &&
                    lote.cor.toLocaleLowerCase() === (referencia.cor ?? '').toLocaleLowerCase(),
                )
                const caixas = lotes.reduce((total, lote) => total + lote.caixas, 0)
                const unidades = lotes.reduce(
                  (total, lote) => total + lote.caixas * lote.unidadesPorCaixa,
                  0,
                )
                return (
                  <tr key={referencia.descricao} className="border-t border-border/70">
                    <td className="px-3 py-2">{referencia.descricao}</td>
                    <td className="px-3 py-2 text-right"><Mono>{int(caixas)}</Mono></td>
                    <td className="px-3 py-2 text-right"><Mono>{int(referencia.tubetesPorCaixa)}</Mono></td>
                    <td className="px-3 py-2 text-right"><Mono>{int(unidades)}</Mono></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
