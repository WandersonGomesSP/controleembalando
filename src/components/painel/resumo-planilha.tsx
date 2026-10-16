import * as React from 'react'
import { Pencil, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { Field, Mono, Panel, PrimaryButton, SelectInput, TextInput } from '@/components/painel/fields'
import { correctAdminSummaryRecord } from '@/lib/admin.functions'
import type { InsumoRolo, LoteTubete, ProducaoTubo } from '@/lib/fixtures'
import { int, kg, useStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'

type Entity = 'Rolo de insumo' | 'Produção de tubos' | 'Lote de tubetes'
type RecordValues = Record<string, unknown>
type SheetRow = {
  key: string
  entity: Entity
  recordId: string
  date: string
  reference: string
  quantity: string
  operator: string
  values: RecordValues
}
type FieldDefinition = {
  key: string
  label: string
  type?: 'date' | 'number' | 'json' | 'tipo'
}

const FIELDS: Record<Entity, FieldDefinition[]> = {
  'Rolo de insumo': [
    { key: 'id_codigo', label: 'Código' },
    { key: 'tipo', label: 'Tipo', type: 'tipo' },
    { key: 'medida_categoria', label: 'Medida / categoria' },
    { key: 'peso_liq_kg', label: 'Peso líquido (kg)', type: 'number' },
    { key: 'validade', label: 'Validade (MM/AA)' },
    { key: 'data_registro', label: 'Data de registro', type: 'date' },
  ],
  'Produção de tubos': [
    { key: 'destino', label: 'Destino' },
    { key: 'data', label: 'Data', type: 'date' },
    { key: 'espessura', label: 'Espessura' },
    { key: 'tubo', label: 'Tubo' },
    { key: 'capa', label: 'Capa' },
    { key: 'codigos', label: 'Códigos (JSON)', type: 'json' },
    { key: 'operador', label: 'Operador' },
    { key: 'perda', label: 'Perda (kg)', type: 'number' },
    { key: 'container', label: 'Container' },
    { key: 'carrinho', label: 'Carrinho' },
  ],
  'Lote de tubetes': [
    { key: 'medida', label: 'Medida' },
    { key: 'cor', label: 'Cor' },
    { key: 'data_producao', label: 'Data da produção', type: 'date' },
    { key: 'caixas', label: 'Caixas', type: 'number' },
    { key: 'unidades_por_caixa', label: 'Unidades por caixa', type: 'number' },
    { key: 'perda_kg', label: 'Perda (kg)', type: 'number' },
    { key: 'operador', label: 'Operador' },
  ],
}

const MESES = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2024, index, 1)),
)

function registroRolo(rolo: InsumoRolo): SheetRow {
  const values: RecordValues = {
    id_codigo: rolo.idCodigo,
    tipo: rolo.tipo,
    medida_categoria: rolo.medidaCategoria,
    peso_liq_kg: rolo.pesoLiqKg,
    validade: rolo.validade,
    data_registro: rolo.dataRegistro,
  }
  return {
    key: `Rolo de insumo:${rolo.idCodigo}`,
    entity: 'Rolo de insumo',
    recordId: rolo.idCodigo,
    date: rolo.dataRegistro,
    reference: `${rolo.tipo === 'ROTULO' ? 'Rótulo' : 'Capa'} · ${rolo.medidaCategoria}`,
    quantity: `${kg(rolo.pesoLiqKg)} kg`,
    operator: '—',
    values,
  }
}

function registroProducao(item: ProducaoTubo): SheetRow {
  const values: RecordValues = {
    destino: item.destino,
    data: item.data,
    espessura: item.espessura,
    tubo: item.tubo,
    capa: item.capa,
    codigos: item.codigos,
    operador: item.operador,
    perda: item.perda,
    container: item.container,
    carrinho: item.carrinho,
  }
  const quantidadeCodigos = Object.values(item.codigos).reduce(
    (total, codigos) => total + codigos.length,
    0,
  )
  return {
    key: `Produção de tubos:${item.id}`,
    entity: 'Produção de tubos',
    recordId: String(item.id),
    date: item.data,
    reference: `${item.tubo} · ${item.capa} · ${item.espessura}`,
    quantity: `${int(quantidadeCodigos)} códigos · perda ${kg(item.perda)} kg`,
    operator: item.operador,
    values,
  }
}

function registroTubete(item: LoteTubete): SheetRow {
  const values: RecordValues = {
    medida: item.medida,
    cor: item.cor,
    data_producao: item.dataProducao,
    caixas: item.caixas,
    unidades_por_caixa: item.unidadesPorCaixa,
    perda_kg: item.perdaKg,
    operador: item.operador,
  }
  return {
    key: `Lote de tubetes:${item.id}`,
    entity: 'Lote de tubetes',
    recordId: String(item.id),
    date: item.dataProducao,
    reference: `${item.medida} · ${item.cor}`,
    quantity: `${int(item.caixas)} cx · ${int(item.caixas * item.unidadesPorCaixa)} un · perda ${kg(item.perdaKg)} kg`,
    operator: item.operador,
    values,
  }
}

