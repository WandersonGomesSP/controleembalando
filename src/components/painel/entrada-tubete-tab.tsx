import * as React from 'react'
import { toast } from 'sonner'
import { Boxes, Clock3, PackageCheck, RefreshCw } from 'lucide-react'
import { int, useStore } from '@/lib/store'
import type { StockOperationLogRow } from '@/lib/database.types'
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

function textoDetalhe(valor: unknown) {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (Array.isArray(valor)) return valor.join(', ')
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

function HistoricoOperacoes({
  historico,
  temMais,
  atualizar,
  carregarMais,
}: {
  historico: StockOperationLogRow[]
  temMais: boolean
  atualizar: () => Promise<void>
  carregarMais: () => Promise<void>
}) {
  const coresAcao = {
    ENTRADA: 'text-success',
    'SAÍDA': 'text-warning',
    ALTERAÇÃO: 'text-primary',
  }

  return (
    <Panel
      title="Histórico de operações"
      description="Entradas, saídas e alterações registradas no estoque."
      action={
        <button
          type="button"
          onClick={() => void atualizar()}
          aria-label="Atualizar histórico"
          className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className="size-4" />
        </button>
      }
      className="self-start"
    >
      <div className="scroll-area max-h-[34rem] space-y-3 overflow-y-auto pr-1">
        {historico.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma operação registrada ainda.
          </p>
        ) : (
          historico.map((registro) => (
            <article
              key={registro.id}
              className="rounded-lg border border-border/80 bg-background/40 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-xs font-semibold ${coresAcao[registro.acao]}`}>
                  {registro.acao} · {registro.entidade}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock3 className="size-3" />
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(registro.ocorrido_em))}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {registro.operador}
                {registro.ator_email && registro.ator_email !== registro.operador
                  ? ` · ${registro.ator_email}`
                  : ''}
              </p>
              <p className="mt-2 text-sm">
                Registro <Mono className="font-semibold">{registro.registro_id}</Mono>
                {' · '}
                <Mono>{registro.quantidade.toLocaleString('pt-BR')}</Mono>
                {registro.entidade === 'Lote de tubetes'
                  ? ' unidades'
                  : registro.entidade === 'Rolo' ||
                      registro.entidade === 'Rolo de insumo'
                    ? ' rolo(s)'
                    : ' item(ns)'}
              </p>
              {registro.codigos.length > 0 && (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  Códigos: <Mono>{registro.codigos.join(', ')}</Mono>
                </p>
              )}
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Ver detalhes</summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                  {Object.entries(registro.detalhes).map(([chave, valor]) => (
                    <React.Fragment key={chave}>
                      <dt className="capitalize">{chave.replaceAll('_', ' ')}</dt>
                      <dd className="break-words text-foreground">
                        {textoDetalhe(valor)}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              </details>
            </article>
          ))
        )}
      </div>
      {temMais && (
        <button
          type="button"
          onClick={() => void carregarMais()}
          className="mt-3 w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Carregar operações anteriores
        </button>
      )}
    </Panel>
  )
}

export function EntradaTubeteTab() {
  const {
    adicionarTubetes,
    referenciasTubetes,
    historicoEstoque,
    historicoTemMais,
    atualizarHistoricoEstoque,
    carregarMaisHistoricoEstoque,
  } = useStore()
  const [descricaoReferencia, setDescricaoReferencia] = React.useState('')
  const [gramatura, setGramatura] = React.useState('')
  const [dataProducao, setDataProducao] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [caixas, setCaixas] = React.useState('')
  const [operador, setOperador] = React.useState('')
  const [perda, setPerda] = React.useState('')
  React.useEffect(() => {
    void atualizarHistoricoEstoque()
  }, [atualizarHistoricoEstoque])
  const referencia = referenciasTubetes.find(
    (item) => item.descricao === descricaoReferencia,
  )
  const fator = referencia?.tubetesPorCaixa ?? 0

  const total = Math.max(
    0,
    inteiro(caixas) * fator - inteiro(perda),
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!referencia) return toast.error('Selecione a medida.')
    if (inteiro(caixas) < 1) return toast.error('Informe a quantidade de caixas.')
    if (fator < 1) return toast.error('Selecione uma medida configurada.')
    if (!operador.trim()) return toast.error('Informe o operador.')
    try {
      await adicionarTubetes({
        medida: referencia.medida,
        cor: referencia.cor ?? '',
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

      <div className="flex flex-col gap-6">
        <HistoricoOperacoes
          historico={historicoEstoque}
          temMais={historicoTemMais}
          atualizar={atualizarHistoricoEstoque}
          carregarMais={carregarMaisHistoricoEstoque}
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
