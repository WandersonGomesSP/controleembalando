import * as React from 'react'
import { Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  createManagedUser,
  deleteInsumoReference,
  deleteManagedUser,
  deleteTubeteReference,
  listDeveloperData,
  saveInsumoReference,
  saveTubeteReference,
  updateManagedUser,
} from '@/lib/admin.functions'
import type {
  ReferenciaInsumoRow,
  ReferenciaTubeteRow,
  RoleUsuario,
  UserRoleRow,
} from '@/lib/database.types'
import { Field, Panel, PrimaryButton, SelectInput, TextInput } from '@/components/painel/fields'

type ManagedUser = {
  id: string
  email: string
  role: RoleUsuario | 'DEVELOPER' | 'UNASSIGNED'
  area: UserRoleRow['area']
  createdAt: string
}

type DeveloperData = {
  users: ManagedUser[]
  tubetes: ReferenciaTubeteRow[]
  insumos: ReferenciaInsumoRow[]
}

const AREAS_OPERADOR = ['tubeteira', 'rebobinadeira'] as const
const TIPOS = ['ROTULO', 'CAPA'] as const
const NOMES_AREAS = {
  tubeteira: 'Tubeteira',
  rebobinadeira: 'Rebobinadeira',
  estufa: 'Estufa',
} as const

function numeroOuNulo(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const number = Number(text.replace(',', '.'))
  return Number.isFinite(number) ? number : NaN
}

