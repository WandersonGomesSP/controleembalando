import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/database.types'

const tokenInput = z.object({ accessToken: z.string().min(20) })
const localizacaoSchema = z.enum(['ESTOQUE', 'GALPAO_MARIO_COVAS'])

function createAdminClient(headers: Record<string, string> = {}) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Configuração administrativa do Supabase ausente no servidor.')
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers },
  })
}

async function requireVirginStockAccess(accessToken: string) {
  const baseClient = createAdminClient()
  const { data, error } = await baseClient.auth.getUser(accessToken)
  if (error || !data.user?.email) throw new Error('Sessão inválida. Entre novamente.')

  const [developerResult, roleResult] = await Promise.all([
    baseClient.from('developer_accounts').select('email')
      .eq('email', data.user.email.toLowerCase()).maybeSingle(),
    baseClient.from('user_roles').select('role, area')
      .eq('user_id', data.user.id).maybeSingle(),
  ])
  if (developerResult.error || roleResult.error) {
    throw new Error('Não foi possível validar o acesso ao estoque de BOPP virgem.')
  }
  const permitido = Boolean(developerResult.data) ||
    roleResult.data?.role === 'ADMIN' ||
    (roleResult.data?.role === 'OPERATOR' && roleResult.data.area === 'tubeteira')
  if (!permitido) throw new Error('Acesso ao estoque de BOPP virgem não autorizado.')

  const client = createAdminClient({
    'x-app-actor-id': data.user.id,
    'x-app-actor-email': data.user.email,
  })
  return { client, user: data.user }
}

export const listVirginStock = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const { client } = await requireVirginStockAccess(data.accessToken)
    const [stockResult, dashboardResult] = await Promise.all([
      client.schema('estoque_atual').from('bobinas_estoque_virgem')
        .select('*').order('medida_texto').order('codigo'),
      client.schema('estoque_atual').from('vw_estoque_minimo_virgem')
        .select('*').order('referencia'),
    ])
    if (stockResult.error) {
      throw new Error(`Não foi possível carregar as bobinas de BOPP virgem: ${stockResult.error.message}`)
    }
    if (dashboardResult.error) {
      throw new Error(`Não foi possível carregar os indicadores de estoque mínimo: ${dashboardResult.error.message}`)
    }
    return { bobinas: stockResult.data ?? [], dashboard: dashboardResult.data ?? [] }
  })

export const listVirginStockHistory = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const { client } = await requireVirginStockAccess(data.accessToken)
    const { data: rows, error } = await client.schema('estoque_atual')
      .from('bobinas_estoque_virgem_historico').select('*')
      .order('ocorrido_em', { ascending: false }).order('id', { ascending: false })
      .limit(250)
    if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`)
    return rows ?? []
  })

export const listVirginStockTrash = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const { client } = await requireVirginStockAccess(data.accessToken)
    const { data: rows, error } = await client.schema('estoque_atual')
      .from('bobinas_estoque_virgem_lixeira').select('*')
      .order('excluida_em', { ascending: false })
    if (error) throw new Error(`Não foi possível carregar a lixeira: ${error.message}`)
    return rows ?? []
  })

const virginStockChanges = z.object({
  codigo: z.string().trim().max(120).nullable(),
  medida_texto: z.string().trim().min(1).max(120),
  medida: z.number().positive().nullable(),
  peso_kg: z.number().positive().nullable(),
  metragem_m: z.number().positive().nullable(),
  nf: z.string().trim().max(120).nullable(),
  data_entrada: z.iso.date().nullable(),
  fornecedor: z.string().trim().max(160).nullable(),
  localizacao: localizacaoSchema,
  cor: z.string().trim().max(120).nullable(),
  linha: z.string().trim().max(120).nullable(),
  cliente: z.string().trim().max(160).nullable(),
  observacoes: z.string().trim().max(2000).nullable(),
}).strict()

export const updateVirginStockBobina = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    id: z.uuid(),
    changes: virginStockChanges,
  }))
  .handler(async ({ data }) => {
    const { client } = await requireVirginStockAccess(data.accessToken)
    const { data: updated, error } = await client.schema('estoque_atual')
      .from('bobinas_estoque_virgem').update(data.changes)
      .eq('id', data.id).select('*').single()
    if (error) throw new Error(`Não foi possível salvar a bobina: ${error.message}`)
    return updated
  })

export const moveVirginStockToTrash = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    ids: z.array(z.uuid()).min(1).max(500),
  }))
  .handler(async ({ data }) => {
    const { client, user } = await requireVirginStockAccess(data.accessToken)
    const schema = client.schema('estoque_atual')
    const { data: rows, error: readError } = await schema.from('bobinas_estoque_virgem')
      .select('*').in('id', data.ids)
    if (readError) throw new Error(`Não foi possível localizar as bobinas: ${readError.message}`)
    if (!rows?.length) throw new Error('Nenhuma bobina selecionada foi encontrada.')

    const idsEncontrados = rows.map((row) => row.id)
    const { error: oldTrashError } = await schema.from('bobinas_estoque_virgem_lixeira')
      .delete().in('bobina_id', idsEncontrados)
    if (oldTrashError) throw new Error(`Não foi possível preparar a lixeira: ${oldTrashError.message}`)

    const archived = rows.map((row) => ({
      bobina_id: row.id,
      categoria: row.categoria,
      codigo: row.codigo,
      medida_texto: row.medida_texto,
      dados: row,
      excluida_por: user.id,
    }))
    const { error: archiveError } = await schema.from('bobinas_estoque_virgem_lixeira')
      .insert(archived)
    if (archiveError) throw new Error(`Não foi possível arquivar as bobinas: ${archiveError.message}`)

    const { error: deleteError, count } = await schema.from('bobinas_estoque_virgem')
      .delete({ count: 'exact' }).in('id', idsEncontrados)
    if (deleteError || count !== idsEncontrados.length) {
      throw new Error(`Falha ao remover todas as bobinas do estoque: ${deleteError?.message ?? 'quantidade removida diferente da selecionada'}`)
    }
    return { removed: count }
  })

export const restoreVirginStockBobina = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ trashId: z.uuid() }))
  .handler(async ({ data }) => {
    const { client } = await requireVirginStockAccess(data.accessToken)
    const schema = client.schema('estoque_atual')
    const { data: archived, error: readError } = await schema
      .from('bobinas_estoque_virgem_lixeira').select('*')
      .eq('id', data.trashId).single()
    if (readError || !archived) throw new Error('Bobina não encontrada na lixeira.')
    const { error: restoreError } = await schema.from('bobinas_estoque_virgem')
      .insert(archived.dados)
    if (restoreError) throw new Error(`Não foi possível restaurar a bobina: ${restoreError.message}`)
    const { error: removeError } = await schema.from('bobinas_estoque_virgem_lixeira')
      .delete().eq('id', data.trashId)
    if (removeError) throw new Error(`Bobina restaurada, mas não foi possível removê-la da lixeira: ${removeError.message}`)
    return { success: true }
  })

export const permanentlyDeleteVirginStockBobina = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ trashId: z.uuid() }))
  .handler(async ({ data }) => {
    const { client } = await requireVirginStockAccess(data.accessToken)
    const { error } = await client.schema('estoque_atual')
      .from('bobinas_estoque_virgem_lixeira').delete().eq('id', data.trashId)
    if (error) throw new Error(`Não foi possível excluir definitivamente: ${error.message}`)
    return { success: true }
  })
