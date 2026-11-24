import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database, RoleUsuario } from '@/lib/database.types'
import { syncGoogleSheets } from '@/lib/google-sheets-sync.server'

const tokenInput = z.object({ accessToken: z.string().min(20) })
const areaSchema = z.enum(['tubeteira', 'rebobinadeira', 'cobrideira'])
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

async function requireCobrideiraEditor(accessToken: string) {
  const client = createAdminClient()
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user?.email) throw new Error('Sessão inválida.')
  const [roleResult, developerResult] = await Promise.all([
    client.from('user_roles').select('role, area').eq('user_id', data.user.id).maybeSingle(),
    client.from('developer_accounts').select('email').eq('email', data.user.email.toLowerCase()).maybeSingle(),
  ])
  if (roleResult.error || developerResult.error) throw new Error('Não foi possível validar a permissão para editar bobinas.')
  const permitido = Boolean(developerResult.data)
    || roleResult.data?.role === 'ADMIN'
    || (roleResult.data?.role === 'OPERATOR' && roleResult.data.area === 'cobrideira')
  if (!permitido) throw new Error('Você não tem permissão para editar bobinas da Cobrideira.')
  return { client, user: data.user }
}


async function requireRebobinadeiraEditor(accessToken: string) {
  const client = createAdminClient()
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user?.email) throw new Error('Sessão inválida.')
  const [roleResult, developerResult] = await Promise.all([
    client.from('user_roles').select('role, area').eq('user_id', data.user.id).maybeSingle(),
    client.from('developer_accounts').select('email').eq('email', data.user.email.toLowerCase()).maybeSingle(),
  ])
  if (roleResult.error || developerResult.error) {
    throw new Error('Não foi possível validar a permissão para importar dados da Rebobinadeira.')
  }
  const permitido = Boolean(developerResult.data)
    || roleResult.data?.role === 'ADMIN'
    || (roleResult.data?.role === 'OPERATOR' && roleResult.data.area === 'rebobinadeira')
  if (!permitido) throw new Error('Você não tem permissão para importar dados da Rebobinadeira.')
  return { client, user: data.user }
}

type AlertaRebobinadeiraInput = {
  tipo: string
  mensagem: string
  numeroBobina?: string | null
  producaoId?: number | null
  detalhes?: Record<string, unknown>
  severidade?: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA'
}

async function sha256Hex(valor: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function registrarAlertasRebobinadeira(
  client: ReturnType<typeof createAdminClient>,
  alertas: AlertaRebobinadeiraInput[],
) {
  if (!alertas.length) return
  try {
    const linhas = alertas.map((alerta) => {
      const numero = alerta.numeroBobina?.trim() || null
      return {
        tipo: alerta.tipo,
        severidade: alerta.severidade ?? 'ALTA',
        numero_bobina: numero,
        numero_normalizado: numero ? numero.replace(/[^0-9]/g, '') : null,
        producao_id: alerta.producaoId ?? null,
        mensagem: alerta.mensagem,
        detalhes: alerta.detalhes ?? {},
      }
    })
    for (let offset = 0; offset < linhas.length; offset += 100) {
      const { error } = await client.schema('rebobinadeira').from('alertas_bobinas').insert(linhas.slice(offset, offset + 100))
      if (error) {
        console.error('Falha ao persistir alertas da Rebobinadeira:', error.message)
        break
      }
    }
  } catch (error) {
    console.error('Não foi possível persistir alertas da Rebobinadeira:', error)
  }
}

async function registrarAlertaRebobinadeira(
  client: ReturnType<typeof createAdminClient>,
  alerta: AlertaRebobinadeiraInput,
) {
  await registrarAlertasRebobinadeira(client, [alerta])
}

const REBOBINadeira_CSV_COLUMNS = [
  'data_texto', 'maquina', 'setup', 'numero_bobina', 'turno_texto',
  'material', 'largura_bobina_texto', 'peso_bobina_texto', 'fornec_filme',
  'lote_cola', 'fornec_cola', 'medida', 'largura_fita_texto', 'comp_fita_texto',
  'cor', 'linha', 'cliente', 'caixas_texto', 'pcts_texto', 'rolos_texto',
  'refugos_texto', 'fitas_rebobinadas_texto', 'refilo_texto',
  'perda_producao_texto', 'perda_filme_texto', 'metragem_bobina_texto',
  'metragem_unica_texto', 'area_bobina_texto', 'observacoes',
  'peso_unico_texto', 'area_unica_texto',
] as const

function parseRebobinadeiraCsv(csv: string) {
  const text = csv.replace(/^\uFEFF/, '')
  const rows: { fields: string[]; line: number }[] = []
  let fields: string[] = []
  let field = ''
  let quoted = false
  let physicalLine = 1
  let rowStartLine = 1

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (char === ';' && !quoted) {
      fields.push(field)
      field = ''
      continue
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      fields.push(field)
      if (fields.some((value) => value.trim() !== '')) rows.push({ fields, line: rowStartLine })
      fields = []
      field = ''
      if (char === '\r' && text[i + 1] === '\n') i += 1
      physicalLine += 1
      rowStartLine = physicalLine
      continue
    }
    if (char === '\n') physicalLine += 1
    field += char
  }

  if (quoted) throw new Error('O CSV contém um campo com aspas abertas.')
  fields.push(field)
  if (fields.some((value) => value.trim() !== '')) rows.push({ fields, line: rowStartLine })
  return rows
}

function dataCsvValida(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return false
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
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



export const excluirLancamentosRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ ids: z.array(z.number().int().positive()).min(1).max(1000) }))
  .handler(async ({ data }) => {
    const { client, user } = await requireRebobinadeiraEditor(data.accessToken)
    const schema = client.schema('rebobinadeira')
    const ids = [...new Set(data.ids)]
    const { data: rows, error: readError } = await schema.from('bobinas').select('*').in('id', ids).order('data', { ascending: true }).order('id', { ascending: true })
    if (readError) throw new Error('Não foi possível localizar os lançamentos selecionados: ' + readError.message)
    if (!rows?.length || rows.length !== ids.length) throw new Error('Um ou mais lançamentos não foram encontrados. Atualize o histórico.')
    const ativos = rows.filter((row) => row.status_baixa !== 'EXCLUIDA')
    if (!ativos.length) return { success: true, quantidade: 0 }
    const { data: movimentos, error: movementError } = await schema.from('movimentacoes_bobinas')
      .select('*').in('producao_id', ativos.map((row) => row.id)).in('tipo_movimento', ['CONSUMO', 'DEVOLUCAO'])
    if (movementError) throw new Error('Não foi possível guardar os movimentos para permitir a restauração: ' + movementError.message)
    const movimentosPorId = new Map<number, unknown[]>()
    for (const movimento of movimentos ?? []) {
      const lista = movimentosPorId.get(movimento.producao_id) ?? []
      lista.push(movimento)
      movimentosPorId.set(movimento.producao_id, lista)
    }
    const snapshots = ativos.map((row) => ({
      producao_id: row.id,
      numero_bobina: row.numero_bobina,
      dados: row,
      movimentos: movimentosPorId.get(row.id) ?? [],
      excluida_por: user.id,
      excluida_em: new Date().toISOString(),
    }))
    const { error: archiveError } = await schema.from('lancamentos_lixeira').upsert(snapshots, { onConflict: 'producao_id' })
    if (archiveError) throw new Error('Não foi possível guardar os lançamentos na lixeira: ' + archiveError.message)
    for (const row of ativos) {
      if (row.status_baixa !== 'ESTORNADA') {
        const { error } = await schema.rpc('estornar_producao', { p_producao_id: row.id, p_motivo: 'Movido para a lixeira do histórico da Rebobinadeira' })
        if (error) throw new Error('Não foi possível recompor o saldo da bobina no lançamento #' + row.id + ': ' + error.message)
      }
    }
    const { error: updateError } = await schema.from('bobinas').update({ status_baixa: 'EXCLUIDA' }).in('id', ativos.map((row) => row.id))
    if (updateError) throw new Error('Os movimentos foram estornados, mas não foi possível concluir a movimentação para a lixeira: ' + updateError.message)
    await schema.from('alertas_bobinas').update({ status: 'RESOLVIDO', resolvido_em: new Date().toISOString() }).in('producao_id', ativos.map((row) => row.id)).eq('status', 'ABERTO')
    return { success: true, quantidade: ativos.length }
  })

