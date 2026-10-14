import * as React from 'react'
import { toast } from 'sonner'
import { Plus, X, ClipboardPlus } from 'lucide-react'
import {
  CAPAS,
  CODIGO_GRUPOS,
  DESTINOS,
  ESPESSURAS,
  TUBOS,
  type CodigoGrupo,
} from '@/lib/fixtures'
import { dataBR, kg, useStore } from '@/lib/store'
import {
  Field,
  Mono,
  Panel,
  PrimaryButton,
  SelectInput,
  TextInput,
} from '@/components/painel/fields'

const hoje = () => new Date().toISOString().slice(0, 10)

const codigosVazios = (): Record<CodigoGrupo, string[]> => ({
  codCapa: [''],
  codRotulo: [''],
  ramenzoni400: [''],
  ramenzoni280: [''],
  codCola: [''],
})

export function ProducaoTubosTab() {
  const { producao, adicionarProducao } = useStore()
  const [destino, setDestino] = React.useState('')
  const [data, setData] = React.useState(hoje)
  const [espessura, setEspessura] = React.useState('')
  const [tubo, setTubo] = React.useState('')
  const [capa, setCapa] = React.useState('')
  const [codigos, setCodigos] = React.useState(codigosVazios)
  const [operador, setOperador] = React.useState('')
  const [perda, setPerda] = React.useState('')
  const [container, setContainer] = React.useState('')
  const [carrinho, setCarrinho] = React.useState('')

  const setCodigo = (g: CodigoGrupo, i: number, v: string) =>
    setCodigos((c) => ({ ...c, [g]: c[g].map((x, j) => (j === i ? v : x)) }))
  const addCodigo = (g: CodigoGrupo) =>
    setCodigos((c) => ({ ...c, [g]: [...c[g], ''] }))
  const removeCodigo = (g: CodigoGrupo, i: number) =>
    setCodigos((c) => ({ ...c, [g]: c[g].filter((_, j) => j !== i) }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!destino || !espessura || !tubo || !capa)
      return toast.error('Preencha Destino, Espessura, Tubo e Capa.')
    if (!operador.trim()) return toast.error('Informe o operador.')
    const p = Number(perda.replace(',', '.') || '0')
    if (Number.isNaN(p) || p < 0) return toast.error('Perda inválida.')
    const limpos = Object.fromEntries(
      Object.entries(codigos).map(([k, v]) => [
        k,
        v.map((x) => x.trim()).filter(Boolean),
      ]),
    ) as Record<CodigoGrupo, string[]>
    try {
      await adicionarProducao({
        destino,
        data,
        espessura,
        tubo,
        capa,
        codigos: limpos,
        operador: operador.trim(),
        perda: p,
        container: container.trim(),
        carrinho: carrinho.trim(),
      })
    } catch {
      return toast.error('Não foi possível salvar a produção no Supabase.')
    }
    toast.success('Produção registrada', {
      description: `Tubo ${tubo} · ${espessura} → ${destino}`,
    })
    setCodigos(codigosVazios())
    setPerda('')
    setContainer('')
    setCarrinho('')
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel
        title="Cad. Produção de Tubos"
        description="Registre a produção com os insumos utilizados em cada lote."
      >
        <form onSubmit={submit} className="flex flex-col gap-7">
          <fieldset className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="sr-only">Especificação</legend>
            <Field label="Destino" htmlFor="p-destino">
              <SelectInput
                id="p-destino"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="Selecione"
                options={DESTINOS}
              />
            </Field>
            <Field label="Data" htmlFor="p-data">
              <TextInput
                id="p-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </Field>
            <Field label="Espessura" htmlFor="p-esp">
              <SelectInput
                id="p-esp"
                value={espessura}
                onChange={(e) => setEspessura(e.target.value)}
                placeholder="Selecione"
                options={ESPESSURAS}
              />
            </Field>
            <Field label="Tubo" htmlFor="p-tubo">
              <SelectInput
                id="p-tubo"
                value={tubo}
                onChange={(e) => setTubo(e.target.value)}
                placeholder="Selecione"
                options={TUBOS}
              />
            </Field>
            <Field label="Capa" htmlFor="p-capa">
              <SelectInput
                id="p-capa"
                value={capa}
                onChange={(e) => setCapa(e.target.value)}
                placeholder="Selecione"
                options={CAPAS}
              />
            </Field>
          </fieldset>

          <fieldset className="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
            <legend className="px-2 text-xs font-semibold tracking-wide text-primary uppercase">
              Códigos de insumos
            </legend>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {CODIGO_GRUPOS.map((g) => (
                <div key={g.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {g.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => addCodigo(g.key)}
                      aria-label={`Adicionar ${g.label}`}
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                    >
                      <Plus className="size-3.5" />
                      Adicionar
                    </button>
                  </div>
                  {codigos[g.key].map((v, i) => (
                    <div key={i} className="flex gap-2">
                      <TextInput
                        aria-label={`${g.label} ${i + 1}`}
                        placeholder={`${g.label} ${i + 1}`}
                        value={v}
                        onChange={(e) => setCodigo(g.key, i, e.target.value)}
                        className="font-mono"
                      />
                      {codigos[g.key].length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCodigo(g.key, i)}
                          aria-label={`Remover ${g.label} ${i + 1}`}
                          className="grid size-11 shrink-0 place-items-center rounded-lg border border-input bg-field text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="sr-only">Operação</legend>
            <Field label="Operador" htmlFor="p-op">
              <TextInput
                id="p-op"
                placeholder="Nome do operador"
                value={operador}
                onChange={(e) => setOperador(e.target.value)}
              />
            </Field>
            <Field label="Perda (kg)" htmlFor="p-perda">
              <TextInput
                id="p-perda"
                inputMode="decimal"
                placeholder="0,0"
                value={perda}
                onChange={(e) => setPerda(e.target.value)}
              />
            </Field>
            <Field label="Container" htmlFor="p-cont">
              <TextInput
                id="p-cont"
                placeholder="Ex: C-12"
                value={container}
                onChange={(e) => setContainer(e.target.value)}
              />
            </Field>
            <Field label="Carrinho" htmlFor="p-car">
              <TextInput
                id="p-car"
                placeholder="Ex: K-04"
                value={carrinho}
                onChange={(e) => setCarrinho(e.target.value)}
              />
            </Field>
          </fieldset>

          <PrimaryButton type="submit">
            <ClipboardPlus className="size-5" />
            Adicionar em Cad. Produção de Tubos
          </PrimaryButton>
        </form>
      </Panel>

      <Panel title="Últimos registros" description={`${producao.length} lançamento(s)`}>
        <ul className="scroll-area -mr-2 flex max-h-[44rem] flex-col gap-3 overflow-auto pr-2">
          {producao.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-border bg-background/40 p-4 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  Tubo {p.tubo} · {p.espessura}
                </span>
                <Mono className="text-xs text-muted-foreground">
                  {dataBR(p.data)}
                </Mono>
              </div>
              <p className="mt-0.5 text-muted-foreground">
                {p.destino} · capa {p.capa}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CODIGO_GRUPOS.flatMap((g) =>
                  p.codigos[g.key].map((c) => (
                    <span
                      key={g.key + c}
                      title={g.label}
                      className="rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[11px] text-primary"
                    >
                      {c}
                    </span>
                  )),
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {p.operador} · perda {kg(p.perda)} kg
                {p.container && ` · ${p.container}`}
                {p.carrinho && ` · ${p.carrinho}`}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
