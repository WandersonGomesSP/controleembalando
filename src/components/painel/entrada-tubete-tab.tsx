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
import { cn } from '@/lib/utils'

const inteiro = (v: string) => Math.max(0, Math.floor(Number(v) || 0))

export function EntradaTubeteTab() {
  const { adicionarTubetes, referenciasTubetes } = useStore()
  const [medida, setMedida] = React.useState('')
  const [gramatura, setGramatura] = React.useState('')
  const [dataProducao, setDataProducao] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [caixas, setCaixas] = React.useState('')
  const [operador, setOperador] = React.useState('')
  const [perda, setPerda] = React.useState('')
  const fator = referenciasTubetes.find((item) => item.medida === medida)?.tubetesPorCaixa ?? 0

  const total = Math.max(
    0,
    inteiro(caixas) * fator - inteiro(perda),
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!medida) return toast.error('Selecione a medida.')
    if (inteiro(caixas) < 1) return toast.error('Informe a quantidade de caixas.')
    if (fator < 1) return toast.error('Selecione uma medida configurada.')
    if (!operador.trim()) return toast.error('Informe o operador.')
    try {
      await adicionarTubetes({
        medida,
        cor: '',
        gramatura: inteiro(gramatura),
        dataProducao,
        caixas: inteiro(caixas),
        unidadesPorCaixa: fator,
        perda: inteiro(perda),
        operador: operador.trim(),
      })
    } catch {
      return toast.error('Não foi possível salvar a entrada no Supabase.')
    }
    toast.success(`${int(total)} tubetes adicionados ao estoque`, {
      description: `${medida} · ${inteiro(caixas)} caixa(s)`,
    })
    setCaixas('')
    setPerda('')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel
        title="Entrada Estoque Tubete"
        description="Lance as caixas de tubetes produzidas."
      >
        <form onSubmit={submit} className="flex flex-col gap-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Medida" htmlFor="t-medida">
              <SelectInput
                id="t-medida"
                value={medida}
                onChange={(e) => setMedida(e.target.value)}
                placeholder="Selecione a medida"
                options={referenciasTubetes.map((referencia) => ({
                  value: referencia.medida,
                  label: referencia.descricao,
                }))}
              />
            </Field>
            <Field label="Gramatura (g/m²)" htmlFor="t-gram">
              <TextInput
                id="t-gram"
                inputMode="numeric"
                placeholder="Ex: 380"
                value={gramatura}
                onChange={(e) => setGramatura(e.target.value)}
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
                inputMode="numeric"
                placeholder="0"
                value={caixas}
                onChange={(e) => setCaixas(e.target.value)}
              />
            </Field>
            <Field label="Operador" htmlFor="t-op">
              <TextInput
                id="t-op"
                placeholder="Nome do operador"
                value={operador}
                onChange={(e) => setOperador(e.target.value)}
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
            <Field label="Perda (unidades)" htmlFor="t-perda">
              <TextInput
                id="t-perda"
                type="number"
                min={0}
                inputMode="numeric"
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
                  caixas × unidades − perda
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

      <Panel
        title="Referências por caixa"
        description="Fator industrial aplicado à medida selecionada."
        className="self-start"
      >
        <ul className="-my-1 divide-y divide-border/70">
          {referenciasTubetes.map((r) => {
            const ativo = r.medida === medida
            return (
              <li key={r.medida}>
                <button
                  type="button"
                  onClick={() => {
                    setMedida(r.medida)
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
  )
}