export const listarLixeiraRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const { client } = await requireRebobinadeiraEditor(data.accessToken)
    const { data: registros, error } = await client.schema('rebobinadeira').from('lancamentos_lixeira')
      .select('*').order('excluida_em', { ascending: false }).order('producao_id', { ascending: false })
    if (error) throw new Error('Não foi possível carregar a lixeira da Rebobinadeira: ' + error.message)
    return registros ?? []
  })

export const restaurarLancamentosRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ ids: z.array(z.string().uuid()).min(1).max(1000) }))
  .handler(async ({ data }) => {
    const { client } = await requireRebobinadeiraEditor(data.accessToken)
    const schema = client.schema('rebobinadeira')
    const ids = [...new Set(data.ids)]
    const { data: registros, error: readError } = await schema.from('lancamentos_lixeira').select('*').in('id', ids)
    if (readError) throw new Error('Não foi possível localizar os itens da lixeira: ' + readError.message)
    if (!registros?.length || registros.length !== ids.length) throw new Error('Um ou mais itens não foram encontrados na lixeira.')
    for (const item of registros) {
      const original = item.dados as Record<string, unknown>
      if (original.status_baixa !== 'ESTORNADA') {
        const { error: movementError } = await schema.from('movimentacoes_bobinas').delete()
          .eq('producao_id', item.producao_id).eq('tipo_movimento', 'ESTORNO')
        if (movementError) throw new Error('Não foi possível reverter o estorno da bobina ' + item.numero_bobina + ': ' + movementError.message)
      }
      const { error: updateError } = await schema.from('bobinas').update({
        status_baixa: original.status_baixa,
        metros_consumidos: original.metros_consumidos,
        peso_consumido_kg: original.peso_consumido_kg,
        metragem_unica_m: original.metragem_unica_m,
        observacoes: original.observacoes,
      }).eq('id', item.producao_id)
      if (updateError) throw new Error('Não foi possível restaurar o lançamento #' + item.producao_id + ': ' + updateError.message)
    }
    const { error: removeError } = await schema.from('lancamentos_lixeira').delete().in('id', ids)
    if (removeError) throw new Error('Os lançamentos foram restaurados, mas não foi possível limpar a lixeira: ' + removeError.message)
    return { success: true, quantidade: registros.length }
  })

export const excluirDefinitivamenteLixeiraRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ ids: z.array(z.string().uuid()).min(1).max(1000) }))
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const schema = client.schema('rebobinadeira')
    const ids = [...new Set(data.ids)]
    const { data: registros, error: readError } = await schema.from('lancamentos_lixeira').select('id,producao_id').in('id', ids)
    if (readError) throw new Error('Não foi possível localizar os itens da lixeira: ' + readError.message)
    if (!registros?.length || registros.length !== ids.length) throw new Error('Um ou mais itens não foram encontrados na lixeira.')
    const producaoIds = registros.map((item) => item.producao_id)
    const { error: alertError } = await schema.from('alertas_bobinas').delete().in('producao_id', producaoIds)
    if (alertError) throw new Error('Não foi possível remover os alertas vinculados: ' + alertError.message)
    const { error: movementError } = await schema.from('movimentacoes_bobinas').delete().in('producao_id', producaoIds)
    if (movementError) throw new Error('Não foi possível remover os movimentos vinculados: ' + movementError.message)
    const { error: rowError } = await schema.from('bobinas').delete().in('id', producaoIds)
    if (rowError) throw new Error('Não foi possível excluir definitivamente os lançamentos: ' + rowError.message)
    const { error: trashError } = await schema.from('lancamentos_lixeira').delete().in('id', ids)
    if (trashError) throw new Error('Os lançamentos foram removidos, mas não foi possível limpar a lixeira: ' + trashError.message)
    return { success: true, quantidade: registros.length }
  })


export const importarCsvRebobinadeira = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      csv: z.string().min(1).max(4_000_000),
      nomeArquivo: z.string().trim().min(1).max(180).default('importacao.csv'),
    }),
  )
  .handler(async ({ data }) => {
    const { client } = await requireRebobinadeiraEditor(data.accessToken)
    const hashArquivo = await sha256Hex(data.csv)
    const { data: importacaoExistente, error: hashError } = await client.schema('rebobinadeira')
      .from('importacao_log').select('id').eq('hash_arquivo', hashArquivo).maybeSingle()
    if (hashError) throw new Error('Não foi possível verificar se o arquivo já foi importado: ' + hashError.message)
    const parsed = parseRebobinadeiraCsv(data.csv)
    if (parsed[0]?.fields[0]?.trim().toUpperCase().startsWith('DATA')) parsed.shift()
    if (importacaoExistente) {
      return {
        lote_id: importacaoExistente.id,
        recebidas: parsed.length,
        validas: 0,
        rejeitadas: 0,
        gravadas: 0,
        rejeicoes: [],
        repetido: true,
      }
    }

    for (const row of parsed) {
      if (row.fields.length !== REBOBINadeira_CSV_COLUMNS.length) {
        const mensagem = 'Linha ' + row.line + ': esperado 31 colunas, mas foram encontradas ' + row.fields.length + '. Nenhum dado foi gravado.'
        await registrarAlertaRebobinadeira(client, {
          tipo: 'IMPORTACAO_COLUNAS_INVALIDAS',
          severidade: 'CRITICA',
          numeroBobina: row.fields[3] ?? null,
          mensagem,
          detalhes: { arquivo: data.nomeArquivo, linha: row.line, colunas_recebidas: row.fields.length, colunas_esperadas: REBOBINadeira_CSV_COLUMNS.length },
        })
        throw new Error(mensagem)
      }
    }

    const rejeicoes: { linha: number; motivo: string; numero_bobina?: string }[] = []
    const validas: Record<string, unknown>[] = []
    for (const row of parsed) {
      const fields = row.fields.map((value) => value.trim())
      const material = fields[5] ?? ''
      const materialSemLargura = /CREPE|DUPLA FACE|KRAFT/i.test(material)
      const motivos: string[] = []
      if (!dataCsvValida(fields[0] ?? '')) motivos.push('Data inválida; use DD/MM/AAAA.')
      if (!fields[3]) motivos.push('Número da bobina não informado.')
      if (!material) motivos.push('Material não informado.')
      if (!materialSemLargura && !fields[6]) motivos.push('Largura do jumbo não informada.')
      if (motivos.length) {
        rejeicoes.push({ linha: row.line, motivo: motivos.join(' '), numero_bobina: fields[3] ?? '' })
        continue
      }
      const record: Record<string, unknown> = {
        lote_id: '',
        linha_csv: row.line,
      }
      REBOBINadeira_CSV_COLUMNS.forEach((column, index) => {
        record[column] = fields[index] ?? ''
      })
      if (!String(record.linha ?? '').trim()) record.linha = 'PADRÃO'
      validas.push(record)
    }

    await registrarAlertasRebobinadeira(client, rejeicoes.map((item) => ({
      tipo: 'IMPORTACAO_LINHA_REJEITADA',
      severidade: 'ALTA' as const,
      numeroBobina: item.numero_bobina,
      mensagem: 'Linha ' + item.linha + ' rejeitada na importação: ' + item.motivo,
      detalhes: { arquivo: data.nomeArquivo, linha: item.linha, motivo: item.motivo },
    })))

    if (!validas.length) {
      return {
        lote_id: null,
        recebidas: parsed.length,
        validas: 0,
        rejeitadas: rejeicoes.length,
        gravadas: 0,
        rejeicoes,
        repetido: false,
      }
    }

    const loteId = crypto.randomUUID()
    const stagingRows = validas.map((row) => ({ ...row, lote_id: loteId }))
    for (let offset = 0; offset < stagingRows.length; offset += 500) {
      const batch = stagingRows.slice(offset, offset + 500)
      const { error } = await client
        .schema('rebobinadeira')
        .from('staging_planilha')
        .insert(batch as never)
      if (error) {
        await client.schema('rebobinadeira').from('staging_planilha').delete().eq('lote_id', loteId)
        await registrarAlertaRebobinadeira(client, { tipo: 'ERRO_PREPARACAO_IMPORTACAO', severidade: 'CRITICA', mensagem: 'Falha ao preparar o CSV da Rebobinadeira.', detalhes: { arquivo: data.nomeArquivo, erro: error.message } })
        throw new Error(`Falha ao preparar a importação: ${error.message}`)
      }
    }

    const { data: gravadas, error: processError } = await client
      .schema('rebobinadeira')
      .rpc('processar_lote', { p_lote: loteId })
    if (processError) {
      await registrarAlertaRebobinadeira(client, { tipo: 'ERRO_PROCESSAMENTO_IMPORTACAO', severidade: 'CRITICA', mensagem: 'Falha ao processar o lote da Rebobinadeira.', detalhes: { arquivo: data.nomeArquivo, lote_id: loteId, erro: processError.message } })
      throw new Error(`Falha ao processar o lote. Os dados temporários foram preservados para diagnóstico: ${processError.message}`)
    }

    const { error: logError } = await client
      .schema('rebobinadeira')
      .from('importacao_log')
      .update({ nome_arquivo: data.nomeArquivo, hash_arquivo: hashArquivo })
      .eq('id', loteId)
    if (logError) {
      await registrarAlertaRebobinadeira(client, { tipo: 'ERRO_LOG_IMPORTACAO', severidade: 'ALTA', mensagem: 'As bobinas foram importadas, mas o nome do arquivo não foi registrado no log.', detalhes: { arquivo: data.nomeArquivo, lote_id: loteId, erro: logError.message } })
      throw new Error(`As bobinas foram importadas, mas não foi possível registrar o nome do arquivo: ${logError.message}`)
    }

    return {
      lote_id: loteId,
      recebidas: parsed.length,
      validas: validas.length,
      rejeitadas: rejeicoes.length,
      gravadas: Number(gravadas ?? 0),
      rejeicoes,
      repetido: false,
    }
  })

export const buscarDetalhesBobinasOrigemRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    numeros: z.array(z.string().trim().min(1).max(80)).max(10000),
  }))
  .handler(async ({ data }) => {
    const { client } = await requireRebobinadeiraEditor(data.accessToken)
    const desejadas = new Set(data.numeros.map((numero) => numero.replace(/\D/g, '')).filter(Boolean))
    const resultados: Record<string, unknown>[] = []
    // A Cobrideira tem pouco mais de mil registros; paginar a origem inteira evita falhas
    // quando o número tem pontuação/zeros diferentes entre os dois setores.
    for (let inicio = 0; ; inicio += 1000) {
      const { data: rows, error } = await client.schema('cobrideira').from('bobinas')
        .select('numero_bobina,cod_bob,data,aba,material,largura,micragem,peso_bruto,peso_final,peso_cilindro,peso_liquido,metragem,perda_kg,fornecedor_filme,vareta_g,kg_cola,lote_cola,codigo_interno,fornecedor_cola,turno,linha,cor_fundo,pigmento_kg,cor_mistura,pigmento_mistura,cliente,cor_impressao,emenda,codigo_emenda,operador')
        .order('data', { ascending: false })
        .range(inicio, inicio + 999)
      if (error) throw new Error('Não foi possível carregar os dados completos da Cobrideira: ' + error.message)
      for (const row of rows ?? []) {
        const chave = String(row.numero_bobina ?? '').replace(/\D/g, '')
        if (desejadas.has(chave)) resultados.push(row)
      }
      if (!rows || rows.length < 1000) break
    }
    return resultados
  })

export const buscarBobinasOrigemRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ termo: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    const { client } = await requireRebobinadeiraEditor(data.accessToken)
    const termo = data.termo.trim()
    const { data: rows, error } = await client.schema('cobrideira').from('bobinas')
      .select('numero_bobina,data,material,largura,peso_liquido,peso_final,metragem,fornecedor_filme,lote_cola,fornecedor_cola,cor_fundo,linha,cliente')
      .ilike('numero_bobina', '%' + termo + '%')
      .order('data', { ascending: false })
      .limit(15)
    if (error) throw new Error('Não foi possível pesquisar bobinas cadastradas: ' + error.message)
    return (rows ?? []).map((row) => ({
      numero_bobina: row.numero_bobina,
      data: row.data,
      material: row.material,
      largura: Number(row.largura),
      peso_kg: Number(row.peso_liquido ?? row.peso_final),
      metragem_m: Number(row.metragem),
      fornecedor_filme: row.fornecedor_filme,
      lote_cola: row.lote_cola,
      fornecedor_cola: row.fornecedor_cola,
      cor: row.cor_fundo,
      linha: row.linha,
      cliente: row.cliente,
    }))
  })

export const adicionarMedidaRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    descricao: z.string().trim().min(1).max(80),
  }))
  .handler(async ({ data }) => {
    const { client } = await requireRebobinadeiraEditor(data.accessToken)
    const descricao = data.descricao.replace(/\s+/g, ' ').trim()
    const codigo = 'MEDIDA|' + descricao
    const { data: produto, error } = await client.schema('rebobinadeira').from('produtos_jumbo')
      .upsert({
        codigo,
        descricao,
        material: 'MEDIDA',
        cor: 'SEM COR',
        tipo_produto: 'PADRÃO',
        piso_minimo_jumbos: 1,
        ativo: false,
        ajuste_estoque_percentual: 0,
        alerta_estoque_baixo_ativo: false,
      }, { onConflict: 'codigo', ignoreDuplicates: true })
      .select('codigo,descricao,material,cor,largura_jumbo_mm,tipo_produto,lead_time_dias,piso_minimo_jumbos,ativo,ajuste_estoque_percentual,alerta_estoque_baixo_ativo')
      .maybeSingle()
    if (error) throw new Error('Não foi possível adicionar a medida: ' + error.message)
    if (produto) return produto
    const { data: existente, error: erroBusca } = await client.schema('rebobinadeira').from('produtos_jumbo')
      .select('codigo,descricao,material,cor,largura_jumbo_mm,tipo_produto,lead_time_dias,piso_minimo_jumbos,ativo,ajuste_estoque_percentual,alerta_estoque_baixo_ativo')
      .eq('codigo', codigo).single()
    if (erroBusca || !existente) throw new Error('Não foi possível confirmar a medida cadastrada.')
    return existente
  })

export const registrarProducaoRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    registro: z.object({
      data: isoDate,
      maquina: z.string().trim().min(1).max(40),
      setup: z.boolean().default(false),
      numero_bobina: z.string().trim().min(1).max(80),
      turno: z.enum(['1º TURNO', '2º TURNO']).nullable().optional(),
      produto_codigo: z.string().trim().min(1).max(180),
      peso_jumbo_kg: z.number().positive().nullable().optional(),
      metragem_bobina_m: z.number().positive().nullable().optional(),
      metragem_unica_m: z.number().positive().nullable().optional(),
      material: z.string().trim().min(1).max(120),
      largura_jumbo_mm: z.number().positive().nullable().optional(),
      fornec_filme: z.string().max(180).nullable().optional(),
      lote_cola: z.string().max(120).nullable().optional(),
      fornec_cola: z.string().max(180).nullable().optional(),
      medida: z.string().max(80).nullable().optional(),
      cor: z.string().trim().min(1).max(100),
      linha: z.enum(['PADRÃO', 'PERSONALIZADA', 'KIT']),
      linha_detalhe: z.string().max(180).optional().default(''),
      cliente: z.string().max(180).nullable().optional(),
      caixas: z.number().int().min(0).max(1000000),
      pcts: z.number().int().min(0).max(1000000),
      rolos: z.number().int().min(0).max(1000000),
      refugos: z.number().min(0).max(1000000),
      fitas_rebobinadas: z.number().min(0).max(1000000),
      refilo_kg: z.number().min(0).max(1000000),
      perda_producao_kg: z.number().min(0).max(1000000),
      bobina_voltou_parcial: z.boolean(),
      metragem_devolvida_m: z.number().min(0).nullable().optional(),
      observacoes: z.string().max(1000).optional().default(''),
    }),
  }))
  .handler(async ({ data }) => {
    const { client } = await requireRebobinadeiraEditor(data.accessToken)
    const { data: id, error } = await client.schema('rebobinadeira').rpc('registrar_producao', {
      p_registro: data.registro,
    })
    if (error) {
      await registrarAlertaRebobinadeira(client, { tipo: 'ERRO_REGISTRO_PRODUCAO', severidade: 'CRITICA', numeroBobina: data.registro.numero_bobina, mensagem: 'Falha ao registrar uma produção manual.', detalhes: { erro: error.message, registro: data.registro } })
      throw new Error('Não foi possível registrar a produção: ' + error.message)
    }
    return { id: Number(id) }
  })

export const corrigirNumeroBobinaRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    producaoId: z.number().int().positive(),
    novoNumero: z.string().trim().min(1).max(80),
  }))
  .handler(async ({ data }) => {
    const { client } = await requireRebobinadeiraEditor(data.accessToken)
    const { data: success, error } = await client.schema('rebobinadeira').rpc('corrigir_numero_bobina', {
      p_producao_id: data.producaoId,
      p_novo_numero: data.novoNumero,
    })
    if (error) throw new Error('Não foi possível corrigir o número da bobina: ' + error.message)
    return { success: Boolean(success) }
  })

export const editarProducaoRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    producaoId: z.number().int().positive(),
    registro: z.object({
      data: isoDate,
      maquina: z.string().trim().min(1).max(40),
      setup: z.boolean(),
      produto_codigo: z.string().trim().min(1).max(180),
      material: z.string().trim().min(1).max(120),
      largura_jumbo_mm: z.number().positive().nullable(),
      peso_jumbo_kg: z.number().positive().nullable(),
      fornec_filme: z.string().max(180),
      lote_cola: z.string().max(120),
      fornec_cola: z.string().max(180),
      medida: z.string().max(80),
      cor: z.string().trim().min(1).max(100),
      linha: z.enum(['PADRÃO', 'PERSONALIZADA', 'KIT']),
      linha_detalhe: z.string().max(180),
      cliente: z.string().max(180),
      caixas: z.number().int().min(0).max(1000000),
      pcts: z.number().int().min(0).max(1000000),
      rolos: z.number().int().min(0).max(1000000),
      refugos: z.number().min(0).max(1000000),
      fitas_rebobinadas: z.number().min(0).max(1000000),
      refilo_kg: z.number().min(0).max(1000000),
      perda_producao_kg: z.number().min(0).max(1000000),
      observacoes: z.string().max(1000),
    }),
  }))
  .handler(async ({ data }) => {
    const { client } = await requireRebobinadeiraEditor(data.accessToken)
    const { data: updated, error } = await client.schema('rebobinadeira').from('bobinas')
      .update(data.registro)
      .eq('id', data.producaoId)
      .select('id')
      .maybeSingle()
    if (error) throw new Error('Não foi possível editar a produção: ' + error.message)
    if (!updated) throw new Error('O lançamento não foi encontrado ou não pôde ser alterado.')
    return { id: Number(updated.id) }
  })

export const estornarProducaoRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    producaoId: z.number().int().positive(),
    motivo: z.string().trim().min(3).max(500),
  }))
  .handler(async ({ data }) => {
    const { client } = await requireRebobinadeiraEditor(data.accessToken)
    const { data: success, error } = await client.schema('rebobinadeira').rpc('estornar_producao', {
      p_producao_id: data.producaoId,
      p_motivo: data.motivo,
    })
    if (error) {
      await registrarAlertaRebobinadeira(client, { tipo: 'ERRO_ESTORNO_PRODUCAO', severidade: 'CRITICA', producaoId: data.producaoId, mensagem: 'Falha ao estornar uma produção.', detalhes: { erro: error.message, motivo: data.motivo } })
      throw new Error('Não foi possível estornar a produção: ' + error.message)
    }
    return { success: Boolean(success) }
  })

export const ajustarSaldoBobinaRebobinadeira = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    numeroBobina: z.string().trim().min(1).max(80),
    metrosDelta: z.number().min(-1000000).max(1000000).default(0),
    pesoDelta: z.number().min(-100000).max(100000).default(0),
    motivo: z.string().trim().min(3).max(500),
  }).refine((value) => value.metrosDelta !== 0 || value.pesoDelta !== 0, {
    message: 'Informe uma diferença de metragem ou peso.',
  }))
  .handler(async ({ data }) => {
    const { client } = await requireRebobinadeiraEditor(data.accessToken)
    const { data: success, error } = await client.schema('rebobinadeira').rpc('ajuste_manual', {
      p_numero_bobina: data.numeroBobina,
      p_metros_delta: data.metrosDelta,
      p_peso_delta: data.pesoDelta,
      p_motivo: data.motivo,
    })
    if (error) {
      await registrarAlertaRebobinadeira(client, { tipo: 'ERRO_AJUSTE_MANUAL', severidade: 'CRITICA', numeroBobina: data.numeroBobina, mensagem: 'Falha ao registrar ajuste manual de saldo.', detalhes: { erro: error.message, motivo: data.motivo } })
      throw new Error('Não foi possível ajustar o saldo da bobina: ' + error.message)
    }
    return { success: Boolean(success) }
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
  .validator(tokenInput.extend({ dataInicio: z.iso.date(), dataFim: z.iso.date() }))
  .handler(async ({ data }) => {
    await requireDeveloper(data.accessToken)
    if (data.dataFim < data.dataInicio) throw new Error('A data final não pode ser anterior à data inicial.')
    return syncGoogleSheets(data.dataInicio, data.dataFim)
  })


export const updateCobrideiraBobinaCell = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    numeroOriginal: z.string().trim().min(1).max(80),
    campo: z.enum([
      'numero_bobina', 'cod_bob', 'data', 'fornecedor_filme', 'largura', 'micragem',
      'peso_bruto', 'peso_final', 'metragem', 'material', 'perda_kg',
      'vareta_g', 'kg_cola', 'lote_cola', 'codigo_interno', 'fornecedor_cola',
      'linha', 'cor_fundo', 'pigmento_kg', 'cor_mistura', 'pigmento_mistura',
      'cliente', 'cor_impressao',
    ]),
    valor: z.union([z.string(), z.number()]),
    updatedAt: z.string().datetime(),
  }))
  .handler(async ({ data }) => {
    const { client, user } = await requireCobrideiraEditor(data.accessToken)
    const camposNumericos = ['largura', 'micragem', 'peso_bruto', 'peso_final', 'metragem', 'perda_kg', 'vareta_g', 'kg_cola', 'pigmento_kg']
    if (camposNumericos.includes(data.campo)) {
      if (typeof data.valor !== 'number' || !Number.isFinite(data.valor) || data.valor <= 0) {
        throw new Error('Informe um número positivo para este campo.')
      }
      if (Math.round(data.valor * 100) !== data.valor * 100) throw new Error('Use no máximo duas casas decimais.')
      if (['micragem', 'metragem', 'vareta_g'].includes(data.campo) && !Number.isInteger(data.valor)) throw new Error('Este campo aceita apenas números inteiros.')
    } else if (typeof data.valor !== 'string') {
      throw new Error('Valor inválido para este campo.')
    }
    if (['numero_bobina', 'cod_bob', 'fornecedor_filme'].includes(data.campo) && !String(data.valor).trim()) {
      throw new Error('Este campo não pode ficar vazio.')
    }
    if (data.campo === 'data' && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.valor))) {
      throw new Error('Informe uma data válida.')
    }
    const patch = {
      [data.campo]: data.campo === 'numero_bobina' || data.campo === 'cod_bob' || data.campo === 'fornecedor_filme'
        ? String(data.valor).trim()
        : data.valor,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }
    const { data: updated, error } = await client.schema('cobrideira')
      .from('bobinas')
      .update(patch as never)
      .eq('numero_bobina', data.numeroOriginal)
      .eq('updated_at', data.updatedAt)
      .select('*')
      .maybeSingle()
    if (error?.code === '23505') throw new Error('Já existe outra bobina com esse número.')
    if (error) throw new Error(`Não foi possível atualizar a bobina: ${error.message}`)
    if (!updated) throw new Error('Conflito: esta bobina foi alterada por outra pessoa. Atualize a lista e tente novamente.')
    return updated
  })

export const updateCobrideiraBobina = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    numeroOriginal: z.string().trim().min(1).max(80),
    bobina: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  }))
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const { data: updated, error } = await client
      .schema('cobrideira')
      .from('bobinas')
      .update(data.bobina as never)
      .eq('numero_bobina', data.numeroOriginal)
      .select('*')
      .single()
    if (error) {
      console.error('[COBRIDEIRA][UPDATE] Erro Supabase completo:', {
        message: error.message, code: error.code, details: error.details, hint: error.hint,
        numeroOriginal: data.numeroOriginal,
      })
      throw new Error([
        'SUPABASE_UPDATE_ERROR',
        `code=${error.code ?? 'sem código'}`,
        `message=${error.message}`,
        `details=${error.details ?? 'sem detalhes'}`,
        `hint=${error.hint ?? 'sem orientação'}`,
      ].join(' | '))
    }
    return updated
  })

