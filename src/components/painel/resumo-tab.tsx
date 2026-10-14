import {
  Boxes,
  Factory,
  Package,
  Recycle,
  Scale,
  TriangleAlert,
} from 'lucide-react'
import { KG_POR_TUBO, MEDIDAS } from '@/lib/fixtures'
import { dataBR, int, kg, pesoLiquido, useStore } from '@/lib/store'
import { Mono, Panel } from '@/components/painel/fields'
import { cn } from '@/lib/utils'

export function ResumoTab() {
  const { rolos, residuos, tubetes } = useStore()

  const pesoTotal = rolos.reduce((s, r) => s + pesoLiquido(r), 0)
  const ultimos = residuos.slice(0, 20)
  const residuoTotal = ultimos.reduce((s, r) => s + r.peso, 0)
  const tubetesTotal = tubetes.reduce(
    (s, l) => s + l.caixas * l.unidadesPorCaixa - l.perda,
    0,
  )
  const capacidade = Math.floor(pesoTotal / KG_POR_TUBO)

  const porMedida = MEDIDAS.map((m) => {
    const lista = rolos.filter((r) => r.medida === m.medida)
    const peso = lista.reduce((s, r) => s + pesoLiquido(r), 0)
    return { ...m, qtd: lista.length, peso, abaixo: peso < m.minimoKg }
  })
  const abaixoDoMinimo = porMedida.filter((m) => m.abaixo).length

  const metricasSecundarias = [
    {
      label: 'Rolos Ativos',
      value: int(rolos.length),
      sub: `${MEDIDAS.length} medidas cadastradas`,
      icon: Package,
    },
    {
      label: 'Estoque Tubete',
      value: int(tubetesTotal),
      sub: `${tubetes.length} lotes · unidades`,
      icon: Boxes,
    },
    {
      label: 'Capacidade Produção',
      value: int(capacidade),
      sub: `tubos estimados · ${kg(KG_POR_TUBO, 2)} kg/tubo`,
      icon: Factory,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.8fr)]">
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex min-h-44 items-start justify-between gap-4 p-5 sm:p-7">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Peso Total Líquido
              </p>
              <Mono className="mt-4 block text-4xl leading-none font-semibold tabular-nums text-foreground sm:text-5xl">
                {kg(pesoTotal)}
              </Mono>
              <p className="mt-3 text-xs text-muted-foreground">
                KG · peso bruto descontada a tara
              </p>
            </div>
            <Scale aria-hidden className="mt-1 size-5 shrink-0 text-muted-foreground" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-background/35 px-5 py-4 sm:px-7">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Recycle aria-hidden className="size-4" />
              <span>Histórico de resíduo</span>
              <span className="text-xs">· {ultimos.length} registros</span>
            </div>
            <Mono className="text-xl font-medium tabular-nums text-warning">
              {kg(residuoTotal)} kg
            </Mono>
          </div>
        </section>

        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {metricasSecundarias.map((c) => (
            <div
              key={c.label}
              className="flex min-h-[6.2rem] items-center justify-between gap-4 px-5 py-4"
            >
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {c.label}
                </p>
                <Mono className="mt-1 block text-2xl leading-none font-semibold tabular-nums">
                  {c.value}
                </Mono>
                <p className="mt-1.5 text-xs text-muted-foreground">{c.sub}</p>
              </div>
              <c.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>

      <Panel
        title="Estoque por Medida"
        description="Peso líquido disponível comparado ao estoque mínimo de cada medida."
        action={
          abaixoDoMinimo > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-xs font-medium text-destructive-foreground">
              <TriangleAlert className="size-3.5" />
              {abaixoDoMinimo} abaixo do mínimo
            </span>
          )
        }
      >
        <div className="scroll-area -mx-5 max-h-[22rem] overflow-auto sm:-mx-6">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-5 py-3 font-medium sm:px-6">Medida</th>
                <th className="px-3 py-3 text-right font-medium">
                  Mínimo (KG)
                </th>
                <th className="px-3 py-3 text-right font-medium">QTD</th>
                <th className="px-5 py-3 text-right font-medium sm:px-6">
                  Peso Total (KG)
                </th>
              </tr>
            </thead>
            <tbody>
              {porMedida.map((m) => (
                <tr
                  key={m.medida}
                  className="border-t border-border/70 transition-colors hover:bg-accent/40"
                >
                  <td className="px-5 py-3 font-semibold sm:px-6">
                    {m.medida}
                  </td>
                  <td className="px-3 py-3 text-right text-muted-foreground">
                    <Mono>{kg(m.minimoKg, 0)}</Mono>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Mono>{m.qtd}</Mono>
                  </td>
                  <td className="px-5 py-3 text-right sm:px-6">
                    <span className="inline-flex items-center gap-2">
                      {m.abaixo && (
                        <span
                          className="size-2 rounded-full bg-destructive"
                          title="Abaixo do mínimo"
                        />
                      )}
                      <Mono
                        className={cn(
                          'font-medium',
                          m.abaixo ? 'text-destructive' : 'text-success',
                        )}
                      >
                        {kg(m.peso)}
                      </Mono>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Histórico de Resíduos (Últimos 20)"
        description="Sobras registradas na baixa de rolos."
      >
        <div className="scroll-area -mx-5 max-h-[20rem] overflow-auto sm:-mx-6">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-5 py-3 font-medium sm:px-6">Data</th>
                <th className="px-3 py-3 font-medium">Origem</th>
                <th className="px-3 py-3 font-medium">Operador</th>
                <th className="px-5 py-3 text-right font-medium sm:px-6">
                  Peso (KG)
                </th>
              </tr>
            </thead>
            <tbody>
              {ultimos.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border/70 transition-colors hover:bg-accent/40"
                >
                  <td className="px-5 py-2.5 text-muted-foreground sm:px-6">
                    <Mono>{dataBR(r.data)}</Mono>
                  </td>
                  <td className="px-3 py-2.5">{r.origem}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {r.operador}
                  </td>
                  <td className="px-5 py-2.5 text-right sm:px-6">
                    <Mono className="text-warning">{kg(r.peso)}</Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
