import * as React from 'react'
import { toast } from 'sonner'
import { Boxes, PackageCheck } from 'lucide-react'
import {
  CORES_TUBETE,
  MEDIDAS_TUBETE,
  TUBETES_POR_CAIXA,
  unidadesPadrao,
} from '@/lib/fixtures'
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
  const { adicionarTubetes } = useStore()
  const [medida, setMedida] = React.useState('')
  const [cor, setCor] = React.useState('Marrom')
  const [gramatura, setGramatura] = React.useState('')
  const [dataProducao, setDataProducao] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [caixas, setCaixas] = React.useState('')
  const [operador, setOperador] = React.useState('')
  const [unidades, setUnidades] = React.useState('')
  const [perda, setPerda] = React.useState('')

  // Sugere unidades por caixa a partir da tabela de referência.
  function aplicarPadrao(m: string, c: string) {
    const u = unidadesPadrao(m, c)
    if (u) setUnidades(String(u))
  }

  const total = Math.max(
    0,
    inteiro(caixas) * inteiro(unidades) - inteiro(perda),
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!medida) return toast.error('Selecione a medida.')
    if (inteiro(caixas) < 1) return toast.error('Informe a quantidade de caixas.')
    if (inteiro(unidades) < 1)
      return toast.error('Informe as unidades por caixa.')
    if (!operador.trim()) return toast.error('Informe o operador.')
    try {
      await adicionarTubetes({
        medida,
        cor,
        gramatura: inteiro(gramatura),
        dataProducao,
        caixas: inteiro(caixas),
        unidadesPorCaixa: inteiro(unidades),
        perda: inteiro(perda),
        operador: operador.trim(),
      })
    } catch {
      return toast.error('Não foi possível salvar a entrada no Supabase.')
    }
    toast.success(`${int(total)} tubetes adicionados ao estoque`, {
      description: `${medida} ${cor} · ${inteiro(caixas)} caixa(s)`,
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
                onChange={(e) => {
                  setMedida(e.target.value)
                  aplicarPadrao(e.target.value, cor)
                }}
                placeholder="Selecione a medida"
                options={MEDIDAS_TUBETE}
              />
            </Field>
            <Field label="Cor" htmlFor="t-cor">
              <SelectInput
                id="t-cor"
                value={cor}
                onChange={(e) => {
                  setCor(e.target.value)
                  aplicarPadrao(medida, e.target.value)
                }}
                options={CORES_TUBETE}
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
              hint="Preenchido pela tabela de referência; ajuste se necessário."
            >
              <TextInput
                id="t-un"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="0"
                value={unidades}
                onChange={(e) => setUnidades(e.target.value)}
              />
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
        title="Quantidade de Tubetes por caixa"
        description="Valores padrão de referência."
        className="self-start"
      >
        <ul className="-my-1 divide-y divide-border/70">
          {TUBETES_POR_CAIXA.map((r) => {
            const ativo =
              r.medida === medida && (r.cor === null || r.cor === cor)
            return (
              <li key={r.medida + r.cor}>
                <button
                  type="button"
                  onClick={() => {
                    setMedida(r.medida)
                    if (r.cor) setCor(r.cor)
                    setUnidades(String(r.unidades))
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                    ativo && 'bg-primary/15 text-primary',
                  )}
                >
                  <span>
                    <Mono className="font-medium">{r.medida}</Mono>
                    {r.cor && (
                      <span className="ml-1.5 text-muted-foreground">
                        {r.cor}
                      </span>
                    )}
                  </span>
                  <Mono className="font-semibold">= {r.unidades}</Mono>
                </button>
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}