export const synchronizeCobrideiraBobina = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ numeroBobina: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    await requireDeveloper(data.accessToken)
    try {
      return await syncGoogleSheets(undefined, undefined, data.numeroBobina)
    } catch (error) {
      console.error('[COBRIDEIRA][SYNC] Erro completo ao sincronizar bobina:', {
        numeroBobina: data.numeroBobina,
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw new Error(`SYNC_BOBINA_${data.numeroBobina}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })

export const moveCobrideiraBobinaToTrash = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ numeroBobina: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    const { client, user } = await requireDeveloper(data.accessToken)
    const { data: bobina, error: readError } = await client
      .schema('cobrideira').from('bobinas').select('*')
      .eq('numero_bobina', data.numeroBobina).maybeSingle()
    if (readError || !bobina) throw new Error('Bobina não encontrada no cadastro ativo.')
    // Upsert substitui uma cópia antiga da mesma bobina na lixeira pelo estado ativo atual.
    // Isso evita a chave duplicada e garante que a versão mais recente seja a arquivada.
    const { error: archiveError } = await client.schema('cobrideira')
      .from('bobinas_lixeira')
      .upsert({
        numero_bobina: data.numeroBobina,
        dados: bobina,
        excluida_por: user.id,
        excluida_em: new Date().toISOString(),
      }, { onConflict: 'numero_bobina' })
    if (archiveError) throw new Error(`Não foi possível atualizar a bobina na lixeira: ${archiveError.message}`)

    const { error: deleteError, count } = await client.schema('cobrideira').from('bobinas')
      .delete({ count: 'exact' }).eq('numero_bobina', data.numeroBobina)
    if (deleteError || count === 0) {
      throw new Error(`A cópia foi atualizada na lixeira, mas o cadastro ativo não foi removido: ${deleteError?.message ?? 'o registro ativo não foi removido'}`)
    }
    return { success: true }
  })

export const listCobrideiraBobinasTrash = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const { data: rows, error } = await client.schema('cobrideira')
      .from('bobinas_lixeira').select('*').order('excluida_em', { ascending: false })
    if (error) throw new Error(`Não foi possível carregar a lixeira: ${error.message}`)
    return rows ?? []
  })

export const restoreCobrideiraBobinaFromTrash = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ numeroBobina: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const { data: archived, error: readError } = await client.schema('cobrideira')
      .from('bobinas_lixeira').select('*')
      .eq('numero_bobina', data.numeroBobina).single()
    if (readError || !archived) throw new Error('Bobina não encontrada na lixeira.')
    const dadosRestaurados = { ...(archived.dados as Record<string, unknown>) }
    // peso_liquido é uma coluna GENERATED ALWAYS no banco e não pode ser inserida.
    delete dadosRestaurados.peso_liquido
    const { error: restoreError } = await client.schema('cobrideira')
      .from('bobinas').insert(dadosRestaurados as never)
    if (restoreError) throw new Error(`Não foi possível restaurar a bobina: ${restoreError.message}`)
    const { error: removeError } = await client.schema('cobrideira')
      .from('bobinas_lixeira').delete().eq('numero_bobina', data.numeroBobina)
    if (removeError) throw new Error(`Bobina restaurada, mas não foi possível removê-la da lixeira: ${removeError.message}`)
    return { success: true }
  })

export const permanentlyDeleteCobrideiraBobina = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ numeroBobina: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const { error } = await client.schema('cobrideira').from('bobinas_lixeira')
      .delete().eq('numero_bobina', data.numeroBobina)
    if (error) throw new Error(`Não foi possível excluir definitivamente a bobina: ${error.message}`)
    return { success: true }
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

const currentStockRecordSchema = z.object({
  categoria: z.enum(['BOPP', 'PEBD', 'CREPE', 'KRAFT', 'DUPLA FACE']),
  data_entrada: z.union([isoDate, z.literal('')]).nullable(),
  fornecedor: z.string().max(160).nullable(),
  medida: z.number().positive().nullable(),
  medida_texto: z.string().max(80).nullable().optional(),
  nf: z.string().max(160).nullable().optional(),
  aba: z.string().max(80).nullable().optional(),
  peso_kg: z.number().min(0).nullable(),
  metragem_m: z.number().min(0).nullable(),
  codigo: z.string().trim().min(1).max(120).nullable(),
  cor: z.string().max(80).nullable(),
  cliente: z.string().max(160).nullable(),
  linha: z.string().max(80).nullable(),
  observacoes: z.string().max(1000).nullable(),
  localizacao: z.enum(['ESTOQUE', 'GALPAO_MARIO_COVAS']).optional(),
}).strict()


const tipoEstoqueAtualSchema = z.enum(['VIRGEM', 'ADESIVADO']).default('VIRGEM')
type TipoEstoqueAtual = 'VIRGEM' | 'ADESIVADO'
const tabelaEstoqueAtual = (tipo: TipoEstoqueAtual) => tipo === 'ADESIVADO' ? 'bobinas_estoque' : 'bobinas_estoque_virgem'
const tabelaLixeiraEstoqueAtual = (tipo: TipoEstoqueAtual) => tipo === 'ADESIVADO' ? 'bobinas_estoque_lixeira' : 'bobinas_estoque_virgem_lixeira'

async function requireCurrentStockEditor(accessToken: string, tipo: TipoEstoqueAtual) {
  return tipo === 'ADESIVADO'
    ? await requireRebobinadeiraEditor(accessToken)
    : await requireCobrideiraEditor(accessToken)
}

export const importCurrentStockCsv = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ tipoEstoque: tipoEstoqueAtualSchema, registros: z.array(currentStockRecordSchema).min(1).max(1000) }))
  .handler(async ({ data }) => {
    const { client } = await requireCurrentStockEditor(data.accessToken, data.tipoEstoque)
    const estoque = (client as any).schema('estoque_atual')
    const tabela = tabelaEstoqueAtual(data.tipoEstoque)
    const existentes: any[] = []
    if (data.tipoEstoque === 'VIRGEM') {
      const grupos = new Map<string, { categoria: string; medidaTexto: string; codigos: string[] }>()
      for (const registro of data.registros) {
        const medidaTexto = (registro.medida_texto ?? '').trim()
        const chave = `${registro.categoria}|${medidaTexto}`
        const grupo = grupos.get(chave) ?? { categoria: registro.categoria, medidaTexto, codigos: [] }
        if (registro.codigo && !grupo.codigos.includes(registro.codigo)) grupo.codigos.push(registro.codigo)
        grupos.set(chave, grupo)
      }
      for (const grupo of grupos.values()) {
        for (let i = 0; i < grupo.codigos.length; i += 200) {
          const lote = grupo.codigos.slice(i, i + 200)
          const { data: encontrados, error } = await estoque.from(tabela)
            .select('*').eq('categoria', grupo.categoria).eq('medida_texto', grupo.medidaTexto).in('codigo', lote)
          if (error) throw new Error(`Não foi possível conferir os códigos existentes: ${error.message}`)
          existentes.push(...(encontrados ?? []))
        }
      }
    } else {
      const codigos = [...new Set(data.registros.map((r) => r.codigo).filter((v): v is string => Boolean(v)))]
      for (let i = 0; i < codigos.length; i += 200) {
        const lote = codigos.slice(i, i + 200)
        const categorias = [...new Set(data.registros.filter((r) => r.codigo && lote.includes(r.codigo)).map((r) => r.categoria))]
        for (const categoria of categorias) {
          const { data: encontrados, error } = await estoque.from(tabela).select('*').eq('categoria', categoria).in('codigo', lote)
          if (error) throw new Error(`Não foi possível conferir os códigos existentes: ${error.message}`)
          existentes.push(...(encontrados ?? []))
        }
      }
    }
    const existentesPorCodigo = new Map(existentes.map((r) => [`${r.categoria}|${data.tipoEstoque === 'VIRGEM' ? (r.medida_texto ?? '') : ''}|${r.codigo}`, r]))
    const registros = data.registros.map((r) => {
      if (data.tipoEstoque === 'VIRGEM' && !['BOPP', 'PEBD'].includes(r.categoria)) {
        throw new Error('O Estoque Atual Virgem aceita somente bobinas BOPP e PEBD.')
      }
      if (data.tipoEstoque === 'ADESIVADO' && r.categoria === 'PEBD') {
        throw new Error('PEBD é permitido somente no Estoque Atual Virgem.')
      }
      const medidaTexto = data.tipoEstoque === 'VIRGEM'
        ? (r.medida_texto ?? (r.medida == null ? '' : Number(r.medida).toFixed(2))).trim()
        : (r.medida_texto ?? '')
      const anterior = existentesPorCodigo.get(`${r.categoria}|${data.tipoEstoque === 'VIRGEM' ? medidaTexto : ''}|${r.codigo}`)
      return {
        ...anterior, ...r,
        data_entrada: r.data_entrada ?? anterior?.data_entrada ?? null,
        fornecedor: r.fornecedor ?? anterior?.fornecedor ?? null,
        medida: r.medida ?? anterior?.medida ?? null,
        medida_texto: data.tipoEstoque === 'VIRGEM' ? medidaTexto : (r.medida_texto ?? anterior?.medida_texto ?? null),
        nf: r.nf ?? anterior?.nf ?? null,
        aba: r.aba ?? anterior?.aba ?? null,
        peso_kg: r.peso_kg ?? anterior?.peso_kg ?? null,
        metragem_m: r.metragem_m ?? anterior?.metragem_m ?? null,
        cor: r.cor ?? anterior?.cor ?? null,
        cliente: r.cliente ?? anterior?.cliente ?? null,
        linha: r.linha ?? anterior?.linha ?? null,
        observacoes: r.observacoes ?? anterior?.observacoes ?? null,
        origem_arquivo: 'Importação CSV unificado',
      }
    })
    const conflito = data.tipoEstoque === 'VIRGEM' ? 'categoria,medida_texto,codigo' : 'categoria,codigo'
    const { data: gravados, error } = await estoque.from(tabela)
      .upsert(registros, { onConflict: conflito }).select('id')
    if (error) throw new Error(`Não foi possível importar o CSV: ${error.message}`)
    return { importados: gravados?.length ?? registros.length }
  })

export const listCurrentStock = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ tipoEstoque: tipoEstoqueAtualSchema }))
  .handler(async ({ data }) => {
    const { client } = await requireCurrentStockEditor(data.accessToken, data.tipoEstoque)
    const estoque = (client as any).schema('estoque_atual')
    const [bobinasResult, resumosResult, minimosVirgemResult] = await Promise.all([
      estoque.from(tabelaEstoqueAtual(data.tipoEstoque)).select('*').order('data_entrada', { ascending: false }).order('codigo'),
      data.tipoEstoque === 'ADESIVADO'
        ? estoque.from('resumo_estoque_produtos').select('*').order('categoria').order('medida_produto')
        : Promise.resolve({ data: [], error: null }),
      data.tipoEstoque === 'VIRGEM'
        ? estoque.from('vw_estoque_minimo_virgem').select('*').order('referencia')
        : Promise.resolve({ data: [], error: null }),
    ])
    if (bobinasResult.error) throw new Error(`Não foi possível carregar as bobinas do estoque: ${bobinasResult.error.message}`)
    if (resumosResult.error) throw new Error(`Não foi possível carregar o resumo do estoque: ${resumosResult.error.message}`)
    if (minimosVirgemResult.error) throw new Error(`Não foi possível carregar os indicadores de estoque mínimo virgem: ${minimosVirgemResult.error.message}`)
    return {
      bobinas: bobinasResult.data ?? [],
      resumos: resumosResult.data ?? [],
      minimosVirgem: minimosVirgemResult.data ?? [],
    }
  })

export const createCurrentStockRecord = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ tipoEstoque: tipoEstoqueAtualSchema, registro: currentStockRecordSchema }))
  .handler(async ({ data }) => {
    const { client } = await requireCurrentStockEditor(data.accessToken, data.tipoEstoque)
    if (data.tipoEstoque === 'VIRGEM' && !['BOPP', 'PEBD'].includes(data.registro.categoria)) throw new Error('O Estoque Atual Virgem aceita somente bobinas BOPP e PEBD.')
    if (data.tipoEstoque === 'ADESIVADO' && data.registro.categoria === 'PEBD') throw new Error('PEBD é permitido somente no Estoque Atual Virgem.')
    const estoque = (client as any).schema('estoque_atual')
    const registro = {
      ...data.registro,
      data_entrada: data.registro.data_entrada || null,
      medida_texto: data.tipoEstoque === 'VIRGEM'
        ? (data.registro.medida_texto ?? (data.registro.medida == null ? '' : Number(data.registro.medida).toFixed(2))).trim()
        : data.registro.medida_texto ?? null,
      ...(data.tipoEstoque === 'VIRGEM' ? { localizacao: data.registro.localizacao ?? 'ESTOQUE' } : {}),
      origem_arquivo: 'Cadastro manual no site',
    }
    const { data: created, error } = await estoque.from(tabelaEstoqueAtual(data.tipoEstoque)).insert(registro).select('*').single()
    if (error?.code === '23505') throw new Error('Já existe uma bobina com esse código. Confira o cadastro.')
    if (error) throw new Error(`Não foi possível adicionar a bobina: ${error.message}`)
    return created
  })

export const updateCurrentStockRecord = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ tipoEstoque: tipoEstoqueAtualSchema, id: z.uuid(), registro: currentStockRecordSchema }))
  .handler(async ({ data }) => {
    const { client } = await requireCurrentStockEditor(data.accessToken, data.tipoEstoque)
    if (data.tipoEstoque === 'VIRGEM' && !['BOPP', 'PEBD'].includes(data.registro.categoria)) throw new Error('O Estoque Atual Virgem aceita somente bobinas BOPP e PEBD.')
    if (data.tipoEstoque === 'ADESIVADO' && data.registro.categoria === 'PEBD') throw new Error('PEBD é permitido somente no Estoque Atual Virgem.')
    const estoque = (client as any).schema('estoque_atual')
    const registro = {
      ...data.registro,
      data_entrada: data.registro.data_entrada || null,
      medida_texto: data.tipoEstoque === 'VIRGEM'
        ? (data.registro.medida_texto ?? (data.registro.medida == null ? '' : Number(data.registro.medida).toFixed(2))).trim()
        : data.registro.medida_texto ?? null,
      ...(data.tipoEstoque === 'VIRGEM' ? { localizacao: data.registro.localizacao ?? 'ESTOQUE' } : {}),
    }
    const { data: updated, error } = await estoque.from(tabelaEstoqueAtual(data.tipoEstoque))
      .update(registro)
      .eq('id', data.id).select('*').maybeSingle()
    if (error?.code === '23505') throw new Error('Já existe outra bobina com esse código.')
    if (error) throw new Error(`Não foi possível atualizar a bobina: ${error.message}`)
    if (!updated) throw new Error('A bobina não foi encontrada. Atualize a tela e tente novamente.')
    return updated
  })

export const enviarRelatorioBug = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    area: z.string().trim().min(1).max(100),
    descricao: z.string().trim().min(10).max(5000),
    pagina: z.string().trim().max(500).optional(),
  }))
  .handler(async ({ data }) => {
    const { client, user } = await requireDeveloperOrUser(data.accessToken)
    const apiKey = process.env.RESEND_API_KEY
    const remetente = process.env.BUG_REPORT_FROM_EMAIL
    if (!apiKey || !remetente) {
      throw new Error('O envio de e-mail ainda não foi configurado no servidor. Configure RESEND_API_KEY e BUG_REPORT_FROM_EMAIL.')
    }

    const destino = 'pcp.sp@embalando.com.br'
    const nome = user.user_metadata?.full_name ?? user.email ?? 'Usuário do ERP'
    const pagina = data.pagina || 'Não informada'
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char] ?? char)
    const texto = [
      'Relato de bug - Controle Embalando',
      '',
      `Setor: ${data.area}`,
      `Usuário: ${nome} (${user.email ?? 'e-mail não informado'})`,
      `Página: ${pagina}`,
      `Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      '',
      'Descrição:',
      data.descricao,
    ].join('\\n')

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: [destino],
        reply_to: user.email ?? undefined,
        subject: `[ERP] Bug reportado - ${data.area}`,
        text: texto,
        html: `<h2>Relato de bug - Controle Embalando</h2><p><b>Setor:</b> ${escapeHtml(data.area)}</p><p><b>Usuário:</b> ${escapeHtml(String(nome))} (${escapeHtml(user.email ?? '')})</p><p><b>Página:</b> ${escapeHtml(pagina)}</p><p><b>Data:</b> ${escapeHtml(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</p><hr/><p><b>Descrição:</b></p><p style="white-space:pre-wrap">${escapeHtml(data.descricao)}</p>`,
      }),
    })
    const result = await response.json().catch(() => ({})) as { id?: string; message?: string }
    if (!response.ok) throw new Error(result.message || `O serviço de e-mail recusou o envio (HTTP ${response.status}).`)
    return { success: true, id: result.id ?? null, destino }
  })

