import { int, kg, useStore } from '@/lib/store'
import { Mono } from '@/components/painel/fields'

export function ResumoTab() {
  const {
    tubetes,
    referenciasTubetes,
    insumosRolos,
    referenciasInsumos,
    carregando,
  } = useStore()

  const inventarioTubetes = referenciasTubetes.map((referencia) => {
    const lotes = tubetes.filter(
      (lote) =>
        lote.medida.toLocaleLowerCase() === referencia.medida.toLocaleLowerCase(),
    )
    const qtdCaixas = lotes.reduce((total, lote) => total + lote.caixas, 0)
    const total = qtdCaixas * referencia.tubetesPorCaixa

    return {
      ...referencia,
      qtdCaixas,
      total,
      abaixo: referencia.estoqueMin !== null && total < referencia.estoqueMin,
    }
  })

  const pesoTotalInsumos = insumosRolos.reduce((total, rolo) => total + rolo.pesoLiqKg, 0)
  const balancoInsumos = referenciasInsumos.map((referencia) => {
    const rolos = insumosRolos.filter(
      (rolo) =>
        rolo.tipo === referencia.tipo &&
        rolo.medidaCategoria === referencia.medidaCategoria,
    )
    const peso = rolos.reduce((total, rolo) => total + rolo.pesoLiqKg, 0)

    return {
      ...referencia,
      unidades: rolos.length,
      peso,
      critico:
        referencia.limiteCriticoKg !== null && peso <= referencia.limiteCriticoKg,
    }
  })
  const alertasCriticas = balancoInsumos.filter((referencia) => referencia.critico)
  const limitesCriticosConfigurados = balancoInsumos.filter(
    (referencia) => referencia.limiteCriticoKg !== null,
  ).length

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="tubete-inventory-heading" className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Controle operacional · 01
            </p>
            <h2 id="tubete-inventory-heading" className="mt-1 text-lg font-semibold">
              Controle Operacional de Tubetes
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {int(inventarioTubetes.length)} referências configuradas
          </p>
        </header>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="scroll-area max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[58rem] text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Medida</th>
                  <th className="px-3 py-3 text-right font-medium">Qtd Caixa</th>
                  <th className="px-3 py-3 text-right font-medium">Tubetes / Caixa</th>
                  <th className="px-3 py-3 text-right font-medium">Total Tubetes</th>
                  <th className="px-3 py-3 text-right font-medium">Estoque Mín</th>
                  <th className="px-4 py-3 font-medium">Status Industrial</th>
                </tr>
              </thead>
              <tbody>
                {inventarioTubetes.map((item) => (
                  <tr key={item.descricao} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3 font-medium">{item.descricao}</td>
                    <td className="px-3 py-3 text-right"><Mono>{int(item.qtdCaixas)}</Mono></td>
                    <td className="px-3 py-3 text-right"><Mono>{int(item.tubetesPorCaixa)}</Mono></td>
                    <td className="px-3 py-3 text-right font-semibold"><Mono>{int(item.total)}</Mono></td>
                    <td className="px-3 py-3 text-right text-muted-foreground">
                      <Mono>{item.estoqueMin === null ? '—' : int(item.estoqueMin)}</Mono>
                    </td>
                    <td className="px-4 py-3">
                      {item.estoqueMin === null ? (
                        <span className="inline-flex rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                          Mínimo não configurado
                        </span>
                      ) : item.abaixo ? (
                        <span className="inline-flex rounded-md bg-red-950/50 px-2 py-1 text-xs text-red-400">
                          PRODUZIR - abaixo do mínimo
                        </span>
                      ) : (
                        <span className="inline-flex rounded-md bg-green-950/50 px-2 py-1 text-xs text-green-400">
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {!carregando && inventarioTubetes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Nenhuma referência de tubete cadastrada no Supabase.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="insumos-heading" className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Materiais de produção · 02
            </p>
            <h2 id="insumos-heading" className="mt-1 text-lg font-semibold">
              Monitoramento de Insumos (Rótulos e Capas)
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {int(insumosRolos.length)} rolos disponíveis
          </p>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <div className="flex min-h-48 flex-col justify-between rounded-md border border-border bg-card p-5 sm:p-7">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Peso Total de Insumos
            </p>
            <div className="mt-6">
              <Mono className="block text-5xl leading-none font-semibold tabular-nums sm:text-6xl">
                {kg(pesoTotalInsumos)}
              </Mono>
              <p className="mt-3 text-sm text-muted-foreground">KG · rótulos e capas disponíveis</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Rótulos e Capas Ativos</h3>
              <span className="text-xs text-muted-foreground">
                {alertasCriticas.length > 0
                  ? `${int(alertasCriticas.length)} níveis críticos`
                  : limitesCriticosConfigurados > 0
                    ? 'Sem níveis críticos'
                    : 'Limites não configurados'}
              </span>
            </div>
            <div className="scroll-area max-h-[19rem] overflow-auto">
              <ul className="divide-y divide-border/70">
                {balancoInsumos.map((item) => (
                  <li key={`${item.tipo}-${item.medidaCategoria}`} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.medidaCategoria}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.tipo} · <Mono>{int(item.unidades)}</Mono> rolos</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Mono className="block text-sm font-medium">{kg(item.peso)} kg</Mono>
                      {item.limiteCriticoKg === null ? (
                        <span className="text-xs text-muted-foreground">Limite não configurado</span>
                      ) : item.critico ? (
                        <span className="text-xs text-red-400">Crítico · mín. <Mono>{kg(item.limiteCriticoKg)}</Mono> kg</span>
                      ) : (
                        <span className="text-xs text-green-400">Dentro do nível</span>
                      )}
                    </div>
                  </li>
                ))}
                {!carregando && balancoInsumos.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma categoria de insumo cadastrada no Supabase.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
