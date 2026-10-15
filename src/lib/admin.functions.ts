import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database, RoleUsuario } from '@/lib/database.types'

const tokenInput = z.object({ accessToken: z.string().min(20) })
const areaSchema = z.enum(['tubeteira', 'rebobinadeira'])
const roleSchema = z.enum(['ADMIN', 'OPERATOR'])

function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Configuração administrativa do Supabase ausente no servidor.')
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function requireDeveloper(accessToken: string) {
  const client = createAdminClient()
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user?.email) throw new Error('Sessão inválida.')

  const { data: developer, error: developerError } = await client
    .from('developer_accounts')
    .select('email')
    .eq('email', data.user.email.toLowerCase())
    .maybeSingle()
  if (developerError || !developer) throw new Error('Acesso de desenvolvedor negado.')

  return { client, user: data.user }
}

export const listDeveloperData = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const [
      usersResult,
      rolesResult,
      tubetesResult,
      insumosResult,
      developerAccountsResult,
      catalogosResult,
    ] =
      await Promise.all([
        client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        client.from('user_roles').select('*'),
        client.from('referencias_tubetes').select('*').order('descricao'),
        client
          .from('referencias_insumos')
          .select('*')
          .order('tipo')
          .order('medida_categoria'),
        client.from('developer_accounts').select('email'),
        client.from('catalogos_operacionais').select('*').order('chave'),
      ])

    if (usersResult.error) throw new Error('Não foi possível listar as contas.')
    if (rolesResult.error || tubetesResult.error || insumosResult.error) {
      throw new Error('Não foi possível carregar as configurações.')
    }
    if (developerAccountsResult.error) {
      throw new Error('Não foi possível validar os administradores Dev.')
    }
    if (catalogosResult.error) throw new Error('Não foi possível carregar os catálogos.')

    const roles = new Map(rolesResult.data.map((entry) => [entry.user_id, entry]))
    const developerEmails = new Set(
      developerAccountsResult.data.map((entry) => entry.email),
    )
    return {
      users: usersResult.data.users.map((user) => {
        const access = roles.get(user.id)
        const developer = developerEmails.has(user.email?.toLowerCase() ?? '')
        return {
          id: user.id,
          email: user.email ?? '',
          role: (developer ? 'DEVELOPER' : access?.role ?? 'UNASSIGNED') as
            | RoleUsuario
            | 'DEVELOPER'
            | 'UNASSIGNED',
          area: access?.area ?? null,
          createdAt: user.created_at,
        }
      }),
      tubetes: tubetesResult.data,
      insumos: insumosResult.data,
      catalogos: catalogosResult.data,
    }
  })

export const saveOperationalCatalog = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      chave: z.enum(['destinos', 'espessuras', 'tubos', 'capas']),
      valores: z
        .array(z.string().trim().min(1).max(120))
        .min(1)
        .max(100)
        .refine((values) => new Set(values).size === values.length),
    }),
  )
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const { error } = await client.from('catalogos_operacionais').upsert({
      chave: data.chave,
      valores: data.valores,
    })
    if (error) throw new Error('Não foi possível atualizar o catálogo operacional.')
    return { success: true }
  })

export const createManagedUser = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      email: z.email().trim().toLowerCase(),
      password: z.string().min(8).max(128),
      role: roleSchema,
      area: areaSchema.nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    if (data.role === 'OPERATOR' && !data.area) {
      throw new Error('Operador precisa ter uma área atribuída.')
    }
    if (data.role === 'ADMIN' && data.area) {
      throw new Error('Administrador acessa todas as áreas; não selecione uma área única.')
    }

    const { data: created, error } = await client.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    })
    if (error || !created.user) throw new Error('Não foi possível criar a conta.')

    const { error: roleError } = await client.from('user_roles').insert({
      user_id: created.user.id,
      role: data.role as RoleUsuario,
      area: data.area,
    })
    if (roleError) {
      await client.auth.admin.deleteUser(created.user.id)
      throw new Error('Conta criada, mas não foi possível salvar a permissão.')
    }
    return { id: created.user.id, email: created.user.email ?? data.email }
  })

export const updateManagedUser = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      userId: z.uuid(),
      role: roleSchema,
      area: areaSchema.nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    if (data.role === 'OPERATOR' && !data.area) {
      throw new Error('Operador precisa ter uma área atribuída.')
    }
    if (data.role === 'ADMIN' && data.area) {
      throw new Error('Administrador acessa todas as áreas; não selecione uma área única.')
    }
    const { data: target, error: targetError } = await client.auth.admin.getUserById(
      data.userId,
    )
    if (targetError || !target.user) throw new Error('Conta não encontrada.')
    const targetEmail = target.user.email?.toLowerCase() ?? ''
    const { data: developer } = await client
      .from('developer_accounts')
      .select('email')
      .eq('email', targetEmail)
      .maybeSingle()
    if (developer) throw new Error('A identidade Desenvolvedora não pode ser alterada.')

    const { error } = await client.from('user_roles').upsert({
      user_id: data.userId,
      role: data.role,
      area: data.area,
    })
    if (error) throw new Error('Não foi possível atualizar as permissões.')
    return { success: true }
  })