async function requireDeveloperOrUser(accessToken: string) {
  const client = createAdminClient()
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user?.email) throw new Error('Sessão inválida. Entre novamente no ERP.')

  const [roleResult, developerResult] = await Promise.all([
    client.from('user_roles').select('user_id').eq('user_id', data.user.id).maybeSingle(),
    client.from('developer_accounts').select('email').eq('email', data.user.email.toLowerCase()).maybeSingle(),
  ])
  if (roleResult.error || developerResult.error) throw new Error('Não foi possível validar seu acesso ao ERP.')
  if (!roleResult.data && !developerResult.data) throw new Error('Seu usuário ainda não possui um perfil liberado no ERP.')
  return { client, user: data.user }
}

export const listCurrentStockTrash = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ tipoEstoque: tipoEstoqueAtualSchema }))
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const estoque = (client as any).schema('estoque_atual')
    const { data: registros, error } = await estoque.from(tabelaLixeiraEstoqueAtual(data.tipoEstoque))
      .select('*').order('excluida_em', { ascending: false })
    if (error) throw new Error(`Não foi possível carregar a lixeira do estoque: ${error.message}`)
    return registros ?? []
  })

export const moveCurrentStockToTrash = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ tipoEstoque: tipoEstoqueAtualSchema, id: z.uuid() }))
  .handler(async ({ data }) => {
    const { client, user } = await requireDeveloper(data.accessToken)
    const estoque = (client as any).schema('estoque_atual')
    const tabela = tabelaEstoqueAtual(data.tipoEstoque)
    const tabelaLixeira = tabelaLixeiraEstoqueAtual(data.tipoEstoque)
    const { data: bobina, error: readError } = await estoque.from(tabela).select('*').eq('id', data.id).maybeSingle()
    if (readError || !bobina) throw new Error('Bobina não encontrada no Estoque Atual.')
    if (!bobina.codigo) throw new Error('A bobina precisa ter um código para ser arquivada na lixeira.')
    const dadosLixeira: Record<string, unknown> = {
      bobina_id: bobina.id, categoria: bobina.categoria, codigo: bobina.codigo,
      dados: bobina, excluida_por: user.id, excluida_em: new Date().toISOString(),
    }
    const conflitoLixeira = data.tipoEstoque === 'VIRGEM' ? 'categoria,medida_texto,codigo' : 'categoria,codigo'
    if (data.tipoEstoque === 'VIRGEM') dadosLixeira.medida_texto = bobina.medida_texto ?? ''
    const { error: archiveError } = await estoque.from(tabelaLixeira).upsert(dadosLixeira, { onConflict: conflitoLixeira })
    if (archiveError) throw new Error(`Não foi possível arquivar a bobina: ${archiveError.message}`)
    const { error: deleteError, count } = await estoque.from(tabela).delete({ count: 'exact' }).eq('id', data.id)
    if (deleteError || count === 0) throw new Error(`A cópia foi guardada na lixeira, mas a bobina ativa não foi removida: ${deleteError?.message ?? 'registro não removido'}`)
    return { success: true }
  })