function EditarRegistro({
  row,
  onCancel,
  onSaved,
}: {
  row: SheetRow
  onCancel: () => void
  onSaved: (changes: RecordValues) => void
}) {
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS[row.entity].map(({ key, type }) => {
        const value = row.values[key]
        return [
          key,
          value === null || value === undefined
            ? ''
            : type === 'json'
              ? JSON.stringify(value, null, 2)
              : String(value),
        ]
      }),
    ),
  )
  const [motivo, setMotivo] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let changes: RecordValues
    try {
      changes = Object.fromEntries(
        FIELDS[row.entity].map(({ key, type }) => {
          const value = values[key] ?? ''
          if (type === 'json') return [key, JSON.parse(value)]
          if (type === 'number') return [key, Number(value.replace(',', '.'))]
          if (key === 'validade' && value === '') return [key, null]
          return [key, value]
        }),
      )
    } catch {
      toast.error('Confira o JSON de códigos informado.')
      return
    }

    setSaving(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (sessionError || !accessToken) throw new Error('Sessão inválida. Entre novamente.')
      await correctAdminSummaryRecord({
        data: {
          accessToken,
          entidade: row.entity,
          registroId: row.recordId,
          expected: row.values,
          changes,
          motivo,
        },
      })
      toast.success('Registro atualizado e correção adicionada ao histórico.')
      onSaved(changes)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a alteração.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-md border border-primary/40 bg-background/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {FIELDS[row.entity].map(({ key, label, type }) => (
          <Field key={key} label={label} htmlFor={`sheet-${row.key}-${key}`}>
            {type === 'tipo' ? (
              <SelectInput
                id={`sheet-${row.key}-${key}`}
                value={values[key] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [key]: event.target.value }))
                }
                options={[
                  { value: 'ROTULO', label: 'Rótulo' },
                  { value: 'CAPA', label: 'Capa' },
                ]}
              />
            ) : type === 'json' ? (
              <textarea
                id={`sheet-${row.key}-${key}`}
                className="min-h-28 w-full rounded-lg border border-input bg-field p-3 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
                value={values[key] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [key]: event.target.value }))
                }
              />
            ) : (
              <TextInput
                id={`sheet-${row.key}-${key}`}
                type={type === 'date' ? 'date' : 'text'}
                inputMode={type === 'number' ? 'decimal' : undefined}
                value={values[key] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [key]: event.target.value }))
                }
              />
            )}
          </Field>
        ))}
        <Field label="Motivo da correção" htmlFor={`sheet-${row.key}-motivo`} className="sm:col-span-2">
          <TextInput
            id={`sheet-${row.key}-motivo`}
            value={motivo}
            maxLength={500}
            minLength={3}
            required
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Explique a correção"
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        A planilha salva no banco e registra a correção com o motivo no histórico.
      </p>
      <div className="flex flex-wrap gap-2">
        <PrimaryButton type="submit" size="md" disabled={saving}>
          <Save className="size-4" />
          {saving ? 'Salvando...' : 'Salvar correção'}
        </PrimaryButton>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm hover:bg-accent"
          onClick={onCancel}
          disabled={saving}
        >
          <X className="size-4" />
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function ResumoPlanilha() {
  const { insumosRolos, producao, tubetes, carregando } = useStore()
  const [mes, setMes] = React.useState('todos')
  const [ano, setAno] = React.useState('todos')
  const [administrador, setAdministrador] = React.useState(false)
  const [checandoPermissao, setChecandoPermissao] = React.useState(true)
  const [editando, setEditando] = React.useState<string | null>(null)
  const [alteracoesLocais, setAlteracoesLocais] = React.useState<Record<string, RecordValues>>({})

  React.useEffect(() => {
    let ativo = true
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('current_user_access')
        if (error) throw error
        if (ativo) {
          const role = data?.[0]?.role
          setAdministrador(role === 'ADMIN' || role === 'DEVELOPER')
        }
      } catch {
        if (ativo) {
          setAdministrador(false)
          toast.error('Não foi possível verificar a permissão para editar a planilha.')
        }
      } finally {
        if (ativo) setChecandoPermissao(false)
      }
    })()
    return () => {
      ativo = false
    }
  }, [])

  const linhas = React.useMemo(() => {
    const rows = [
      ...insumosRolos.map(registroRolo),
      ...producao.map(registroProducao),
      ...tubetes.map(registroTubete),
    ]
    return rows.map((row) => {
      const values = { ...row.values, ...alteracoesLocais[row.key] }
      if (row.entity === 'Rolo de insumo') {
        return {
          ...row,
          recordId: String(values.id_codigo),
          date: String(values.data_registro),
          reference: `${values.tipo === 'ROTULO' ? 'Rótulo' : 'Capa'} · ${values.medida_categoria}`,
          quantity: `${kg(Number(values.peso_liq_kg))} kg`,
          values,
        }
      }
      if (row.entity === 'Produção de tubos') {
        const codigos = values.codigos as Record<string, string[]>
        const quantidade = Object.values(codigos).reduce((total, group) => total + group.length, 0)
        return {
          ...row,
          date: String(values.data),
          reference: `${values.tubo} · ${values.capa} · ${values.espessura}`,
          quantity: `${int(quantidade)} códigos · perda ${kg(Number(values.perda))} kg`,
          operator: String(values.operador),
          values,
        }
      }
      return {
        ...row,
        date: String(values.data_producao),
        reference: `${values.medida} · ${values.cor}`,
        quantity: `${int(Number(values.caixas))} cx · ${int(Number(values.caixas) * Number(values.unidades_por_caixa))} un · perda ${kg(Number(values.perda_kg))} kg`,
        operator: String(values.operador),
        values,
      }
    })
  }, [insumosRolos, producao, tubetes, alteracoesLocais])

  const anos = [...new Set(linhas.map((row) => row.date.slice(0, 4)).filter(Boolean))].sort().reverse()
  const filtradas = linhas.filter((row) => {
    const correspondeAno = ano === 'todos' || row.date.startsWith(`${ano}-`)
    const correspondeMes = mes === 'todos' || row.date.slice(5, 7) === mes
    return correspondeAno && correspondeMes
  })
  const grupos: { title: string; entity: Entity }[] = [
    { title: 'Rolos de rótulo / capa', entity: 'Rolo de insumo' },
    { title: 'Tubos', entity: 'Produção de tubos' },
    { title: 'Tubetes produzidos', entity: 'Lote de tubetes' },
  ]

  return (
    <Panel
      title="Planilha de registros"
      description="Consulte os registros por mês e ano. Administradores podem editar; cada ajuste fica registrado no histórico."
    >
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Field label="Mês" htmlFor="sheet-month">
          <SelectInput
            id="sheet-month"
            value={mes}
            onChange={(event) => setMes(event.target.value)}
            options={[
              { value: 'todos', label: 'Todos os meses' },
              ...MESES.map((label, index) => ({
                value: String(index + 1).padStart(2, '0'),
                label: label.charAt(0).toLocaleUpperCase() + label.slice(1),
              })),
            ]}
          />
        </Field>
        <Field label="Ano" htmlFor="sheet-year">
          <SelectInput
            id="sheet-year"
            value={ano}
            onChange={(event) => setAno(event.target.value)}
            options={[
              { value: 'todos', label: 'Todos os anos' },
              ...anos.map((year) => ({ value: year, label: year })),
            ]}
          />
        </Field>
      </div>

      <div className="scroll-area max-h-[46rem] space-y-6 overflow-auto">
        {grupos.map(({ title, entity }) => {
          const rows = filtradas
            .filter((row) => row.entity === entity)
            .sort((left, right) => right.date.localeCompare(left.date))
          return (
            <section key={entity} aria-label={title}>
              <h3 className="sticky top-0 z-10 border-y border-border bg-card px-3 py-2 text-sm font-semibold">
                {title} <span className="text-muted-foreground">({int(rows.length)})</span>
              </h3>
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead className="bg-secondary/70 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="border-b border-border px-3 py-2">Data</th>
                    <th className="border-b border-border px-3 py-2">Referência</th>
                    <th className="border-b border-border px-3 py-2">Quantidade / peso</th>
                    <th className="border-b border-border px-3 py-2">Operador</th>
                    <th className="border-b border-border px-3 py-2">Registro</th>
                    {administrador && <th className="border-b border-border px-3 py-2">Ação</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <React.Fragment key={row.key}>
                      <tr className="border-b border-border/70 hover:bg-accent/30">
                        <td className="whitespace-nowrap px-3 py-2"><Mono>{row.date}</Mono></td>
                        <td className="px-3 py-2">{row.reference}</td>
                        <td className="px-3 py-2"><Mono>{row.quantity}</Mono></td>
                        <td className="px-3 py-2">{row.operator}</td>
                        <td className="px-3 py-2"><Mono>{row.recordId}</Mono></td>
                        {administrador && (
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                              onClick={() => setEditando(editando === row.key ? null : row.key)}
                              disabled={checandoPermissao}
                            >
                              <Pencil className="size-3.5" />
                              Editar
                            </button>
                          </td>
                        )}
                      </tr>
                      {editando === row.key && administrador && (
                        <tr className="border-b border-border">
                          <td colSpan={administrador ? 6 : 5} className="p-3">
                            <EditarRegistro
                              row={row}
                              onCancel={() => setEditando(null)}
                              onSaved={(changes) => {
                                setAlteracoesLocais((current) => ({
                                  ...current,
                                  [row.key]: changes,
                                }))
                                setEditando(null)
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={administrador ? 6 : 5} className="px-3 py-5 text-center text-muted-foreground">
                        {carregando ? 'Carregando registros...' : 'Nenhum registro neste período.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          )
        })}
      </div>
      {checandoPermissao && (
        <p className="mt-3 text-xs text-muted-foreground">Verificando permissão administrativa...</p>
      )}
    </Panel>
  )
}
