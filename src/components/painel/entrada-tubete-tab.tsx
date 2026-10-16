import * as React from 'react'
import { toast } from 'sonner'
import { Boxes, PackageCheck } from 'lucide-react'
import { int, useStore } from '@/lib/store'
import {
  Field,
  Mono,
  Panel,
  PrimaryButton,
  SelectInput,
  TextInput,
} from '@/components/painel/fields'
import { StockOperationHistory } from '@/components/painel/stock-operation-history'
import { cn } from '@/lib/utils'

const inteiro = (v: string) => Math.max(0, Math.floor(Number(v) || 0))

export function EntradaTubeteTab() {
  const {
    adicionarTubetes,
    referenciasTubetes,
    operadores,
  } = useStore()
  const [descricaoReferencia, setDescricaoReferencia] = React.useState('')
  const [dataProducao, setDataProducao] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [caixas, setCaixas] = React.useState('')
  const [operador, setOperador] = React.useState('')
  const [perda, setPerda] = React.useState('')
  const referencia = referenciasTubetes.find(
    (item) => item.descricao === descricaoReferencia,
  )
  const fator = referencia?.tubetesPorCaixa ?? 0

  const total = Math.max(0, Number(caixas) || 0) * fator

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const caixasQuantidade = Number(caixas)
    const perdaKg = Number(perda.replace(',', '.'))
    if (!referencia) return toast.error('Selecione a medida.')
    if (!Number.isInteger(caixasQuantidade) || caixasQuantidade < 1) {
      return toast.error('Informe uma quantidade inteira de caixas maior que zero.')
    }
    if (fator < 1) return toast.error('Selecione uma medida configurada.')
    if (!Number.isFinite(perdaKg) || perdaKg < 0) {
      return toast.error('Informe uma perda de material em kg igual ou maior que zero.')
    }
    if (!operador) return toast.error('Selecione o operador.')
    try {
      await adicionarTubetes({
        medida: referencia.medida,
        cor: referencia.cor ?? '',
        dataProducao,
        caixas: caixasQuantidade,
        unidadesPorCaixa: fator,
        perdaKg,
        operador,
      })
    } catch {
      return toast.error('Não foi possível salvar a entrada no Supabase.')
    }
    toast.success(`${int(total)} tubetes adicionados ao estoque`, {
      description: `${referencia.descricao} · ${inteiro(caixas)} caixa(s)`,
    })
    setCaixas('')
    setPerda('')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Panel
        title="Entrada Estoque Tubete"
        description="Lance as caixas de tubetes produzidas."
      >
        <form onSubmit={submit} className="flex flex-col gap-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Medida" htmlFor="t-medida">
              <SelectInput
                id="t-medida"
                value={descricaoReferencia}
                onChange={(e) => setDescricaoReferencia(e.target.value)}
                placeholder="Selecione a medida"
                options={referenciasTubetes.map((referencia) => ({
                  value: referencia.descricao,
                  label: referencia.descricao,
                }))}
              />
            </Field>
            <Field label="Data de Produção" htmlFor="t-data">
              <TextInput
                id="t-data"
                type="date"
                value={dataProducao}
                onChange={(e) => setDataProducao(e.target.value)}
              />
            </Field>
            <Field label="Caixa (quantidade)" htmlFor="t-caixas">
              <TextInput
                id="t-caixas"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="0"
                value={caixas}
                onChange={(e) => setCaixas(e.target.value)}
              />
            </Field>
            <Field label="Operador" htmlFor="t-op">
              <SelectInput
                id="t-op"
                value={operador}
                onChange={(e) => setOperador(e.target.value)}
                placeholder="Selecione o operador"
                options={operadores}
              />
            </Field>
            <Field
              label="Unidades por Caixa"
              htmlFor="t-un"
              hint="Fator fixo definido no modo Desenvolvedora."
            >
              <output id="t-un" className="flex h-11 items-center rounded-lg border border-border bg-field px-3.5 font-mono tabular-nums text-foreground">
                {fator > 0 ? int(fator) : '—'}
              </output>
            </Field>
            <Field label="Perda de material (kg)" htmlFor="t-perda">
              <TextInput
                id="t-perda"
                inputMode="decimal"
                min={0}
                placeholder="0"
                value={perda}
                onChange={(e) => setPerda(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/40 bg-primary/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/20 text-primary">
                <Boxes className="size-5" />
              </span>
              <div>
                <label
                  htmlFor="t-total"
                  className="text-xs font-medium tracking-wide text-primary uppercase"
                >
                  Quantidade total
                </label>
                <p className="text-xs text-muted-foreground">
                  caixas × unidades por caixa
                </p>
              </div>
            </div>
            <output id="t-total" aria-live="polite">
              <Mono className="text-3xl font-semibold">{int(total)}</Mono>
              <span className="ml-1.5 text-sm text-muted-foreground">un</span>
            </output>
          </div>

          <PrimaryButton type="submit">
            <PackageCheck className="size-5" />
            Adicionar ao Estoque de Tubetes
          </PrimaryButton>
        </form>
      </Panel>

      <div className="flex flex-col gap-6">
        <StockOperationHistory
          title="Histórico de tubetes"
          description="Somente entradas e alterações dos lotes de tubetes."
          entidades={['Lote de tubetes']}
        />
        <Panel
          title="Referências por caixa"
          description="Fator industrial aplicado à medida selecionada."
          className="self-start"
        >
          <ul className="-my-1 divide-y divide-border/70">
            {referenciasTubetes.map((r) => {
              const ativo = r.descricao === descricaoReferencia
              return (
                <li key={r.descricao}>
                  <button
                    type="button"
                    onClick={() => {
                      setDescricaoReferencia(r.descricao)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                      ativo && 'bg-primary/15 text-primary',
                    )}
                  >
                    <span>
                      <Mono className="font-medium">{r.descricao}</Mono>
                    </span>
                    <Mono className="font-semibold">= {r.tubetesPorCaixa}</Mono>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
