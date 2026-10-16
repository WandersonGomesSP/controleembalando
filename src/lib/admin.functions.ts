import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database, RoleUsuario } from '@/lib/database.types'
import { syncGoogleSheets } from '@/lib/google-sheets-sync.server'

const tokenInput = z.object({ accessToken: z.string().min(20) })
const areaSchema = z.enum(['tubeteira', 'rebobinadeira'])
const roleSchema = z.enum(['ADMIN', 'OPERATOR'])
const isoDate = z.iso.date()

const stockCorrectionSchemas = {
  'Lote de tubetes': z
    .object({
      medida: z.string().trim().min(1).max(80),
      cor: z.string().max(80),
      data_producao: isoDate,
      caixas: z.number().int().min(1),
      unidades_por_caixa: z.number().int().min(1),
      perda_kg: z.number().min(0),
      operador: z.string().trim().min(1).max(120),
    })
    .strict(),
  'Rolo de insumo': z
    .object({
      id_codigo: z.string().trim().min(1).max(80),
      tipo: z.enum(['ROTULO', 'CAPA']),
      medida_categoria: z.string().trim().min(1).max(80),
      peso_liq_kg: z.number().positive(),
      validade: z.string().regex(/^\d{2}\/\d{2}$/).nullable(),
      data_registro: isoDate,
    })
    .strict(),
  Rolo: z
    .object({
      id: z.string().trim().min(1).max(80),
      medida: z.string().trim().min(1).max(80),
      peso_bruto: z.number().positive(),
      tara: z.number().min(0),
      validade: z.string().min(1).max(20),
      entrada: isoDate,
    })
    .strict()
    .refine((registro) => registro.tara < registro.peso_bruto, {
      message: 'A tara deve ser menor que o peso bruto.',
    }),
  'Produção de tubos': z
    .object({
      destino: z.string().trim().min(1).max(120),
      data: isoDate,
      espessura: z.string().trim().min(1).max(80),
      tubo: z.string().trim().min(1).max(80),
      capa: z.string().trim().min(1).max(80),
      codigos: z.record(z.string(), z.array(z.string().max(120))),
      operador: z.string().trim().min(1).max(120),
      perda: z.number().min(0),
      container: z.string().max(120),
      carrinho: z.string().max(120),
      quantidade_carrinhos: z.number().int().min(0).optional(),
      quantidade_containers: z.number().int().min(0).optional(),
      tubos_por_carrinho: z.number().int().min(0).optional(),
      tubos_por_container: z.number().int().min(0).optional(),
      quantidade_tubos: z.number().int().min(0).optional(),
    })
    .strict(),
  Resíduo: z
    .object({
      data: isoDate,
      origem: z.string().trim().min(1).max(160),
      peso: z.number().positive(),
      operador: z.string().trim().min(1).max(120),
    })
    .strict(),
} as const

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

async function requireAdminOrDeveloper(accessToken: string) {
  const client = createAdminClient()
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user?.email) throw new Error('Sessão inválida.')

  const [roleResult, developerResult] = await Promise.all([
    client
      .from('user_roles')
      .select('role')
      .eq('user_id', data.user.id)
      .maybeSingle(),
    client
      .from('developer_accounts')
      .select('email')
      .eq('email', data.user.email.toLowerCase())
      .maybeSingle(),
  ])
  if (roleResult.error || developerResult.error) {
    throw new Error('Não foi possível validar a permissão administrativa.')
  }
  if (roleResult.data?.role !== 'ADMIN' && !developerResult.data) {
    throw new Error('Apenas administradores podem alterar a planilha.')
  }

  return { client, user: data.user }
}