export const restoreCurrentStockRecord = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ tipoEstoque: tipoEstoqueAtualSchema, id: z.uuid() }))
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const estoque = (client as any).schema('estoque_atual')
    const tabela = tabelaEstoqueAtual(data.tipoEstoque)
    const tabelaLixeira = tabelaLixeiraEstoqueAtual(data.tipoEstoque)
    const { data: arquivada, error: readError } = await estoque.from(tabelaLixeira).select('*').eq('id', data.id).maybeSingle()
    if (readError || !arquivada) throw new Error('Bobina não encontrada na lixeira do estoque.')
    const { error: restoreError } = await estoque.from(tabela).insert(arquivada.dados)
    if (restoreError?.code === '23505') throw new Error('Já existe uma bobina ativa com esse código. Confira o estoque antes de restaurar.')
    if (restoreError) throw new Error(`Não foi possível restaurar a bobina: ${restoreError.message}`)
    const { error: removeError } = await estoque.from(tabelaLixeira).delete().eq('id', data.id)
    if (removeError) throw new Error(`Bobina restaurada, mas não foi possível removê-la da lixeira: ${removeError.message}`)
    return { success: true }
  })

export const permanentlyDeleteCurrentStockTrashRecord = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ tipoEstoque: tipoEstoqueAtualSchema, id: z.uuid() }))
  .handler(async ({ data }) => {
    const { client } = await requireDeveloper(data.accessToken)
    const estoque = (client as any).schema('estoque_atual')
    const { error, count } = await estoque.from(tabelaLixeiraEstoqueAtual(data.tipoEstoque))
      .delete({ count: 'exact' }).eq('id', data.id)
    if (error) throw new Error(`Não foi possível excluir definitivamente a bobina: ${error.message}`)
    if (count === 0) throw new Error('A bobina não está mais na lixeira.')
    return { success: true }
  })


const parametroEstoqueMinimoVirgemSchema = tokenInput.extend({
  referencia: z.string().trim().min(1).max(120),
  lead_time_dias: z.number().int().min(0).max(3650),
  minimo_calibrado_kg: z.number().min(0).nullable(),
  kg_bopp_por_jumbo: z.number().positive().nullable(),
})

export const listarEstoqueMinimoVirgem = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const { client } = await requireCobrideiraEditor(data.accessToken)
    const estoque = (client as any).schema('estoque_atual')
    const { data: registros, error } = await estoque.from('vw_estoque_minimo_virgem')
      .select('*').order('referencia', { ascending: true })
    if (error) throw new Error(`Não foi possível carregar o estoque mínimo virgem: ${error.message}`)
    return registros ?? []
  })

export const salvarParametroEstoqueMinimoVirgem = createServerFn({ method: 'POST' })
  .validator(parametroEstoqueMinimoVirgemSchema)
  .handler(async ({ data }) => {
    const { client } = await requireAdminOrDeveloper(data.accessToken)
    const estoque = (client as any).schema('estoque_atual')
    const { data: registro, error } = await estoque.from('parametros_estoque_minimo_virgem')
      .upsert({
        referencia: data.referencia,
        lead_time_dias: data.lead_time_dias,
        minimo_calibrado_kg: data.minimo_calibrado_kg,
        kg_bopp_por_jumbo: data.kg_bopp_por_jumbo,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'referencia' }).select('*').single()
    if (error) throw new Error(`Não foi possível salvar os parâmetros de ${data.referencia}: ${error.message}`)
    return registro
  })


const entradaColaSchema = tokenInput.extend({
  data_chegada: isoDate,
  nf: z.string().trim().min(1).max(80),
  produto: z.string().trim().min(1).max(80),
  lote: z.string().trim().min(1).max(100),
  quantidade_containers: z.number().int().positive().max(10000),
  peso_por_container_kg: z.number().positive().max(100000),
  valor_por_container: z.number().min(0).max(100000000),
  fornecedor: z.string().trim().min(1).max(160),
  observacoes: z.string().max(1000).optional(),
})

