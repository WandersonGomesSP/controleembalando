import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/database.types'

const input = z.object({ accessToken: z.string().min(20) })

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

export const carregarIndicadoresEstoqueMinimoRebobinadeira = createServerFn({ method: 'POST' })
  .validator(input)
  .handler(async ({ data }) => {
    const client = createAdminClient()
    const { data: userData, error: userError } = await client.auth.getUser(data.accessToken)
    if (userError || !userData.user?.email) throw new Error('Sessão inválida.')

    const [roleResult, developerResult] = await Promise.all([
      client.from('user_roles').select('role, area').eq('user_id', userData.user.id).maybeSingle(),
      client.from('developer_accounts').select('email').eq('email', userData.user.email.toLowerCase()).maybeSingle(),
    ])
    if (roleResult.error || developerResult.error) {
      throw new Error('Não foi possível validar a permissão para consultar a Rebobinadeira.')
    }
    const permitido = Boolean(developerResult.data)
      || roleResult.data?.role === 'ADMIN'
      || (roleResult.data?.role === 'OPERATOR' && roleResult.data.area === 'rebobinadeira')
    if (!permitido) throw new Error('Você não tem permissão para consultar o estoque mínimo adesivado.')

    const rebobinadeira = (client as any).schema('rebobinadeira')
    const [indicadoresResult, produtosResult] = await Promise.all([
      rebobinadeira.from('vw_estoque_minimo').select('*').order('descricao', { ascending: true }),
      rebobinadeira.from('produtos_jumbo')
        .select('codigo, descricao, ajuste_estoque_percentual, alerta_estoque_baixo_ativo')
        .eq('ativo', true),
    ])
    if (indicadoresResult.error) {
      throw new Error('Não foi possível carregar a view vw_estoque_minimo: ' + indicadoresResult.error.message)
    }
    if (produtosResult.error) {
      throw new Error('Não foi possível carregar os parâmetros dos produtos jumbo: ' + produtosResult.error.message)
    }
    return {
      registros: indicadoresResult.data ?? [],
      produtos: produtosResult.data ?? [],
    }
  })