export function DeveloperPanel({ accessToken }: { accessToken: string }) {
  const [data, setData] = React.useState<DeveloperData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [message, setMessage] = React.useState('')

  async function reload() {
    setLoading(true)
    try {
      const loaded = await listDeveloperData({ data: { accessToken } })
      setData(loaded)
      setMessage('')
    } catch {
      setMessage('Não foi possível carregar os dados. Confira a configuração server-side do Supabase.')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    let active = true
    listDeveloperData({ data: { accessToken } })
      .then((loaded) => {
        if (!active) return
        setData(loaded)
        setMessage('')
      })
      .catch(() => {
        if (active) {
          setMessage('Não foi possível carregar os dados. Confira a configuração server-side do Supabase.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [accessToken])

  async function submitNewUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const role = String(values.get('role')) as RoleUsuario
    const area = role === 'ADMIN' ? null : String(values.get('area'))
    try {
      await createManagedUser({
        data: {
          accessToken,
          email: String(values.get('email')),
          password: String(values.get('password')),
          role,
          area: area as UserRoleRow['area'],
        },
      })
      form.reset()
      toast.success('Conta criada e permissão aplicada.')
      await reload()
    } catch {
      toast.error('Não foi possível criar a conta. Confira se o e-mail já existe e se a chave administrativa está configurada no servidor.')
    }
  }

  async function changeUser(user: ManagedUser, role: RoleUsuario, area: UserRoleRow['area']) {
    try {
      await updateManagedUser({ data: { accessToken, userId: user.id, role, area } })
      toast.success(`Permissões de ${user.email} atualizadas.`)
      await reload()
    } catch {
      toast.error('Não foi possível alterar as permissões.')
      await reload()
    }
  }

  async function removeUser(user: ManagedUser) {
    if (!window.confirm(`Remover permanentemente a conta ${user.email}?`)) return
    try {
      await deleteManagedUser({ data: { accessToken, userId: user.id } })
      toast.success('Conta removida.')
      await reload()
    } catch {
      toast.error('Não foi possível remover a conta.')
    }
  }

  async function saveTubete(
    event: React.FormEvent<HTMLFormElement>,
    original: ReferenciaTubeteRow | null,
  ) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const factor = numeroOuNulo(values.get('factor'))
    const minimum = numeroOuNulo(values.get('minimum'))
    if (factor === null || factor < 1 || Number.isNaN(factor) || (minimum !== null && (minimum < 0 || Number.isNaN(minimum)))) {
      toast.error('Confira o fator por caixa e o estoque mínimo.')
      return
    }
    try {
      await saveTubeteReference({
        data: {
          accessToken,
          originalDescription: original?.descricao ?? null,
          originalMeasure: original?.medida ?? null,
          descricao: String(values.get('description')),
          tubetesPorCaixa: factor,
          estoqueMin: minimum,
        },
      })
      toast.success('Referência de tubete atualizada.')
      await reload()
    } catch {
      toast.error('Não foi possível salvar a referência de tubete.')
    }
  }

  async function removeTubete(reference: ReferenciaTubeteRow) {
    if (!window.confirm(`Remover a referência ${reference.descricao}?`)) return
    try {
      await deleteTubeteReference({ data: { accessToken, descricao: reference.descricao } })
      toast.success('Referência removida.')
      await reload()
    } catch {
      toast.error('Não foi possível remover a referência.')
    }
  }

  async function removeInsumo(reference: ReferenciaInsumoRow) {
    if (!window.confirm(`Remover a categoria ${reference.medida_categoria}?`)) return
    try {
      await deleteInsumoReference({
        data: {
          accessToken,
          tipo: reference.tipo,
          medidaCategoria: reference.medida_categoria,
        },
      })
      toast.success('Categoria removida.')
      await reload()
    } catch {
      toast.error('Não foi possível remover a categoria.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-warning">Modo Desenvolvedora</p>
          <h2 className="mt-1 text-2xl font-semibold">Configuração do sistema</h2>
          <p className="mt-1 text-sm text-muted-foreground">Alterações salvas aqui refletem nos seletores e indicadores do painel.</p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-accent"
        >
          <Save className="size-4" /> Atualizar dados
        </button>
      </header>

      {message && <p role="alert" className="text-sm text-destructive-foreground">{message}</p>}
      {loading && <p className="text-sm text-muted-foreground">Carregando configurações...</p>}

      {!loading && data && (
        <>
          <Panel title="Usuários e permissões" description="Dev controla usuários; Admin acessa áreas operacionais; Operador fica restrito à sua área.">
            <form onSubmit={submitNewUser} className="grid gap-4 border-b border-border pb-5 sm:grid-cols-2 xl:grid-cols-5">
              <Field label="E-mail" htmlFor="dev-user-email">
                <TextInput id="dev-user-email" name="email" type="email" autoComplete="off" required />
              </Field>
              <Field label="Senha inicial" htmlFor="dev-user-password">
                <TextInput id="dev-user-password" name="password" type="password" minLength={8} autoComplete="new-password" required />
              </Field>
              <Field label="Perfil" htmlFor="dev-user-role">
                <SelectInput
                  id="dev-user-role"
                  name="role"
                  options={[
                    { value: 'OPERATOR', label: 'Operador' },
                    { value: 'ADMIN', label: 'Administrador' },
                  ]}
                />
              </Field>
              <Field label="Área do operador" htmlFor="dev-user-area" hint="Ignorada para Admin.">
                <SelectInput
                  id="dev-user-area"
                  name="area"
                  options={AREAS_OPERADOR.map((area) => ({ value: area, label: NOMES_AREAS[area] }))}
                />
              </Field>
              <PrimaryButton type="submit" size="md" className="self-end rounded-md shadow-none">
                <Plus className="size-4" /> Criar conta
              </PrimaryButton>
            </form>

            <div className="scroll-area mt-4 overflow-x-auto">
              <table className="w-full min-w-[42rem] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-3 pr-3">Conta</th><th className="py-3 pr-3">Perfil</th><th className="py-3 pr-3">Área</th><th className="py-3 text-right">Ação</th></tr></thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.id} className="border-b border-border/70 last:border-0">
                      <td className="py-3 pr-3"><span className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" />{user.email}</span></td>
                      <td className="py-3 pr-3">
                        {user.role === 'DEVELOPER' ? (
                          <span className="inline-flex items-center gap-1 text-warning"><ShieldCheck className="size-4" />Desenvolvedor</span>
                        ) : user.role === 'UNASSIGNED' ? (
                          'Sem perfil'
                        ) : user.role === 'ADMIN' ? (
                          'Administrador'
                        ) : (
                          'Operador'
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        {user.role === 'ADMIN'
                          ? 'Todas'
                          : user.role === 'OPERATOR' ? (
                          <select
                            aria-label={`Área de ${user.email}`}
                            value={user.area ?? AREAS_OPERADOR[0]}
                            onChange={(event) =>
                              void changeUser(user, 'OPERATOR', event.target.value as UserRoleRow['area'])
                            }
                            className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                          >
                            {AREAS_OPERADOR.map((area) => <option key={area} value={area}>{NOMES_AREAS[area]}</option>)}
                          </select>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {user.role !== 'DEVELOPER' && (
                          <div className="flex justify-end gap-2">
                            <select
                              aria-label={`Perfil de ${user.email}`}
                              defaultValue={user.role === 'ADMIN' ? 'ADMIN' : 'OPERATOR'}
                              onChange={(event) => {
                                const role = event.target.value as RoleUsuario
                                void changeUser(user, role, role === 'ADMIN' ? null : user.area ?? AREAS_OPERADOR[0])
                              }}
                              className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                            >
                              <option value="OPERATOR">Operador</option>
                              <option value="ADMIN">Administrador</option>
                            </select>
                            <button type="button" onClick={() => void removeUser(user)} aria-label={`Remover ${user.email}`} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Fatores e mínimos de tubetes" description="O fator alimenta a entrada, o cálculo total e o resumo operacional.">
            <div className="scroll-area overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-3 pr-3">Medida</th><th className="py-3 pr-3">Tubetes / caixa</th><th className="py-3 pr-3">Estoque mínimo</th><th className="py-3 text-right">Salvar</th><th /></tr></thead>
                <tbody>
                  {data.tubetes.map((reference) => (
                    <tr key={reference.descricao} className="border-b border-border/70 last:border-0">
                      <td colSpan={5} className="py-2">
                        <form onSubmit={(event) => void saveTubete(event, reference)} className="grid grid-cols-[minmax(8rem,1fr)_8rem_8rem_6rem_2.5rem] items-center gap-2">
                          <TextInput aria-label="Medida" name="description" defaultValue={reference.descricao} className="h-9" />
                          <TextInput aria-label="Tubetes por caixa" name="factor" type="number" min={1} defaultValue={reference.tubetes_por_caixa} className="h-9 font-mono" />
                          <TextInput aria-label="Estoque mínimo" name="minimum" type="number" min={0} placeholder="Sem mínimo" defaultValue={reference.estoque_min ?? ''} className="h-9 font-mono" />
                          <button type="submit" className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-foreground px-2 text-xs font-medium text-background"><Save className="size-3.5" /> Salvar</button>
                          <button type="button" onClick={() => void removeTubete(reference)} aria-label={`Remover ${reference.descricao}`} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  <tr><td colSpan={5} className="pt-4"><form onSubmit={(event) => void saveTubete(event, null)} className="grid grid-cols-[minmax(8rem,1fr)_8rem_8rem_6rem_2.5rem] items-center gap-2"><TextInput aria-label="Nova medida" name="description" placeholder="Nova medida" required className="h-9" /><TextInput aria-label="Tubetes por caixa" name="factor" type="number" min={1} placeholder="Fator" required className="h-9 font-mono" /><TextInput aria-label="Estoque mínimo" name="minimum" type="number" min={0} placeholder="Sem mínimo" className="h-9 font-mono" /><button type="submit" className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-foreground px-2 text-xs font-medium text-background"><Plus className="size-3.5" /> Novo</button><span /></form></td></tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Limites de rótulos e capas" description="Defina o nível mínimo e o limiar de alerta crítico por categoria.">
            <div className="scroll-area overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-3 pr-3">Tipo</th><th className="py-3 pr-3">Categoria</th><th className="py-3 pr-3">Mínimo KG</th><th className="py-3 pr-3">Crítico KG</th><th className="py-3 text-right">Salvar</th><th /></tr></thead>
                <tbody>
                  {data.insumos.map((reference) => (
                    <InsumoReferenceRow key={`${reference.tipo}-${reference.medida_categoria}`} reference={reference} accessToken={accessToken} onSaved={reload} onDelete={removeInsumo} />
                  ))}
                  <InsumoReferenceRow reference={null} accessToken={accessToken} onSaved={reload} onDelete={removeInsumo} />
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}

function InsumoReferenceRow({
  reference,
  accessToken,
  onSaved,
  onDelete,
}: {
  reference: ReferenciaInsumoRow | null
  accessToken: string
  onSaved: () => Promise<void>
  onDelete: (reference: ReferenciaInsumoRow) => Promise<void>
}) {
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const tipo = String(values.get('type')) as ReferenciaInsumoRow['tipo']
    const category = String(values.get('category'))
    const minimum = numeroOuNulo(values.get('minimum'))
    const critical = numeroOuNulo(values.get('critical'))
    if ((minimum !== null && (minimum < 0 || Number.isNaN(minimum))) || (critical !== null && (critical < 0 || Number.isNaN(critical)))) {
      toast.error('Limites devem ser números positivos.')
      return
    }
    try {
      await saveInsumoReference({
        data: {
          accessToken,
          originalTipo: reference?.tipo ?? null,
          originalCategoria: reference?.medida_categoria ?? null,
          tipo,
          medidaCategoria: category,
          estoqueMinKg: minimum,
          limiteCriticoKg: critical,
        },
      })
      toast.success('Limites de insumo salvos.')
      await onSaved()
    } catch {
      toast.error('Não foi possível salvar os limites de insumo.')
    }
  }

  return (
    <tr className="border-b border-border/70 last:border-0">
      <td colSpan={6} className="py-2">
        <form onSubmit={submit} className="grid grid-cols-[8rem_minmax(9rem,1fr)_8rem_8rem_6rem_2.5rem] items-center gap-2">
          <SelectInput aria-label="Tipo" name="type" options={[...TIPOS]} defaultValue={reference?.tipo ?? 'ROTULO'} className="h-9" />
          <TextInput aria-label="Categoria" name="category" defaultValue={reference?.medida_categoria ?? ''} placeholder="Nova categoria" required className="h-9" />
          <TextInput aria-label="Mínimo em kg" name="minimum" type="number" min={0} step="0.001" defaultValue={reference?.estoque_min_kg ?? ''} placeholder="Sem mínimo" className="h-9 font-mono" />
          <TextInput aria-label="Crítico em kg" name="critical" type="number" min={0} step="0.001" defaultValue={reference?.limite_critico_kg ?? ''} placeholder="Sem alerta" className="h-9 font-mono" />
          <button type="submit" className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-foreground px-2 text-xs font-medium text-background"><Save className="size-3.5" /> Salvar</button>
          {reference ? <button type="button" onClick={() => void onDelete(reference)} aria-label={`Remover ${reference.medida_categoria}`} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button> : <span />}
        </form>
      </td>
    </tr>
  )
}