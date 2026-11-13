import { createSign } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const PAGE_SIZE = 1000

type SheetData = {
  title: string
  rows: (string | number)[][]
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function readConfig(): {
  supabaseUrl: string
  serviceRoleKey: string
  spreadsheetId: string
  serviceAccountEmail: string
  privateKey: string
} {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!supabaseUrl || !serviceRoleKey || !spreadsheetId || !serviceAccountEmail || !privateKey) {
    throw new Error('Configuração privada do Supabase ou Google Sheets ausente.')
  }
  return { supabaseUrl, serviceRoleKey, spreadsheetId, serviceAccountEmail, privateKey }
}

export function isGoogleSheetsSyncConfigured() {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.GOOGLE_SHEETS_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  )
}

async function googleAccessToken(email: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000)
  const unsignedToken = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(
    JSON.stringify({
      iss: email,
      scope: GOOGLE_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  )}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedToken)
  const assertion = `${unsignedToken}.${signer.sign(privateKey).toString('base64url')}`
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    const responseBody = await response.text()
    let reason = responseBody
    try {
      const parsed = JSON.parse(responseBody) as { error?: string; error_description?: string }
      reason = [parsed.error, parsed.error_description].filter(Boolean).join(': ') || responseBody
    } catch {
      // Mantém a resposta original quando o Google não retornar JSON.
    }
    throw new Error(`O Google recusou a autorização (HTTP ${response.status}): ${reason.slice(0, 500)}`)
  }
  const tokenResponse: unknown = await response.json()
  if (
    !tokenResponse ||
    typeof tokenResponse !== 'object' ||
    !('access_token' in tokenResponse) ||
    typeof tokenResponse.access_token !== 'string'
  ) {
    throw new Error('O Google não retornou um token válido para a planilha.')
  }
  return tokenResponse.access_token
}

