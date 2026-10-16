import * as React from 'react'
import { Pencil, RefreshCw, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import type { StockOperationLogRow } from '@/lib/database.types'
import {
  correctDeveloperStockRecord,
  listDeveloperStockLogs,
} from '@/lib/admin.functions'
import { Field, Mono, Panel, PrimaryButton, SelectInput, TextInput } from '@/components/painel/fields'

const EDITABLE_FIELDS: Record<string, { key: string; label: string }[]> = {
  'Lote de tubetes': [
    { key: 'medida', label: 'Medida' },
    { key: 'cor', label: 'Cor' },
    { key: 'data_producao', label: 'Data da produção' },
    { key: 'caixas', label: 'Caixas' },
    { key: 'unidades_por_caixa', label: 'Unidades por caixa' },
    { key: 'perda_kg', label: 'Perda de material (kg)' },
    { key: 'operador', label: 'Operador' },
  ],
  'Rolo de insumo': [
    { key: 'id_codigo', label: 'Código do rolo' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'medida_categoria', label: 'Medida / categoria' },
    { key: 'peso_liq_kg', label: 'Peso líquido (kg)' },
    { key: 'validade', label: 'Validade (MM/AA)' },
    { key: 'data_registro', label: 'Data de registro' },
  ],
  Rolo: [
    { key: 'id', label: 'Código do rolo' },
    { key: 'medida', label: 'Medida' },
    { key: 'peso_bruto', label: 'Peso bruto (kg)' },
    { key: 'tara', label: 'Tara (kg)' },
    { key: 'validade', label: 'Validade' },
    { key: 'entrada', label: 'Data de entrada' },
  ],
  'Produção de tubos': [
    { key: 'destino', label: 'Destino' },
    { key: 'data', label: 'Data' },
    { key: 'espessura', label: 'Espessura' },
    { key: 'tubo', label: 'Tubo' },
    { key: 'capa', label: 'Capa' },
    { key: 'codigos', label: 'Códigos (JSON)' },
    { key: 'operador', label: 'Operador' },
    { key: 'perda', label: 'Perda (kg)' },
    { key: 'container', label: 'Container' },
    { key: 'carrinho', label: 'Carrinho' },
    { key: 'quantidade_carrinhos', label: 'Quantidade de carrinhos' },
    { key: 'quantidade_containers', label: 'Quantidade de containers' },
    { key: 'tubos_por_carrinho', label: 'Tubos por carrinho' },
    { key: 'tubos_por_container', label: 'Tubos por container' },
    { key: 'quantidade_tubos', label: 'Total de tubos produzidos' },
  ],
  Resíduo: [
    { key: 'data', label: 'Data' },
    { key: 'origem', label: 'Origem' },
    { key: 'peso', label: 'Peso (kg)' },
    { key: 'operador', label: 'Operador' },
  ],
}

const NUMBER_FIELDS = new Set([
  'caixas',
  'unidades_por_caixa',
  'perda_kg',
  'peso_liq_kg',
  'peso_bruto',
  'tara',
  'perda',
  'peso',
  'quantidade_carrinhos',
  'quantidade_containers',
  'tubos_por_carrinho',
  'tubos_por_container',
  'quantidade_tubos',
])
const DATE_FIELDS = new Set(['data_producao', 'data_registro', 'entrada', 'data'])

function valorInicial(log: StockOperationLogRow) {
  return Object.fromEntries(
    (EDITABLE_FIELDS[log.entidade] ?? []).map(({ key }) => {
      const valor = log.detalhes[key] ??
        ([
          'quantidade_carrinhos',
          'quantidade_containers',
          'tubos_por_carrinho',
          'tubos_por_container',
          'quantidade_tubos',
        ].includes(key)
          ? 0
          : undefined)
      return [
        key,
        valor === null || valor === undefined
          ? ''
          : typeof valor === 'object'
            ? JSON.stringify(valor, null, 2)
            : String(valor),
      ]
    }),
  )
}

function valorDetalhe(valor: unknown) {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (Array.isArray(valor)) return valor.join(', ')
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

function EditorCorrecao({
  log,
  accessToken,
  onCancel,
  onSaved,
}: {
  log: StockOperationLogRow
  accessToken: string
  onCancel: () => void
  onSaved: () => void
}) {
  const fields = EDITABLE_FIELDS[log.entidade] ?? []
  const [values, setValues] = React.useState(() => valorInicial(log))
  const [saving, setSaving] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const changes: Record<string, unknown> = {}
    try {
      for (const { key } of fields) {
        const value = values[key] ?? ''
        if (NUMBER_FIELDS.has(key)) {
          changes[key] = Number(value.replace(',', '.'))
        } else if (key === 'codigos') {
          changes[key] = JSON.parse(value)
        } else if (key === 'validade' && value === '') {
          changes[key] = null
        } else {
          changes[key] = value
        }
      }
    } catch {
      toast.error('O campo de códigos precisa conter um JSON válido.')
      return
    }

    setSaving(true)
    try {
      await correctDeveloperStockRecord({
        data: {
          accessToken,
          logId: log.id,
          changes,
          motivo: 'Correção administrativa pelo histórico Dev',
        },
      })
      toast.success('Registro corrigido no banco e correção adicionada ao histórico.')
      onSaved()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível corrigir este registro.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-border pt-4">
      <p className="text-xs text-warning">
        O evento original será preservado. A alteração atualiza o registro do estoque e cria um novo evento vinculado.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map(({ key, label }) => (
          <Field key={key} label={label} htmlFor={`edit-log-${log.id}-${key}`}>
            {key === 'tipo' ? (
              <SelectInput
                id={`edit-log-${log.id}-${key}`}
                value={values[key] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [key]: event.target.value }))
                }
                options={[
                  { value: 'ROTULO', label: 'Rótulo' },
                  { value: 'CAPA', label: 'Capa' },
                ]}
              />
            ) : key === 'codigos' ? (
              <textarea
                id={`edit-log-${log.id}-${key}`}
                value={values[key] ?? '{}'}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [key]: event.target.value }))
                }
                rows={4}
                required
                className="w-full rounded-md border border-border bg-field px-3 py-2 font-mono text-xs"
              />
            ) : (
              <TextInput
                id={`edit-log-${log.id}-${key}`}
                type={DATE_FIELDS.has(key) ? 'date' : NUMBER_FIELDS.has(key) ? 'number' : 'text'}
                step={key === 'perda_kg' || key === 'peso_liq_kg' || key === 'peso_bruto' || key === 'tara' || key === 'perda' ? '0.001' : undefined}
                min={NUMBER_FIELDS.has(key) ? 0 : undefined}
                value={values[key] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [key]: event.target.value }))
                }
                required={key !== 'validade'}
              />
            )}
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <PrimaryButton type="submit" size="md" disabled={saving}>
          <Save className="size-4" /> {saving ? 'Salvando...' : 'Salvar correção'}
        </PrimaryButton>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-accent"
        >
          <X className="size-4" /> Cancelar
        </button>
      </div>
    </form>
  )
}