export const listarControleCola = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const { client } = await requireCobrideiraEditor(data.accessToken)
    const cola = (client as any).schema('cobrideira')
    const [entradasResult, saldoResult, historicoResult, containersResult, indicadoresResult, enviosResult] = await Promise.all([
      cola.from('estoque_cola_entradas').select('*').order('data_chegada', { ascending: false }).order('id', { ascending: false }).limit(500),
      cola.from('vw_estoque_cola_saldo').select('*').order('data_chegada', { ascending: false }).order('id', { ascending: false }).limit(500),
      cola.from('vw_historico_cola').select('*').order('data_producao', { ascending: false }).order('numero_bobina', { ascending: false }).limit(2000),
      cola.from('estoque_cola_containers').select('codigo,status,entrada_id,enviado_em,entrada:estoque_cola_entradas(data_chegada,nf,produto,lote,peso_por_container_kg,valor_por_container,fornecedor,localizacao)').order('criado_em', { ascending: false }).limit(5000),
      cola.from('vw_consumo_movel_cola').select('*').single(),
      cola.from('historico_envios_bahia').select('*').order('data_envio', { ascending: false }).order('codigo_container', { ascending: true }).limit(5000),
    ])
    for (const result of [entradasResult, saldoResult, historicoResult, containersResult, indicadoresResult, enviosResult]) {
      if (result.error) throw new Error(`Não foi possível carregar o controle de cola: ${result.error.message}`)
    }
    return {
      entradas: entradasResult.data ?? [],
      saldo: saldoResult.data ?? [],
      historico: historicoResult.data ?? [],
      containers: containersResult.data ?? [],
      indicadores: indicadoresResult.data ?? null,
      envios: enviosResult.data ?? [],
    }
  })

export const registrarEntradaCola = createServerFn({ method: 'POST' })
  .validator(entradaColaSchema)
  .handler(async ({ data }) => {
    const { client, user } = await requireCobrideiraEditor(data.accessToken)
    const { data: resultado, error } = await (client as any).schema('cobrideira').rpc('registrar_entrada_cola', {
      p_data_chegada: data.data_chegada,
      p_nf: data.nf,
      p_produto: data.produto,
      p_lote: data.lote,
      p_quantidade_containers: data.quantidade_containers,
      p_peso_por_container_kg: data.peso_por_container_kg,
      p_valor_por_container: data.valor_por_container,
      p_fornecedor: data.fornecedor,
      p_observacoes: data.observacoes ?? null,
      p_user_id: user.id,
    })
    if (error) throw new Error(`Não foi possível registrar a entrada de cola: ${error.message}`)
    return resultado as { entrada_id: number; codigos: string[] }
  })

export const retirarContainersCola = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ codigos: z.array(z.string().trim().regex(/^\d+$/, 'O código do container deve conter somente números.').max(100)).min(1).max(500) }))
  .handler(async ({ data }) => {
    const { client, user } = await requireCobrideiraEditor(data.accessToken)
    const codigos = [...new Set(data.codigos.map((codigo) => codigo.trim()).filter(Boolean))]
    if (!codigos.length) throw new Error('Informe pelo menos um código de container.')
    const { data: resultado, error } = await (client as any).schema('cobrideira').rpc('registrar_retirada_cola', {
      p_codigos: codigos,
      p_user_id: user.id,
    })
    if (error) throw new Error(`Não foi possível registrar a retirada: ${error.message}`)
    return resultado as { retirados: number; ja_enviados: string[] }
  })


const atualizarContainersColaSchema = tokenInput.extend({
  itens: z.array(z.object({
    codigo_atual: z.string().trim().regex(/^\d+$/, 'O código atual deve conter somente números.').max(100),
    codigo_novo: z.string().trim().regex(/^\d+$/, 'O novo código deve conter somente números.').max(100),
    localizacao: z.enum(['ESTOQUE', 'GALPAO_MARIO_COVAS']).optional(),
  })).min(1).max(500),
})

export const atualizarContainersCola = createServerFn({ method: 'POST' })
  .validator(atualizarContainersColaSchema)
  .handler(async ({ data }) => {
    const { client } = await requireCobrideiraEditor(data.accessToken)
    const cola = (client as any).schema('cobrideira')
    const atualizados: string[] = []
    for (const item of data.itens) {
      if (item.codigo_novo !== item.codigo_atual) {
        const { data: atual, error: consultaError } = await cola.from('estoque_cola_containers')
          .select('status').eq('codigo', item.codigo_atual).maybeSingle()
        if (consultaError) throw new Error(`Não foi possível consultar o container ${item.codigo_atual}: ${consultaError.message}`)
        if (!atual) throw new Error(`O container ${item.codigo_atual} não foi encontrado.`)
        if (atual.status !== 'DISPONIVEL') throw new Error(`Só é permitido alterar o código de containers ainda disponíveis: ${item.codigo_atual}`)
      }
      const patch = {
        ...(item.codigo_novo !== item.codigo_atual ? { codigo: item.codigo_novo } : {}),
        ...(item.localizacao ? { localizacao: item.localizacao } : {}),
      }
      if (!Object.keys(patch).length) continue
      const { data: registro, error } = await cola.from('estoque_cola_containers')
        .update(patch)
        .eq('codigo', item.codigo_atual)
        .select('codigo')
        .maybeSingle()
      if (error) throw new Error(`Não foi possível atualizar o container ${item.codigo_atual}: ${error.message}`)
      if (!registro) throw new Error(`O container ${item.codigo_atual} não foi encontrado.`)
      atualizados.push(registro.codigo)
    }
    return { atualizados }
  })

export const excluirContainersCola = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ codigos: z.array(z.string().trim().regex(/^\d+$/, 'O código do container deve conter somente números.').max(100)).min(1).max(500) }))
  .handler(async ({ data }) => {
    const { client } = await requireCobrideiraEditor(data.accessToken)
    const cola = (client as any).schema('cobrideira')
    const { data: registros, error: buscaError } = await cola.from('estoque_cola_containers')
      .select('codigo,status')
      .in('codigo', data.codigos)
    if (buscaError) throw new Error(`Não foi possível consultar os containers: ${buscaError.message}`)
    const bloqueados = (registros ?? []).filter((item: { status: string }) => ['CONSUMIDO_PRODUCAO', 'ENVIADO_BAHIA'].includes(item.status))
    if (bloqueados.length) throw new Error(`Não é possível excluir containers já utilizados ou enviados: ${bloqueados.map((item: { codigo: string }) => item.codigo).join(', ')}`)
    const { data: removidos, error } = await cola.from('estoque_cola_containers')
      .delete()
      .in('codigo', data.codigos)
      .select('codigo')
    if (error) throw new Error(`Não foi possível excluir os containers: ${error.message}`)
    return { removidos: removidos?.map((item: { codigo: string }) => item.codigo) ?? [] }
  })


export const atualizarEntradasCola = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({
    entrada_ids: z.array(z.number().int().positive()).min(1).max(500),
    atualizacoes: z.object({
      data_chegada: isoDate.optional(),
      nf: z.string().trim().min(1).max(80).optional(),
      produto: z.string().trim().min(1).max(80).optional(),
      lote: z.string().trim().min(1).max(100).optional(),
      peso_por_container_kg: z.number().positive().max(100000).optional(),
      valor_por_container: z.number().min(0).max(100000000).optional(),
      fornecedor: z.string().trim().min(1).max(160).optional(),
      localizacao: z.enum(['ESTOQUE', 'GALPAO_MARIO_COVAS']).optional(),
    }).refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar.'),
  }))
  .handler(async ({ data }) => {
    const { client } = await requireCobrideiraEditor(data.accessToken)
    const { data: atualizadas, error } = await (client as any).schema('cobrideira')
      .from('estoque_cola_entradas')
      .update(data.atualizacoes)
      .in('id', [...new Set(data.entrada_ids)])
      .select('id')
    if (error) throw new Error(`Não foi possível atualizar os dados das entradas: ${error.message}`)
    return { atualizadas: atualizadas?.map((item: { id: number }) => item.id) ?? [] }
  })


const atualizarLeadTimeConsumoColaSchema = tokenInput.extend({
  lead_time_dias: z.number().int().min(0).max(365),
})

export const atualizarLeadTimeConsumoCola = createServerFn({ method: 'POST' })
  .validator(atualizarLeadTimeConsumoColaSchema)
  .handler(async ({ data }) => {
    const { client, user } = await requireCobrideiraEditor(data.accessToken)
    const { data: registro, error } = await (client as any).schema('cobrideira')
      .from('parametros_consumo_cola')
      .update({
        lead_time_dias: data.lead_time_dias,
        atualizado_em: new Date().toISOString(),
        atualizado_por: user.id,
      })
      .eq('id', 1)
      .select('lead_time_dias')
      .single()
    if (error) throw new Error(`Não foi possível salvar o lead time do consumo de cola: ${error.message}`)
    return registro as { lead_time_dias: number }
  })