async function loadAdminSummarySnapshot(
  client: ReturnType<typeof createAdminClient>,
  entidade: 'Rolo de insumo' | 'Produção de tubos' | 'Lote de tubetes',
  registroId: string,
  actorEmail: string,
) {
  if (entidade === 'Rolo de insumo') {
    const { data, error } = await client
      .from('insumos_rolos')
      .select('*')
      .eq('id_codigo', registroId)
      .maybeSingle()
    if (error) throw new Error('Não foi possível carregar o rolo para correção.')
    if (!data) throw new Error('O rolo não existe mais no estoque.')
    return {
      details: Object.fromEntries(Object.entries(data)),
      codes: [data.id_codigo],
      quantity: 1,
      operator: actorEmail,
    }
  }

  if (entidade === 'Produção de tubos') {
    if (!/^\d+$/.test(registroId)) throw new Error('Identificador de produção inválido.')
    const { data, error } = await client
      .from('producao_tubos')
      .select('*')
      .eq('id', Number(registroId))
      .maybeSingle()
    if (error) throw new Error('Não foi possível carregar a produção para correção.')
    if (!data) throw new Error('O registro de produção não existe mais.')
    const codes = Object.values(data.codigos).flat()
    return {
      details: Object.fromEntries(Object.entries(data)),
      codes,
      quantity: data.quantidade_tubos,
      operator: data.operador,
    }
  }

  if (!/^\d+$/.test(registroId)) throw new Error('Identificador de tubete inválido.')
  const { data, error } = await client
    .from('lotes_tubete')
    .select('*')
    .eq('id', Number(registroId))
    .maybeSingle()
  if (error) throw new Error('Não foi possível carregar o lote de tubetes para correção.')
  if (!data) throw new Error('O lote de tubetes não existe mais.')
  return {
    details: Object.fromEntries(Object.entries(data)),
    codes: [],
    quantity: data.caixas,
    operator: data.operador,
  }
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJson(entry)]),
    )
  }
  return value
}

export const correctAdminSummaryRecord = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      entidade: z.enum(['Rolo de insumo', 'Produção de tubos', 'Lote de tubetes']),
      registroId: z.string().trim().min(1).max(120),
      expected: z.record(z.string(), z.unknown()),
      changes: z.record(z.string(), z.unknown()),
      motivo: z.string().trim().min(3).max(500),
    }),
  )
  .handler(async ({ data }) => {
    const { client, user } = await requireAdminOrDeveloper(data.accessToken)
    const changes = stockCorrectionSchemas[data.entidade].safeParse(data.changes)
    if (!changes.success) {
      throw new Error('Confira os campos e valores informados na planilha.')
    }

    const snapshot = await loadAdminSummarySnapshot(
      client,
      data.entidade,
      data.registroId,
      user.email,
    )
    const expectedKeys = Object.keys(data.expected).sort()
    const changeKeys = Object.keys(changes.data).sort()
    if (JSON.stringify(expectedKeys) !== JSON.stringify(changeKeys)) {
      throw new Error('Atualize a planilha antes de salvar a correção.')
    }
    const currentValues = Object.fromEntries(
      expectedKeys.map((key) => [key, snapshot.details[key]]),
    )
    if (
      JSON.stringify(canonicalJson(currentValues)) !==
      JSON.stringify(canonicalJson(data.expected))
    ) {
      throw new Error('O registro mudou durante a edição. Atualize a planilha e tente novamente.')
    }

    const { data: original, error: logError } = await client
      .from('stock_operation_logs')
      .select('id')
      .eq('entidade', data.entidade)
      .eq('registro_id', data.registroId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (logError) throw new Error('Não foi possível localizar o histórico do registro.')
    let logId = original?.id

    if (!logId) {
      const { data: baseline, error: insertError } = await client
        .from('stock_operation_logs')
        .insert({
          acao: 'ALTERAÇÃO',
          entidade: data.entidade,
          registro_id: data.registroId,
          quantidade: snapshot.quantity,
          codigos: snapshot.codes,
          operador: snapshot.operator,
          ator_email: user.email,
          ator_id: user.id,
          detalhes: snapshot.details,
        })
        .select('id')
        .single()
      if (insertError || !baseline) {
        throw new Error('Não foi possível registrar o estado inicial para auditoria.')
      }
      logId = baseline.id
    }

    const { error } = await client.rpc('correct_stock_record', {
      p_log_id: logId,
      p_changes: changes.data,
      p_motivo: data.motivo,
      p_actor_email: user.email,
      p_actor_id: user.id,
    })
    if (error?.message.includes('mais recente')) {
      throw new Error('O registro mudou durante a edição. Atualize a planilha e tente novamente.')
    }
    if (error) throw new Error('Não foi possível salvar a correção auditada.')
    return { success: true }
  })

export const deleteAdminSummaryRecord = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      entidade: z.enum(['Rolo de insumo', 'Produção de tubos', 'Lote de tubetes']),
      registroId: z.string().trim().min(1).max(120),
      motivo: z.string().trim().min(3).max(500),
    }),
  )
  .handler(async ({ data }) => {
    const { client, user } = await requireAdminOrDeveloper(data.accessToken)
    if (data.entidade !== 'Rolo de insumo' && !/^\d+$/.test(data.registroId)) {
      throw new Error('Identificador do registro inválido.')
    }
    const { error } = await client.rpc('delete_admin_summary_record', {
      p_entidade: data.entidade,
      p_registro_id: data.registroId,
      p_motivo: data.motivo,
      p_actor_email: user.email,
      p_actor_id: user.id,
    })
    if (error?.message.includes('não existe')) {
      throw new Error('O registro já não existe mais.')
    }
    if (error) throw new Error('Não foi possível excluir o registro com auditoria.')
    return { success: true }
  })