export function DeveloperStockLogs({ accessToken }: { accessToken: string }) {
  const [logs, setLogs] = React.useState<StockOperationLogRow[]>([])
  const [temMais, setTemMais] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [refresh, setRefresh] = React.useState(0)
  const [selected, setSelected] = React.useState<number | null>(null)
  const [busca, setBusca] = React.useState('')
  const [entidade, setEntidade] = React.useState('')
  const [acao, setAcao] = React.useState<'' | 'ENTRADA' | 'SAÍDA' | 'ALTERAÇÃO'>('')
  const [operador, setOperador] = React.useState('')
  const [de, setDe] = React.useState('')
  const [ate, setAte] = React.useState('')
  const [filters, setFilters] = React.useState({ busca, entidade, acao, operador, de, ate })
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const requisicaoAtual = React.useRef(0)

  React.useEffect(() => {
    timer.current = setTimeout(
      () => setFilters({ busca, entidade, acao, operador, de, ate }),
      250,
    )
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [busca, entidade, acao, operador, de, ate])

  const carregar = React.useCallback(
    async (inicio: number, anexar = false) => {
      const requisicao = ++requisicaoAtual.current
      setLoading(true)
      try {
        const result = await listDeveloperStockLogs({
          data: {
            accessToken,
            ...filters,
            inicio,
            limite: 50,
          },
        })
        if (requisicao === requisicaoAtual.current) {
          setLogs((current) =>
            anexar ? [...current, ...result.registros] : result.registros,
          )
          setTemMais(result.temMais)
        }
      } catch {
        if (requisicao === requisicaoAtual.current) {
          toast.error('Não foi possível carregar o log geral no modo Dev.')
        }
      } finally {
        if (requisicao === requisicaoAtual.current) setLoading(false)
      }
    },
    [accessToken, filters],
  )

  React.useEffect(() => {
    void carregar(0)
  }, [carregar, refresh])

  function atualizar() {
    setRefresh((value) => value + 1)
  }

  return (
    <Panel
      title="Log geral do sistema"
      description="Histórico completo de entradas, saídas, ajustes e correções em todas as áreas."
      action={
        <button
          type="button"
          onClick={atualizar}
          aria-label="Atualizar log geral"
          className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent"
        >
          <RefreshCw className="size-4" />
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <TextInput
          aria-label="Buscar no log"
          placeholder="Buscar código, registro ou texto"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
        />
        <SelectInput
          aria-label="Filtrar entidade"
          value={entidade}
          onChange={(event) => setEntidade(event.target.value)}
          options={[
            { value: '', label: 'Todas as áreas e registros' },
            'Rolo de insumo',
            'Rolo',
            'Lote de tubetes',
            'Produção de tubos',
            'Resíduo',
          ]}
        />
        <SelectInput
          aria-label="Filtrar ação"
          value={acao}
          onChange={(event) => setAcao(event.target.value)}
          options={[
            { value: '', label: 'Todas as ações' },
            { value: 'ENTRADA', label: 'Entrada' },
            { value: 'SAÍDA', label: 'Saída' },
            { value: 'ALTERAÇÃO', label: 'Alteração / correção' },
          ]}
        />
        <TextInput
          aria-label="Filtrar operador"
          placeholder="Operador / responsável"
          value={operador}
          onChange={(event) => setOperador(event.target.value)}
        />
        <TextInput
          aria-label="Filtrar desde"
          title="Data inicial"
          type="date"
          value={de}
          onChange={(event) => setDe(event.target.value)}
        />
        <TextInput
          aria-label="Filtrar até"
          title="Data final"
          type="date"
          value={ate}
          onChange={(event) => setAte(event.target.value)}
        />
      </div>

      <div className="scroll-area mt-4 max-h-[55rem] space-y-3 overflow-y-auto pr-1">
        {loading && logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando todos os registros...</p>
        ) : logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</p>
        ) : (
          logs.map((log) => (
            <article key={log.id} className="rounded-lg border border-border bg-background/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {log.acao} · {log.entidade} · <Mono>{log.registro_id}</Mono>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(log.ocorrido_em))}
                    {' · '}
                    {log.operador}
                    {log.ator_email ? ` · ${log.ator_email}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Quantidade: <Mono>{log.quantidade.toLocaleString('pt-BR')}</Mono>
                    {log.codigos.length > 0 && <> · Códigos: <Mono>{log.codigos.join(', ')}</Mono></>}
                    {log.corrige_log_id !== null && <> · Corrige log <Mono>#{log.corrige_log_id}</Mono></>}
                  </p>
                </div>
                {EDITABLE_FIELDS[log.entidade] &&
                  (log.acao !== 'SAÍDA' ||
                    log.entidade === 'Rolo' ||
                    log.entidade === 'Rolo de insumo') && (
                  <button
                    type="button"
                    onClick={() => setSelected((current) => current === log.id ? null : log.id)}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs hover:bg-accent"
                  >
                    <Pencil className="size-3.5" /> Corrigir registro
                  </button>
                )}
              </div>
              <details className="mt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Ver todos os detalhes do evento</summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {Object.entries(log.detalhes).map(([key, value]) => (
                    <React.Fragment key={key}>
                      <dt className="capitalize">{key.replaceAll('_', ' ')}</dt>
                      <dd className="break-all text-foreground">{valorDetalhe(value)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </details>
              {selected === log.id && (
                <EditorCorrecao
                  key={`${log.id}-${log.ocorrido_em}`}
                  log={log}
                  accessToken={accessToken}
                  onCancel={() => setSelected(null)}
                  onSaved={() => {
                    setSelected(null)
                    atualizar()
                  }}
                />
              )}
            </article>
          ))
        )}
      </div>
      {temMais && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void carregar(logs.length, true)}
          className="mt-3 w-full rounded-md border border-border px-3 py-2 text-xs hover:bg-accent disabled:opacity-50"
        >
          Carregar registros anteriores
        </button>
      )}
    </Panel>
  )
}
