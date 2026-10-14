import * as React from 'react'
import { toast } from 'sonner'
import { Hash, PackageMinus, PackagePlus, Save, Search } from 'lucide-react'
import { MEDIDAS } from '@/lib/fixtures'
import { formatId, kg, pesoLiquido, useStore } from '@/lib/store'
import {
  Field,
  Mono,
  Panel,
  PrimaryButton,
  SelectInput,
  TextInput,
} from '@/components/painel/fields'

const num = (v: string) => Number(v.replace(',', '.'))

function mascaraValidade(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

/* ---------------------------------- Entrada --------------------------------- */

export function EntradaTab() {
  const { proximoId, adicionarRolos } = useStore()
  const [medida, setMedida] = React.useState('')
  const [quantidade, setQuantidade] = React.useState('1')
  const [pesoBruto, setPesoBruto] = React.useState('')
  const [tara, setTara] = React.useState('')
  const [validade, setValidade] = React.useState('')

  const qtd = Math.max(0, Math.min(99, Math.floor(num(quantidade) || 0)))
  const ids =
    qtd <= 0
      ? '—'
      : qtd === 1
        ? formatId(proximoId)
        : `${formatId(proximoId)} → ${formatId(proximoId + qtd - 1)}`

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const bruto = num(pesoBruto)
    const t = num(tara || '0')
    const mes = Number(validade.slice(0, 2))
    if (!medida) return toast.error('Selecione a medida.')
    if (qtd < 1) return toast.error('Informe uma quantidade válida.')
    if (!(bruto > 0)) return toast.error('Informe o peso bruto por rolo.')
    if (t < 0 || t >= bruto) return toast.error('Tara inválida.')
    if (!/^\d{2}\/\d{2}$/.test(validade) || mes < 1 || mes > 12)
      return toast.error('Validade deve estar no formato MM/AA.')
    const novos = adicionarRolos(
      { medida, pesoBruto: bruto, tara: t, validade },
      qtd,
    )
    toast.success(`${novos.length} rolo(s) adicionados ao estoque`, {
      description: novos.join(', '),
    })
    setQuantidade('1')
    setPesoBruto('')
    setValidade('')
  }

  return (
    <Panel
      title="Entrada de Rolos"
      description="Registre novos rolos de papel no estoque. Os IDs são gerados em sequência."
      className="mx-auto max-w-3xl"
    >
      <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <Field label="Medida" htmlFor="e-medida">
          <SelectInput
            id="e-medida"
            value={medida}
            onChange={(e) => setMedida(e.target.value)}
            placeholder="Selecione a medida"
            options={MEDIDAS.map((m) => m.medida)}
          />
        </Field>
        <Field label="Quantidade" htmlFor="e-qtd">
          <TextInput
            id="e-qtd"
            type="number"
            min={1}
            max={99}
            inputMode="numeric"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </Field>
        <Field label="Peso bruto por rolo (kg)" htmlFor="e-bruto">
          <TextInput
            id="e-bruto"
            inputMode="decimal"
            placeholder="Ex: 250,5"
            value={pesoBruto}
            onChange={(e) => setPesoBruto(e.target.value)}
          />
        </Field>
        <Field label="Tara (tubete)" htmlFor="e-tara" hint="Peso do tubete em kg">
          <TextInput
            id="e-tara"
            inputMode="decimal"
            placeholder="Ex: 8,0"
            value={tara}
            onChange={(e) => setTara(e.target.value)}
          />
        </Field>
        <Field label="Validade (MM/AA)" htmlFor="e-validade">
          <TextInput
            id="e-validade"
            inputMode="numeric"
            placeholder="MM/AA"
            value={validade}
            onChange={(e) => setValidade(mascaraValidade(e.target.value))}
          />
        </Field>

        <div
          role="status"
          className="flex items-center gap-3 self-end rounded-xl border border-primary/40 bg-primary/10 px-4 py-3"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/20 text-primary">
            <Hash className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-primary uppercase">
              Próximos IDs
            </p>
            <Mono className="block truncate text-lg font-semibold">{ids}</Mono>
          </div>
        </div>

        <PrimaryButton type="submit" className="sm:col-span-2">
          <PackagePlus className="size-5" />
          Adicionar ao Estoque
        </PrimaryButton>
      </form>
    </Panel>
  )
}

/* ----------------------------------- Saída ---------------------------------- */