export const listDeveloperData = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const { client, user } = await requireDeveloper(data.accessToken)
    const [
      usersResult,
      rolesResult,
      tubetesResult,
      insumosResult,
      developerAccountsResult,
      catalogosResult,
      operadoresResult,
      capacidadesResult,
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
        client.from('operadores_operacionais').select('nome').order('nome'),
        client.from('capacidades_producao').select('*').order('medida'),
      ])

    if (usersResult.error) throw new Error('Não foi possível listar as contas.')
    if (rolesResult.error || tubetesResult.error || insumosResult.error) {
      throw new Error('Não foi possível carregar as configurações.')
    }
    if (developerAccountsResult.error) {
      throw new Error('Não foi possível validar os administradores Dev.')
    }
    if (catalogosResult.error) throw new Error('Não foi possível carregar os catálogos.')
    if (operadoresResult.error || capacidadesResult.error) {
      throw new Error('Não foi possível carregar operadores e capacidades de produção.')
    }

    const roles = new Map(rolesResult.data.map((entry) => [entry.user_id, entry]))
    const developerEmails = new Set(
      developerAccountsResult.data.map((entry) => entry.email),
    )
    return {
      googleSheetsPermissionsConfirmed:
        user.app_metadata.google_sheets_permissions_confirmed === true,
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
      operadores: operadoresResult.data,
      capacidades: capacidadesResult.data,
    }
  })

export const saveOperationalOperator = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ nome: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const { error } = await client
      .from('operadores_operacionais')
      .upsert({ nome: data.nome })
    if (error) throw new Error('Não foi possível salvar o operador.')
    return { success: true }
  })

export const deleteOperationalOperator = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ nome: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const { error } = await client
      .from('operadores_operacionais')
      .delete()
      .eq('nome', data.nome)
    if (error) throw new Error('Não foi possível remover o operador.')
    return { success: true }
  })

export const saveProductionCapacity = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      medida: z.enum(['12mm', '18mm', '19mm', '25mm', '38mm', '45mm', '48mm', '50mm', '70mm']),
      tubosPorCarrinho: z.number().int().min(0).max(100000),
      tubosPorContainer: z.number().int().min(0).max(100000),
    }),
  )
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const { error } = await client.from('capacidades_producao').upsert({
      medida: data.medida,
      tubos_por_carrinho: data.tubosPorCarrinho,
      tubos_por_container: data.tubosPorContainer,
    })
    if (error) throw new Error('Não foi possível salvar as capacidades desta medida.')
    return { success: true }
  })

export const synchronizeGoogleSheetsNow = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    await requireDeveloper(data.accessToken)
    return syncGoogleSheets()
  })

