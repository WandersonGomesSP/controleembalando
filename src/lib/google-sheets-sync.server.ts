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
  const spreadsheetId = '16PAFRIpkoPP5sU-lCOPLIOjzuK7JrHbHuU1CRIhTsig'
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




async function loadSheetData(
  client: ReturnType<typeof createClient<Database>>,
  dataInicio?: string,
  dataFim?: string,
  numeroBobina?: string,
): Promise<SheetData[]> {
  // Esta planilha é exclusiva da Cobrideira. Não consulta dados da Tubeteira,
  // estoque geral, produção de tubos ou histórico operacional.
  const bobinas = await allRows('cobrideira.bobinas', (start, end) =>
    client.schema('cobrideira').from('bobinas').select('*')
      .order('created_at').order('numero_bobina').range(start, end),
  )
  const inicioFiltro = dataInicio ? new Date(`${dataInicio}T00:00:00-03:00`).getTime() : null
  const fimFiltro = dataFim ? new Date(`${dataFim}T00:00:00-03:00`) : null
  if (fimFiltro) fimFiltro.setUTCDate(fimFiltro.getUTCDate() + 1)
  const selecionadas = bobinas.filter((row) => {
    if (numeroBobina) return row.numero_bobina === numeroBobina
    const criadoEm = new Date(row.created_at).getTime()
    return (inicioFiltro === null || criadoEm >= inicioFiltro) &&
      (fimFiltro === null || criadoEm < fimFiltro.getTime())
  })

  const headers = [
    'DATA', 'N° BOB.', 'MATERIAL', 'LARGURA (MM)', 'MICRAGEM',
    'PESO BRUTO BOB.', '', 'PERDA (KG)', 'FORNEC. FILME', 'COD. BOBINA',
    'GRAM. VARETA (G)', '(KG) COLA TOT. UTILZ.', 'LOTE COLA', 'FORNEC. COLA',
    'CÓD. INTERNO COLA', 'LINHA BOB.', 'COR PRINCIPAL', 'PIGMENTO PRINCIPAL (KG)',
    'COR SECUND. (MISTURA)', 'PIGMENTO MISTURA (KG)', 'CLIENTE / MODELO',
    'TURNO', 'COMP. ADESIVADO (M)', 'EMENDA', 'COD. BOB. EMENDA',
    'PESO DO CILINDRO (KG)', 'PESO FINAL BOB. (KG)', 'PESO LÍQ. (KG)',
  ]
  const linhasPorAba = new Map<string, (string | number)[][]>()
  const codigosComPesoBruto = new Set<string>()
  for (const row of selecionadas) {
    const periodo = String(row.aba ?? '').trim() || 'Sem período'
    const title = periodo.replace(/[:?*\\[\\]\\\\]/g, '-').slice(0, 100) || 'Sem período'
    if (!linhasPorAba.has(title)) linhasPorAba.set(title, [headers])
    const codigo = String(row.cod_bob ?? '').trim().toLocaleUpperCase('pt-BR')
    const pesoBruto = !codigo || codigosComPesoBruto.has(codigo) ? '' : Number(row.peso_bruto)
    if (codigo && Number(row.peso_bruto) > 0) codigosComPesoBruto.add(codigo)
    linhasPorAba.get(title)!.push([
      dataBR(row.data), row.numero_bobina, row.material, Number(row.largura), Number(row.micragem),
      pesoBruto, '', Number(row.perda_kg), row.fornecedor_filme, row.cod_bob,
      Number(row.vareta_g), Number(row.kg_cola), row.lote_cola, row.fornecedor_cola,
      row.codigo_interno, row.linha, row.cor_fundo, Number(row.pigmento_kg),
      row.cor_mistura, row.pigmento_mistura, row.cliente, row.turno, Number(row.metragem),
      row.emenda ? 'Sim' : 'Não', row.codigo_emenda, Number(row.peso_cilindro),
      Number(row.peso_final), Number(row.peso_liquido),
    ].map((value) => value === null || value === undefined ? '' : value))
  }
  return Array.from(linhasPorAba, ([title, rows]) => ({ title, rows }))
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
    ? allSheets.filter((sheet) => sheet.rows[0]?.[1] === 'N° BOB.')
    : allSheets
  if ((numeroBobina || (dataInicio && dataFim)) && !sheets.length) {
    const criterio = numeroBobina ? `para o número ${numeroBobina}` : `entre ${dataInicio} e ${dataFim}`
    throw new Error(`Não há bobinas cadastradas ${criterio}. Nenhuma guia foi atualizada.`)
  }
  const spreadsheetUrl = `${GOOGLE_SHEETS_API}/${encodeURIComponent(config.spreadsheetId)}`
  const getMetadata = () => googleRequest<{
    properties?: { title?: string }
    sheets: {
      properties: {
        sheetId: number
        title: string
        gridProperties: { rowCount: number; columnCount: number }
      }
    }[]
  }>(`${spreadsheetUrl}?fields=properties(title),sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`, token)
  const metadata = await getMetadata()
  const existingTitles = new Set(metadata.sheets.map((sheet) => sheet.properties.title))
  const bobinaSheetTitles = new Set(sheets
    .filter((sheet) => sheet.rows[0]?.[1] === 'N° BOB.')
    .map((sheet) => sheet.title))
  // Cria automaticamente qualquer guia ausente, inclusive as guias de bobinas
  // definidas pelo período no cadastro (ex.: Nov/26).
  const missingSheets = sheets
    .filter((sheet) => !existingTitles.has(sheet.title))
    .map((sheet) => ({ addSheet: { properties: { title: sheet.title } } }))
  if (missingSheets.length) {
    await googleRequest(`${spreadsheetUrl}:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({ requests: missingSheets }),
    })
  }
  const refreshedMetadata = missingSheets.length ? await getMetadata() : metadata
  const bobinaSyncLog: { numeroBobina: string; guia: string; linha: number; status: 'inserida' | 'já existia' }[] = []
  const newlyCreatedTitles = new Set(missingSheets.map((request) =>
    (request as { addSheet: { properties: { title: string } } }).addSheet.properties.title
  ))
  // Lê as guias mensais existentes para impedir que o peso da mesma bobina crua
  // seja repetido em outra guia quando a sincronização for feita em etapas.
  const existingRowsByTitle = new Map<string, (string | number)[][]>()
  const codigosComPesoNaPlanilha = new Set<string>()
  const normalizeHeader = (value: unknown) => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '').trim()
  const titlesToCheck = refreshedMetadata.sheets
    .map((entry) => entry.properties.title)
    .filter((title) => bobinaSheetTitles.has(title) || /^[A-Za-zÀ-ÿ]{3}\/\d{2}$/.test(title))
  for (const title of titlesToCheck) {
    const readRange = `'${title.replace(/'/g, "''")}'!A:AZ`
    const existing = await googleRequest<{ values?: (string | number)[][] }>(
      `${spreadsheetUrl}/values/${encodeURIComponent(readRange)}`,
      token,
    )
    const rows = existing.values ?? []
    existingRowsByTitle.set(title, rows)
    if (!rows.length) continue
    const headers = rows[0].map(normalizeHeader)
    const codeColumn = headers.indexOf(normalizeHeader('COD. BOBINA'))
    const grossColumn = headers.indexOf(normalizeHeader('PESO BRUTO BOB.'))
    if (codeColumn < 0 || grossColumn < 0) continue
    for (const row of rows.slice(1)) {
      const codigo = String(row[codeColumn] ?? '').trim().toLocaleUpperCase('pt-BR')
      if (codigo && Number(row[grossColumn]) > 0) codigosComPesoNaPlanilha.add(codigo)
    }
  }
  const bobinaTemplate = refreshedMetadata.sheets.find((entry) =>
    /^[A-Za-zÀ-ÿ]{3}\/\d{2}$/.test(entry.properties.title) &&
    !newlyCreatedTitles.has(entry.properties.title)
  )

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
      let existingRows = existingRowsByTitle.get(sheet.title) ?? []
      if (!existingRows.length) {
        // Guia recém-criada: inicializa somente o cabeçalho antes de acrescentar os registros.
        const headerRange = `'${escapedTitle}'!A1:${columnLetter(sheet.rows[0].length)}1`
        await googleRequest(
          `${spreadsheetUrl}/values/${encodeURIComponent(headerRange)}?valueInputOption=RAW`,
          token,
          { method: 'PUT', body: JSON.stringify({ majorDimension: 'ROWS', values: [sheet.rows[0]] }) },
        )
        existingRows = [sheet.rows[0]]
        // Guia nova: replica o formato do cabeçalho e da primeira linha de dados
        // de uma guia de bobinas existente, sem copiar nenhum valor.
        const destination = refreshedMetadata.sheets.find((entry) => entry.properties.title === sheet.title)
        if (destination && bobinaTemplate) {
          await googleRequest(`${spreadsheetUrl}:batchUpdate`, token, {
            method: 'POST',
            body: JSON.stringify({ requests: [0, 1].map((rowIndex) => ({
              copyPaste: {
                source: { sheetId: bobinaTemplate.properties.sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: sheet.rows[0].length },
                destination: { sheetId: destination.properties.sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: sheet.rows[0].length },
                pasteType: 'PASTE_FORMAT',
                pasteOrientation: 'NORMAL',
              },
            })) }),
          })
        }
      }
      const headers = existingRows[0].map(normalizeHeader)
      const numberColumn = headers.indexOf(normalizeHeader('N° BOB.'))
      if (numberColumn < 0) {
        throw new Error(`Não encontrei a coluna "Número da bobina" na aba ${sheet.title}.`)
      }
      const sourceHeaders = sheet.rows[0].map(normalizeHeader)
      const sourceNumberIndex = sourceHeaders.indexOf(normalizeHeader('N° BOB.'))
      const knownNumbers = new Map<string, number>()
      existingRows.slice(1).forEach((row, index) => {
        const number = String(row[numberColumn] ?? '').trim()
        if (number) knownNumbers.set(number, index + 2)
      })
      let lastUsedRow = existingRows.reduce((last, row, index) =>
        row.some((value) => String(value ?? '').trim() !== '') ? index + 1 : last, 1)
      for (const sourceRow of sheet.rows.slice(1)) {
        const number = String(sourceRow[sourceNumberIndex] ?? '').trim()
        if (!number) continue
        const existingLine = knownNumbers.get(number)
        if (existingLine) {
          bobinaSyncLog.push({ numeroBobina: number, guia: sheet.title, linha: existingLine, status: 'já existia' })
          continue
        }
        const alignedRow = headers.map((header) => {
          const sourceIndex = sourceHeaders.indexOf(header)
          return sourceIndex < 0 ? '' : sourceRow[sourceIndex] ?? ''
        })
        const codeColumn = headers.indexOf(normalizeHeader('COD. BOBINA'))
        const grossColumn = headers.indexOf(normalizeHeader('PESO BRUTO BOB.'))
        const codigoBruto = codeColumn < 0 ? '' : String(alignedRow[codeColumn] ?? '').trim().toLocaleUpperCase('pt-BR')
        if (codigoBruto && grossColumn >= 0) {
          if (codigosComPesoNaPlanilha.has(codigoBruto)) {
            // O peso bruto já foi registrado em outra bobina/guia.
            alignedRow[grossColumn] = ''
          } else if (Number(alignedRow[grossColumn]) > 0) {
            // Preserva o peso da primeira bobina deste código; as próximas ficam vazias.
            codigosComPesoNaPlanilha.add(codigoBruto)
          }
        }
        lastUsedRow += 1
        const targetRange = `'${escapedTitle}'!A${lastUsedRow}:${columnLetter(Math.max(1, headers.length))}${lastUsedRow}`
        // Antes de escrever, copia somente a formatação da linha imediatamente anterior.
        const targetSheet = refreshedMetadata.sheets.find((entry) => entry.properties.title === sheet.title)
        if (targetSheet && lastUsedRow > 2) {
          await googleRequest(`${spreadsheetUrl}:batchUpdate`, token, {
            method: 'POST',
            body: JSON.stringify({ requests: [{
              copyPaste: {
                source: { sheetId: targetSheet.properties.sheetId, startRowIndex: lastUsedRow - 2, endRowIndex: lastUsedRow - 1, startColumnIndex: 0, endColumnIndex: headers.length },
                destination: { sheetId: targetSheet.properties.sheetId, startRowIndex: lastUsedRow - 1, endRowIndex: lastUsedRow, startColumnIndex: 0, endColumnIndex: headers.length },
                pasteType: 'PASTE_FORMAT',
                pasteOrientation: 'NORMAL',
              },
            }] }),
          })
        } else if (targetSheet && lastUsedRow === 2 && bobinaTemplate) {
          await googleRequest(`${spreadsheetUrl}:batchUpdate`, token, {
            method: 'POST',
            body: JSON.stringify({ requests: [{
              copyPaste: {
                source: { sheetId: bobinaTemplate.properties.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: headers.length },
                destination: { sheetId: targetSheet.properties.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: headers.length },
                pasteType: 'PASTE_FORMAT',
                pasteOrientation: 'NORMAL',
              },
            }] }),
          })
        }
        await googleRequest(
          `${spreadsheetUrl}/values/${encodeURIComponent(targetRange)}?valueInputOption=RAW`,
          token,
          { method: 'PUT', body: JSON.stringify({ majorDimension: 'ROWS', values: [alignedRow] }) },
        )
        // A sincronização individual altera somente os valores da nova linha.
        // Não tenta copiar formatação, o que pode ser bloqueado em guias protegidas.
        knownNumbers.set(number, lastUsedRow)
        bobinaSyncLog.push({ numeroBobina: number, guia: sheet.title, linha: lastUsedRow, status: 'inserida' })
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
  const historyRows = Math.max(0, (allSheets.find((sheet) => sheet.title === 'Histórico')?.rows.length ?? 1) - 1)
  const bobinaRows = allSheets
    .filter((sheet) => sheet.rows[0]?.[1] === 'N° BOB.')
    .reduce((total, sheet) => total + Math.max(0, sheet.rows.length - 1), 0)
  return {
    syncedSheets: sheets.length,
    spreadsheetName: refreshedMetadata.properties?.title ?? metadata.properties?.title ?? 'Planilha Google Sheets',
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`,
    historyRows,
    bobinaRows,
    guiasCriadas: missingSheets.map((request) => (request as { addSheet: { properties: { title: string } } }).addSheet.properties.title),
    logBobinas: bobinaSyncLog,
  }
}