export function SaidaTab() {
  const { rolos, darBaixa } = useStore()
  const [termo, setTermo] = React.useState('')
  const [busca, setBusca] = React.useState<string | null>(null)
  const [residuo, setResiduo] = React.useState<Record<string, string>>({})

  const resultados = React.useMemo(() => {
    if (busca === null) return []
    const t = busca.trim().toLowerCase()
    if (!t) return rolos
    return rolos.filter(
      (r) =>
        r.id.toLowerCase().includes(t) || r.medida.toLowerCase().includes(t),
    )
  }, [busca, rolos])

  function baixa(id: string) {
    const res = num(residuo[id] || '0')
    if (res < 0 || Number.isNaN(res))
      return toast.error('Resíduo inválido.')
    darBaixa(id, res)
    toast.success(`Saída registrada para ${id}`, {
      description: res > 0 ? `Resíduo de ${kg(res)} kg registrado.` : undefined,
    })
  }

  return (
    <Panel
      title="Saída de Rolos"
      description="Localize o rolo pelo ID ou pela medida e registre a baixa."
      className="mx-auto max-w-4xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setBusca(termo)
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <TextInput
            aria-label="Filtrar por ID ou Medida"
            placeholder="Filtrar por ID ou Medida"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            className="pl-10"
          />
        </div>
        <PrimaryButton type="submit" size="md" className="sm:w-32">
          <Search className="size-4" />
          Buscar
        </PrimaryButton>
      </form>

      <div className="mt-5 overflow-hidden rounded-xl border border-border bg-background/40">
        {resultados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <PackageMinus className="size-8 text-muted-foreground/60" />
            <p className="font-medium">Nenhum rolo encontrado</p>
            <p className="text-sm text-muted-foreground">
              {busca === null
                ? 'Digite um ID (ex: R-1030) ou medida (ex: 18mm) e clique em Buscar.'
                : 'Tente outro ID ou medida.'}
            </p>
          </div>
        ) : (
          <div className="scroll-area max-h-[26rem] overflow-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-3 py-3 font-medium">Medida</th>
                  <th className="px-3 py-3 text-right font-medium">
                    Líquido (kg)
                  </th>
                  <th className="px-3 py-3 font-medium">Validade</th>
                  <th className="px-3 py-3 font-medium">Resíduo (kg)</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {resultados.map((r) => (
                  <tr key={r.id} className="border-t border-border/70">
                    <td className="px-4 py-2.5">
                      <Mono className="font-semibold text-primary">{r.id}</Mono>
                    </td>
                    <td className="px-3 py-2.5">{r.medida}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Mono>{kg(pesoLiquido(r))}</Mono>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <Mono>{r.validade}</Mono>
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        aria-label={`Resíduo do rolo ${r.id}`}
                        inputMode="decimal"
                        placeholder="0,0"
                        value={residuo[r.id] ?? ''}
                        onChange={(e) =>
                          setResiduo((s) => ({ ...s, [r.id]: e.target.value }))
                        }
                        className="h-9 w-24"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => baixa(r.id)}
                        className="h-9 rounded-lg border border-destructive/50 bg-destructive/10 px-3 text-xs font-semibold text-destructive-foreground transition-colors hover:bg-destructive/25 focus-visible:ring-[3px] focus-visible:ring-destructive/40 focus-visible:outline-none"
                      >
                        Dar baixa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {resultados.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {resultados.length} rolo(s) encontrado(s)
        </p>
      )}
    </Panel>
  )
}

/* -------------------------------- Ajuste Peso ------------------------------- */

export function AjustePesoTab() {
  const { rolos, ajustarPeso } = useStore()
  const [id, setId] = React.useState('')
  const [pesoBruto, setPesoBruto] = React.useState('')
  const [tara, setTara] = React.useState('')

  const normalizado = id.trim().toUpperCase().replace(/^(\d)/, 'R-$1')
  const atual = rolos.find((r) => r.id === normalizado)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const bruto = num(pesoBruto)
    const t = num(tara || String(atual?.tara ?? 0))
    if (!atual) return toast.error(`Rolo ${normalizado || '—'} não encontrado.`)
    if (!(bruto > 0)) return toast.error('Informe o novo peso bruto.')
    if (t < 0 || t >= bruto) return toast.error('Tara inválida.')
    ajustarPeso(atual.id, bruto, t)
    toast.success(`Peso do rolo ${atual.id} atualizado`, {
      description: `Novo líquido: ${kg(bruto - t)} kg`,
    })
    setPesoBruto('')
    setTara('')
  }

  return (
    <Panel
      title="Ajuste de Peso"
      description="Corrija o peso bruto ou a tara de um rolo já cadastrado."
      className="mx-auto max-w-xl"
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field
          label="ID do Rolo"
          htmlFor="a-id"
          hint={
            atual
              ? `${atual.medida} · bruto ${kg(atual.pesoBruto)} kg · tara ${kg(atual.tara)} kg`
              : 'Ex: R-1030'
          }
        >
          <TextInput
            id="a-id"
            placeholder="R-0000"
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="font-mono uppercase"
          />
        </Field>
        <Field label="Novo peso bruto (kg)" htmlFor="a-bruto">
          <TextInput
            id="a-bruto"
            inputMode="decimal"
            placeholder={atual ? kg(atual.pesoBruto) : 'Ex: 250,5'}
            value={pesoBruto}
            onChange={(e) => setPesoBruto(e.target.value)}
          />
        </Field>
        <Field label="Tara" htmlFor="a-tara">
          <TextInput
            id="a-tara"
            inputMode="decimal"
            placeholder={atual ? kg(atual.tara) : 'Ex: 8,0'}
            value={tara}
            onChange={(e) => setTara(e.target.value)}
          />
        </Field>
        <PrimaryButton type="submit">
          <Save className="size-5" />
          Salvar Alteração
        </PrimaryButton>
      </form>
    </Panel>
  )
}