async function googleRequest<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    const responseBody = await response.text()
    let reason = responseBody
    try {
      const parsed = JSON.parse(responseBody) as { error?: { message?: string; status?: string; errors?: { reason?: string; message?: string }[] } }
      reason = [
        parsed.error?.status,
        parsed.error?.message,
        ...(parsed.error?.errors ?? []).map((item) => [item.reason, item.message].filter(Boolean).join(': ')),
      ].filter(Boolean).join(' — ') || responseBody
    } catch {
      // Mantém a resposta original quando o Google não retornar JSON.
    }
    console.error('Google Sheets API request failed:', { status: response.status, url, reason })
    throw new Error(`Falha ao atualizar a planilha Google (HTTP ${response.status}): ${reason.slice(0, 1000)}`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function allRows<T>(label: string, query: (start: number, end: number) => PromiseLike<{
  data: T[] | null
  error: { message: string; code?: string; details?: string; hint?: string } | null
}>) {
  const records: T[] = []
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await query(start, start + PAGE_SIZE - 1)
    if (error) {
      console.error('Supabase query failed while syncing Google Sheets:', {
        table: label,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      const diagnostic = [error.code, error.message, error.details, error.hint]
        .filter(Boolean)
        .join(' — ')
      throw new Error(`Falha ao consultar "${label}" no Supabase: ${diagnostic}`)
    }
    records.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return records
  }
}

function dataBR(value: string | null | undefined) {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function dataHoraBR(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function codigos(value: unknown) {
  return Object.values(asObject(value))
    .flatMap((group) => Array.isArray(group) ? group : [])
    .map(String)
    .join(', ')
}

async function loadSheetData(client: ReturnType<typeof createClient<Database>>, dataInicio?: string, dataFim?: string, numeroBobina?: string): Promise<SheetData[]> {
  const [insumos, producoes, tubetes, logs, bobinas] = await Promise.all([
    allRows('insumos_rolos', (start, end) =>
      client.from('insumos_rolos').select('*').order('data_registro').order('id_codigo').range(start, end),
    ),
    allRows('producao_tubos', (start, end) =>
      client.from('producao_tubos').select('*').order('data').order('id').range(start, end),
    ),
    allRows('lotes_tubete', (start, end) =>
      client.from('lotes_tubete').select('*').order('data_producao').order('id').range(start, end),
    ),
    allRows('stock_operation_logs', (start, end) =>
      client.from('stock_operation_logs').select('*').order('id', { ascending: false }).range(start, end),
    ),
    allRows('cobrideira.bobinas', (start, end) => {
      let query = client.schema('cobrideira').from('bobinas').select('*')
      if (numeroBobina) query = query.eq('numero_bobina', numeroBobina)
      if (dataInicio) {
        query = query.gte('created_at', new Date(`${dataInicio}T00:00:00-03:00`).toISOString())
      }
      if (dataFim) {
        const exclusiveEnd = new Date(`${dataFim}T00:00:00-03:00`)
        exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
        query = query.lt('created_at', exclusiveEnd.toISOString())
      }
      return query.order('created_at').order('numero_bobina').range(start, end)
    }),
  ])

  const rollRows: (string | number)[][] = [[
    'Tipo', 'Código', 'Medida / categoria', 'Peso líquido (kg)', 'Validade',
    'Data de registro', 'Peso alterado',
  ]]
  for (const row of insumos) {
    rollRows.push([
      row.tipo === 'ROTULO' ? 'Rótulo' : 'Capa',
      row.id_codigo,
      row.medida_categoria,
      Number(row.peso_liq_kg),
      row.validade ?? '',
      dataBR(row.data_registro),
      row.peso_alterado ? 'Sim' : 'Não',
    ])
  }

  const tubeRows: (string | number)[][] = [[
    'ID', 'Data', 'Medida', 'Espessura', 'Capa', 'Operador', 'Carrinhos',
    'Tubos por carrinho', 'Containers', 'Tubos por container',
    'Total produzido', 'Perda (kg)', 'Códigos',
  ]]
  for (const row of producoes) {
    tubeRows.push([
      row.id,
      dataBR(row.data),
      row.tubo,
      row.espessura,
      row.capa,
      row.operador,
      row.quantidade_carrinhos,
      row.tubos_por_carrinho,
      row.quantidade_containers,
      row.tubos_por_container,
      row.quantidade_tubos,
      Number(row.perda),
      codigos(row.codigos),
    ])
  }

  const tubeteRows: (string | number)[][] = [[
    'ID', 'Data da produção', 'Medida', 'Cor', 'Caixas',
    'Unidades por caixa', 'Total de tubetes', 'Perda (kg)', 'Operador',
  ]]
  for (const row of tubetes) {
    tubeteRows.push([
      row.id,
      dataBR(row.data_producao),
      row.medida,
      row.cor,
      row.caixas,
      row.unidades_por_caixa,
      row.caixas * row.unidades_por_caixa,
      Number(row.perda_kg),
      row.operador,
    ])
  }

  const bobinaHeaders = [
    'Número da bobina', 'Código da bobina', 'Data', 'Aba / período', 'Material',
    'Largura', 'Peso bruto (kg)', 'Peso final (kg)', 'Peso cilindro (kg)',
    'Peso líquido (kg)', 'Metragem', 'Perda (kg)', 'Fornecedor do filme',
    'Vareta (g)', 'Cola (kg)', 'Lote da cola', 'Código interno',
    'Fornecedor da cola', 'Turno', 'Linha', 'Cor de fundo', 'Pigmento (kg)',
    'Cor da mistura', 'Pigmento da mistura', 'Cliente', 'Cor de impressão',
    'Emenda', 'Código da emenda', 'Criado por', 'Criado em',
  ]
  const bobinaRows: (string | number)[][] = [bobinaHeaders]
  for (const row of bobinas) {
    bobinaRows.push([
      row.numero_bobina, row.cod_bob, dataBR(row.data), row.aba, row.material,
      Number(row.largura), Number(row.peso_bruto), Number(row.peso_final),
      Number(row.peso_cilindro), Number(row.peso_liquido), Number(row.metragem),
      Number(row.perda_kg), row.fornecedor_filme, Number(row.vareta_g),
      Number(row.kg_cola), row.lote_cola, row.codigo_interno, row.fornecedor_cola,
      row.turno, row.linha, row.cor_fundo, Number(row.pigmento_kg),
      row.cor_mistura, row.pigmento_mistura, row.cliente, row.cor_impressao,
      row.emenda ? 'Sim' : 'Não', row.codigo_emenda, row.created_by,
      dataHoraBR(row.created_at),
    ].map((value) => value === null || value === undefined ? '' : value))
  }

  const bobinaSheets = new Map<string, (string | number)[][]>()
  for (let index = 0; index < bobinas.length; index += 1) {
    const periodo = String(bobinas[index].aba ?? '').trim() || 'Sem período'
    // O Google Sheets não permite "/" no nome da guia; NOV/2026 vira NOV-2026.
    const title = periodo.replace(/[\\/:?*\[\]]/g, '-').slice(0, 100) || 'Sem período'
    if (!bobinaSheets.has(title)) bobinaSheets.set(title, [bobinaHeaders])
    bobinaSheets.get(title)!.push(bobinaRows[index + 1])
  }

  const historyRows: (string | number)[][] = [[
    'Data e hora (São Paulo)', 'Ação', 'Entidade', 'ID do registro',
    'Quantidade', 'Códigos', 'Operador', 'Responsável', 'Detalhes',
  ]]
  for (const log of logs) {
    historyRows.push([
      dataHoraBR(log.ocorrido_em),
      log.acao,
      log.entidade,
      log.registro_id,
      Number(log.quantidade),
      log.codigos.join(', '),
      log.operador,
      log.ator_email ?? '',
      JSON.stringify(log.detalhes),
    ])
  }

  const rolosAtivos = insumos.length
  const rotulos = insumos.filter((item) => item.tipo === 'ROTULO')
  const capas = insumos.filter((item) => item.tipo === 'CAPA')
  const pesoRotulos = rotulos.reduce((total, item) => total + Number(item.peso_liq_kg), 0)
  const pesoCapas = capas.reduce((total, item) => total + Number(item.peso_liq_kg), 0)
  const totalTubos = producoes.reduce((total, item) => total + item.quantidade_tubos, 0)
  const perdaTubos = producoes.reduce((total, item) => total + Number(item.perda), 0)
  const totalTubetes = tubetes.reduce(
    (total, item) => total + item.caixas * item.unidades_por_caixa,
    0,
  )
  const dashboardRows: (string | number)[][] = [
    ['Indicador', 'Valor'],
    ['Rótulos disponíveis (rolos)', rotulos.length],
    ['Peso de rótulos disponível (kg)', Number(pesoRotulos.toFixed(3))],
    ['Capas disponíveis (rolos)', capas.length],
    ['Peso de capas disponível (kg)', Number(pesoCapas.toFixed(3))],
    ['Total de rolos disponíveis', rolosAtivos],
    ['Tubos produzidos', totalTubos],
    ['Lançamentos de produção de tubos', producoes.length],
    ['Perda na produção de tubos (kg)', Number(perdaTubos.toFixed(3))],
    ['Tubetes produzidos', totalTubetes],
    ['Caixas de tubetes', tubetes.reduce((total, item) => total + item.caixas, 0)],
    ['Registros no histórico', logs.length],
    ['Última sincronização (São Paulo)', dataHoraBR(new Date().toISOString())],
    ['', ''],
    ['Produção por medida', 'Tubos produzidos'],
  ]
  const tubosPorMedida = new Map<string, number>()
  for (const item of producoes) {
    tubosPorMedida.set(item.tubo, (tubosPorMedida.get(item.tubo) ?? 0) + item.quantidade_tubos)
  }
  for (const [medida, quantidade] of [...tubosPorMedida].sort(([left], [right]) =>
    left.localeCompare(right, 'pt-BR', { numeric: true }),
  )) {
    dashboardRows.push([medida, quantidade])
  }

  return [
    { title: 'Dashboard', rows: dashboardRows },
    { title: 'Rótulos e Capas', rows: rollRows },
    { title: 'Tubos', rows: tubeRows },
    { title: 'Tubetes', rows: tubeteRows },
    { title: 'Histórico', rows: historyRows },
    ...Array.from(bobinaSheets, ([title, rows]) => ({ title, rows })),
  ]
}

export async function syncGoogleSheets(dataInicio?: string, dataFim?: string, numeroBobina?: string) {
  const config = readConfig()
  const client = createClient<Database>(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const [token, allSheets] = await Promise.all([
    googleAccessToken(config.serviceAccountEmail, config.privateKey),
    loadSheetData(client, dataInicio, dataFim, numeroBobina),
  ])
  // A sincronização manual com intervalo de datas altera somente as guias de bobinas.
  // A rotina automática sem intervalo continua atualizando as demais guias normalmente.
  const sheets = numeroBobina || (dataInicio && dataFim)
    ? allSheets.filter((sheet) => sheet.rows[0]?.[0] === 'Número da bobina')
    : allSheets
  if ((numeroBobina || (dataInicio && dataFim)) && !sheets.length) {
    const criterio = numeroBobina ? `para o número ${numeroBobina}` : `entre ${dataInicio} e ${dataFim}`
    throw new Error(`Não há bobinas cadastradas ${criterio}. Nenhuma guia foi atualizada.`)
  }
  const spreadsheetUrl = `${GOOGLE_SHEETS_API}/${encodeURIComponent(config.spreadsheetId)}`
  const getMetadata = () => googleRequest<{
    sheets: {
      properties: {
        sheetId: number
        title: string
        gridProperties: { rowCount: number; columnCount: number }
      }
    }[]
  }>(`${spreadsheetUrl}?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`, token)
  const metadata = await getMetadata()
  const existingTitles = new Set(metadata.sheets.map((sheet) => sheet.properties.title))
  const bobinaSheetTitles = new Set(sheets
    .filter((sheet) => sheet.rows[0]?.[0] === 'Número da bobina')
    .map((sheet) => sheet.title))
  const missingBobinaSheets = [...bobinaSheetTitles].filter((title) => !existingTitles.has(title))
  if (missingBobinaSheets.length) {
    throw new Error(`A aba de destino ${missingBobinaSheets.join(', ')} não existe na planilha. Crie a aba com esse nome antes de sincronizar.`)
  }
  const missingSheets = sheets
    .filter((sheet) => !existingTitles.has(sheet.title) && !bobinaSheetTitles.has(sheet.title))
    .map((sheet) => ({ addSheet: { properties: { title: sheet.title } } }))
  if (missingSheets.length) {
    await googleRequest(`${spreadsheetUrl}:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({ requests: missingSheets }),
    })
  }
  const refreshedMetadata = missingSheets.length ? await getMetadata() : metadata

  for (const sheet of sheets) {
    const escapedTitle = sheet.title.replace(/'/g, "''")
    const columnLetter = (column: number) => {
      let result = ''
      while (column > 0) {
        const remainder = (column - 1) % 26
        result = String.fromCharCode(65 + remainder) + result
        column = Math.floor((column - 1) / 26)
      }
      return result
    }

    // Bobinas: nunca limpar/regravar a guia. Acrescentar apenas números ainda ausentes,
    // respeitando a ordem real dos cabeçalhos já existentes.
    if (bobinaSheetTitles.has(sheet.title)) {
      const readRange = `'${escapedTitle}'!A:AZ`
      const existing = await googleRequest<{ values?: (string | number)[][] }>(
        `${spreadsheetUrl}/values/${encodeURIComponent(readRange)}`,
        token,
      )
      const existingRows = existing.values ?? []
      if (!existingRows.length) {
        throw new Error(`A aba ${sheet.title} está vazia e não possui cabeçalho. Insira os cabeçalhos antes de sincronizar.`)
      }
      const headers = existingRows[0].map((value) => String(value ?? '').trim().toLocaleLowerCase('pt-BR'))
      const numberColumn = headers.indexOf('número da bobina')
      if (numberColumn < 0) {
        throw new Error(`Não encontrei a coluna "Número da bobina" na aba ${sheet.title}.`)
      }
      const sourceHeaders = sheet.rows[0].map((value) => String(value).trim().toLocaleLowerCase('pt-BR'))
      const sourceNumberIndex = sourceHeaders.indexOf('número da bobina')
      const knownNumbers = new Set(existingRows.slice(1)
        .map((row) => String(row[numberColumn] ?? '').trim())
        .filter(Boolean))
      let lastUsedRow = existingRows.reduce((last, row, index) =>
        row.some((value) => String(value ?? '').trim() !== '') ? index + 1 : last, 1)
      for (const sourceRow of sheet.rows.slice(1)) {
        const number = String(sourceRow[sourceNumberIndex] ?? '').trim()
        if (!number || knownNumbers.has(number)) continue
        const alignedRow = headers.map((header) => {
          const sourceIndex = sourceHeaders.indexOf(header)
          return sourceIndex < 0 ? '' : sourceRow[sourceIndex] ?? ''
        })
        lastUsedRow += 1
        const targetRange = `'${escapedTitle}'!A${lastUsedRow}:${columnLetter(Math.max(1, headers.length))}${lastUsedRow}`
        await googleRequest(
          `${spreadsheetUrl}/values/${encodeURIComponent(targetRange)}?valueInputOption=RAW`,
          token,
          { method: 'PUT', body: JSON.stringify({ majorDimension: 'ROWS', values: [alignedRow] }) },
        )
        const sheetId = refreshedMetadata.sheets.find(
          (entry) => entry.properties.title === sheet.title,
        )?.properties.sheetId
        if (sheetId !== undefined && lastUsedRow > 2) {
          await googleRequest(`${spreadsheetUrl}:batchUpdate`, token, {
            method: 'POST',
            body: JSON.stringify({ requests: [{
              copyPaste: {
                source: { sheetId, startRowIndex: lastUsedRow - 2, endRowIndex: lastUsedRow - 1, startColumnIndex: 0, endColumnIndex: headers.length },
                destination: { sheetId, startRowIndex: lastUsedRow - 1, endRowIndex: lastUsedRow, startColumnIndex: 0, endColumnIndex: headers.length },
                pasteType: 'PASTE_FORMAT',
                pasteOrientation: 'NORMAL',
              },
            }] }),
          })
        }
        knownNumbers.add(number)
      }
      continue
    }

    const lastColumn = columnLetter(Math.max(1, ...sheet.rows.map((row) => row.length)))
    const clearRange = `'${escapedTitle}'!A:${lastColumn}`
    await googleRequest(
      `${spreadsheetUrl}/values/${encodeURIComponent(clearRange)}:clear`,
      token,
      { method: 'POST', body: JSON.stringify({}) },
    )
    for (let offset = 0; offset < sheet.rows.length; offset += 500) {
      const values = sheet.rows.slice(offset, offset + 500)
      const lastColumn = Math.max(1, ...values.map((row) => row.length))
      const columnLetter = (column: number) => {
        let result = ''
        while (column > 0) {
          const remainder = (column - 1) % 26
          result = String.fromCharCode(65 + remainder) + result
          column = Math.floor((column - 1) / 26)
        }
        return result
      }
      const range = `'${escapedTitle}'!A${offset + 1}:${columnLetter(lastColumn)}${offset + values.length}`
      await googleRequest(
        `${spreadsheetUrl}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        token,
        {
          method: 'PUT',
          body: JSON.stringify({ majorDimension: 'ROWS', values }),
        },
      )
    }
  }
  const layoutRequests = numeroBobina ? [] : sheets.flatMap((sheet) => {
    const sheetMetadata = refreshedMetadata.sheets.find(
      (entry) => entry.properties.title === sheet.title,
    )?.properties
    if (!sheetMetadata) throw new Error(`A guia ${sheet.title} não foi encontrada na planilha.`)
    const { sheetId } = sheetMetadata
    const usedColumns = Math.max(1, ...sheet.rows.map((row) => row.length))
    const requests: Record<string, unknown>[] = [{
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
            rowCount: Math.max(sheetMetadata.gridProperties.rowCount, sheet.rows.length, 1000),
            columnCount: Math.max(sheetMetadata.gridProperties.columnCount, 26),
          },
        },
        fields: 'gridProperties.frozenRowCount,gridProperties.rowCount,gridProperties.columnCount',
      },
    }]
    if (sheet.title !== 'Dashboard') {
      requests.push({
        setBasicFilter: {
          filter: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: Math.max(sheet.rows.length, 1),
              startColumnIndex: 0,
              endColumnIndex: usedColumns,
            },
          },
        },
      })
    }
    return requests
  })
  if (layoutRequests.length) {
    await googleRequest(`${spreadsheetUrl}:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({ requests: layoutRequests }),
    })
  }
  return { syncedSheets: sheets.length, historyRows: historyRows.length - 1, bobinaRows: bobinas.length }
}