export const deleteManagedUser = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ userId: z.uuid() }))
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const { data: target, error: targetError } = await client.auth.admin.getUserById(
      data.userId,
    )
    if (targetError || !target.user) throw new Error('Conta não encontrada.')
    const { data: developer } = await client
      .from('developer_accounts')
      .select('email')
      .eq('email', target.user.email?.toLowerCase() ?? '')
      .maybeSingle()
    if (developer) throw new Error('A identidade Desenvolvedora não pode ser removida.')

    const { error } = await client.auth.admin.deleteUser(data.userId)
    if (error) throw new Error('Não foi possível remover a conta.')
    return { success: true }
  })

export const saveTubeteReference = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      originalDescription: z.string().nullable(),
      originalMeasure: z.string().nullable(),
      descricao: z.string().trim().min(1).max(80),
      tubetesPorCaixa: z.number().int().min(1).max(100000),
      estoqueMin: z.number().int().min(0).nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const row = {
      descricao: data.descricao,
      medida: data.originalMeasure ?? data.descricao,
      cor: null,
      tubetes_por_caixa: data.tubetesPorCaixa,
      estoque_min: data.estoqueMin,
    }
    const query = data.originalDescription
      ? client
          .from('referencias_tubetes')
          .update(row)
          .eq('descricao', data.originalDescription)
          .select('*')
          .single()
      : client.from('referencias_tubetes').insert(row).select('*').single()
    const { data: saved, error } = await query
    if (error) throw new Error('Não foi possível salvar a referência de tubetes.')
    return saved
  })

export const deleteTubeteReference = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ descricao: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const { data: reference, error: referenceError } = await client
      .from('referencias_tubetes')
      .select('medida')
      .eq('descricao', data.descricao)
      .maybeSingle()
    if (referenceError || !reference) throw new Error('Referência de tubete não encontrada.')

    const { data: lots, error: lotsError } = await client
      .from('lotes_tubete')
      .select('id')
      .eq('medida', reference.medida)
      .limit(1)
    if (lotsError) throw new Error('Não foi possível conferir o estoque existente.')
    if (lots?.length) throw new Error('Não remova uma referência que ainda tenha lotes de estoque.')

    const { error } = await client
      .from('referencias_tubetes')
      .delete()
      .eq('descricao', data.descricao)
    if (error) throw new Error('Não foi possível remover a referência de tubetes.')
    return { success: true }
  })

export const saveInsumoReference = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      originalTipo: z.enum(['ROTULO', 'CAPA']).nullable(),
      originalCategoria: z.string().nullable(),
      tipo: z.enum(['ROTULO', 'CAPA']),
      medidaCategoria: z.string().trim().min(1).max(80),
      estoqueMinKg: z.number().min(0).nullable(),
      limiteCriticoKg: z.number().min(0).nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    if (
      data.originalTipo &&
      data.originalCategoria &&
      (data.originalTipo !== data.tipo || data.originalCategoria !== data.medidaCategoria)
    ) {
      const { data: rolls, error: rollsError } = await client
        .from('insumos_rolos')
        .select('id_codigo')
        .eq('tipo', data.originalTipo)
        .eq('medida_categoria', data.originalCategoria)
        .limit(1)
      if (rollsError) throw new Error('Não foi possível conferir os rolos existentes.')
      if (rolls?.length) throw new Error('Não altere o tipo/categoria enquanto houver rolos cadastrados. Crie uma categoria nova e mova os rolos primeiro.')
    }

    const row = {
      tipo: data.tipo,
      medida_categoria: data.medidaCategoria,
      estoque_min_kg: data.estoqueMinKg,
      limite_critico_kg: data.limiteCriticoKg,
    }
    const query = data.originalTipo && data.originalCategoria
      ? client
          .from('referencias_insumos')
          .update(row)
          .eq('tipo', data.originalTipo)
          .eq('medida_categoria', data.originalCategoria)
          .select('*')
          .single()
      : client.from('referencias_insumos').insert(row).select('*').single()
    const { data: saved, error } = await query
    if (error) throw new Error('Não foi possível salvar a referência de insumo.')
    return saved
  })

export const deleteInsumoReference = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      tipo: z.enum(['ROTULO', 'CAPA']),
      medidaCategoria: z.string().min(1).max(80),
    }),
  )
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const { data: rolls, error: rollsError } = await client
      .from('insumos_rolos')
      .select('id_codigo')
      .eq('tipo', data.tipo)
      .eq('medida_categoria', data.medidaCategoria)
      .limit(1)
    if (rollsError) throw new Error('Não foi possível conferir os rolos existentes.')
    if (rolls?.length) throw new Error('Não remova uma categoria que ainda tenha rolos cadastrados.')

    const { error } = await client
      .from('referencias_insumos')
      .delete()
      .eq('tipo', data.tipo)
      .eq('medida_categoria', data.medidaCategoria)
    if (error) throw new Error('Não foi possível remover a referência de insumo.')
    return { success: true }
  })