export const confirmGoogleSheetsPermissions = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const { client, user } = await requireDeveloper(data.accessToken)
    const { error } = await client.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        google_sheets_permissions_confirmed: true,
      },
    })
    if (error) throw new Error('Não foi possível salvar a confirmação das permissões.')
    return { success: true }
  })

export const listDeveloperStockLogs = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      busca: z.string().max(120).default(''),
      entidade: z.string().max(80).default(''),
      acao: z.enum(['', 'ENTRADA', 'SAÍDA', 'ALTERAÇÃO']).default(''),
      operador: z.string().max(120).default(''),
      de: z.union([z.literal(''), z.iso.date()]).default(''),
      ate: z.union([z.literal(''), z.iso.date()]).default(''),
      inicio: z.number().int().min(0).default(0),
      limite: z.number().int().min(1).max(100).default(50),
    }),
  )
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    let query = client
      .from('stock_operation_logs')
      .select('*')
      .order('ocorrido_em', { ascending: false })
      .order('id', { ascending: false })
    if (data.entidade) query = query.eq('entidade', data.entidade)
    if (data.acao) query = query.eq('acao', data.acao)
    if (data.operador) query = query.ilike('operador', `%${data.operador}%`)
    if (data.de) {
      query = query.gte(
        'ocorrido_em',
        new Date(`${data.de}T00:00:00-03:00`).toISOString(),
      )
    }
    if (data.ate) {
      const exclusiveEnd = new Date(`${data.ate}T00:00:00-03:00`)
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
      query = query.lt('ocorrido_em', exclusiveEnd.toISOString())
    }
    if (data.busca.trim()) {
      const termoSeguro = data.busca.trim().replace(/[^\p{L}\p{N}._@ -]/gu, ' ')
      const codigo = /^[a-zA-Z0-9._-]+$/.test(termoSeguro)
        ? `,codigos.cs.{${termoSeguro}}`
        : ''
      query = query.or(
        `registro_id.ilike.%${termoSeguro}%,entidade.ilike.%${termoSeguro}%,operador.ilike.%${termoSeguro}%,ator_email.ilike.%${termoSeguro}${codigo}`,
      )
    }
    const { data: logs, error } = await query.range(
      data.inicio,
      data.inicio + data.limite,
    )
    if (error) throw new Error('Não foi possível consultar o histórico completo.')
    const registros = logs ?? []
    return {
      registros: registros.slice(0, data.limite),
      temMais: registros.length > data.limite,
    }
  })

export const correctDeveloperStockRecord = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      logId: z.number().int().positive(),
      changes: z.record(z.string(), z.unknown()),
      motivo: z.string().trim().min(3).max(500),
    }),
  )
  .handler(async ({ data }) => {
    const { client, user } = await requireDeveloper(data.accessToken)
    const { data: original, error: logError } = await client
      .from('stock_operation_logs')
      .select('entidade')
      .eq('id', data.logId)
      .single()
    if (logError || !original) throw new Error('Operação original não encontrada.')
    const schema =
      stockCorrectionSchemas[original.entidade as keyof typeof stockCorrectionSchemas]
    if (!schema) throw new Error('Este tipo de operação não pode ser corrigido.')
    const changes = schema.safeParse(data.changes)
    if (!changes.success) {
      throw new Error('Confira os campos informados para corrigir o registro.')
    }

    const correctionInput = {
      p_log_id: data.logId,
      p_changes: changes.data,
      p_motivo: data.motivo,
      p_actor_email: user.email ?? '',
      p_actor_id: user.id,
    }
    const correction =
      original.entidade === 'Produção de tubos'
        ? await client.rpc('correct_production_record', correctionInput)
        : await client.rpc('correct_stock_record', correctionInput)
    const { data: corrected, error } = correction
    if (error?.message.includes('mais recente')) {
      throw new Error('Abra e corrija o evento mais recente desse registro no log.')
    }
    if (error?.message.includes('já está ativo')) {
      throw new Error('Este código já está ativo; a saída antiga não pode alterar esse registro.')
    }
    if (error) throw new Error('Não foi possível aplicar a correção no estoque.')
    return corrected
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
      originalColor: z.string().nullable(),
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
      cor: data.originalColor,
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