import type { CobrideiraBobinaRow } from '@/lib/database.types'

function hex(value: string) {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 63
    return (code <= 255 ? code : 63).toString(16).padStart(2, '0')
  }).join('').toUpperCase()
}

function width(text: string, size: number) {
  return Array.from(text).reduce((sum, char) => {
    const factor = char === ' ' ? 0.278 : 'ilI.,:;!|'.includes(char) ? 0.278 : 'MW@%'.includes(char) ? 0.82 : 'frt()[]'.includes(char) ? 0.35 : 0.56
    return sum + factor * size
  }, 0)
}

function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))
}

function buildPdf(bobina: CobrideiraBobinaRow) {
  const page = 340.16 // 12 cm
  const margin = 20 // cerca de 7 mm de margem de segurança para a Argox
  const usable = page - margin * 2
  const navy = '0.02 0.12 0.30'
  const blue = '0.02 0.38 0.72'
  const commands: string[] = []

  const text = (value: string, x: number, y: number, size: number, bold: boolean, color: string) => {
    commands.push(color + ' rg BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf 1 0 0 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Tm <' + hex(value) + '> Tj ET')
  }
  const centered = (value: string, x: number, y: number, w: number, size: number, color: string) => {
    const fitted = Math.min(size, (w - 8) / Math.max(width(value, 1), 1))
    text(value, x + (w - width(value, fitted)) / 2, y, fitted, true, color)
  }
  const rect = (x: number, y: number, w: number, h: number, fill: string) => {
    commands.push(fill + ' rg ' + x + ' ' + y + ' ' + w + ' ' + h + ' re f')
    commands.push(navy + ' RG 0.8 w ' + x + ' ' + y + ' ' + w + ' ' + h + ' re S')
  }
  const card = (x: number, y: number, w: number, h: number, title: string, value: string, important = false) => {
    const head = 9
    rect(x, y, w, h, '1 1 1')
    rect(x, y + h - head, w, head, important ? blue : navy)
    centered(title.toUpperCase(), x + 2, y + h - 6.5, w - 4, 5.8, '1 1 1')
    centered(value, x + 3, y + (h - head) / 2 - 1.8, w - 6, important ? 11 : 8.2, '0 0 0')
  }

  const line = String(bobina.linha || 'Padrão')
  const personalizada = /personalizada/i.test(line)
  const hasEmenda = Boolean(bobina.emenda)
  const date = bobina.data ? new Date(String(bobina.data) + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const shift = String(bobina.turno || '').replace(/\s*TURNO\s*/i, '').trim() || '—'
  const cor = String(bobina.cor_fundo || '—').trim() || '—'
  const mix = [bobina.cor_mistura, bobina.pigmento_mistura].map((v) => String(v || '').trim()).filter(Boolean)
  const pigment = mix.length ? mix.join(' / ') : (/^cristal$/i.test(cor) ? '—' : cor)
  const glue = String(bobina.fornecedor_cola || '').trim() || (Number(bobina.kg_cola) > 0 ? money(bobina.kg_cola) + ' kg' : '—')
  const fmt = (v: unknown) => String(v ?? '').trim() || '—'

  // Marca própria e cabeçalho com o número da bobina em primeiro plano.
  rect(margin, page - margin - 31, 31, 31, navy)
  centered('CE', margin, page - margin - 19, 31, 13, '1 1 1')
  text('CONTROLE', margin + 37, page - margin - 12, 8.5, true, navy)
  text('EMBALANDO', margin + 37, page - margin - 23, 8.5, true, navy)
  text('PCP  |  IDENTIFICACAO DE BOBINA', margin + 37, page - margin - 30, 4.4, true, blue)
  const numberX = margin + 132
  const numberW = usable - 132
  card(numberX, page - margin - 31, numberW, 31, 'Número da bobina', fmt(bobina.numero_bobina), true)

  let y = page - margin - 36
  const gap = 4
  const half = (usable - gap) / 2
  card(margin, y - 20, half, 20, 'Data da produção', date)
  card(margin + half + gap, y - 20, half, 20, 'Operador / turno', fmt(bobina.operador) + ' / ' + shift)
  y -= 25

  const metricW = (usable - 5) / 2
  card(margin, y - 35, metricW, 35, 'Metragem total adesivado (m)', Number(bobina.metragem || 0).toLocaleString('pt-BR'), true)
  card(margin + metricW + 5, y - 35, metricW, 35, 'Peso total adesivado (kg)', money(bobina.peso_final) + ' kg', true)
  y -= 40

  const fields: Array<[string, string]> = [
    ['Medida da bobina (mm)', fmt(bobina.largura)],
    ['Micragem', fmt(bobina.micragem)],
    ['Código da bobina', fmt(bobina.cod_bob)],
    ['Peso da bobina (kg)', money(bobina.peso_bruto)],
    ['Fornecedor do filme', fmt(bobina.fornecedor_filme)],
    ['Metragem produzida (m)', Number(bobina.metragem || 0).toLocaleString('pt-BR')],
    ['Lote DOW', fmt(bobina.lote_cola)],
    ['Código C / interno', fmt(bobina.codigo_interno)],
    ['Cola', glue],
    ['Cor de fundo', cor],
    ['Pigmento', pigment],
    ['Peso do pigmento', Number(bobina.pigmento_kg) > 0 ? money(bobina.pigmento_kg) + ' kg' : '—'],
    ['Gramatura da bobina', fmt(bobina.vareta_g) + ' g'],
  ]
  if (personalizada) {
    fields.push(['Cliente', fmt(bobina.cliente)])
    fields.push(['Cor de impressão', fmt(bobina.cor_impressao)])
  }
  if (hasEmenda) {
    fields.push(['Emenda', 'SIM'])
    fields.push(['Código da bobina de emenda', fmt(bobina.codigo_emenda)])
  }
  fields.push(['Validade da bobina', '06 MESES'])

  const cellW = (usable - 4) / 2
  const cellH = 20
  for (let i = 0; i < fields.length; i += 2) {
    const rowY = y - cellH
    card(margin, rowY, cellW, cellH, fields[i][0], fields[i][1])
    if (fields[i + 1]) card(margin + cellW + 4, rowY, cellW, cellH, fields[i + 1][0], fields[i + 1][1])
    y = rowY - 3
  }

  // Rodapé interno; todo o conteúdo permanece afastado da borda física.
  commands.push(navy + ' rg ' + margin + ' ' + margin + ' ' + usable + ' 10 re f')
  centered(personalizada ? 'PRODUCAO PERSONALIZADA' : 'PRODUCAO PADRAO', margin, margin + 3.2, usable, 6, '1 1 1')

  const stream = commands.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + page + ' ' + page + '] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length)
    pdf += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n'
  }
  const xref = pdf.length
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n'
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, '0') + ' 00000 n \n'
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF'
  return new Blob([new Uint8Array(Array.from(pdf, (character) => character.charCodeAt(0)))], { type: 'application/pdf' })
}

export function downloadCobrideiraLabelNova(bobina: CobrideiraBobinaRow) {
  const blob = buildPdf(bobina)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'Etiqueta 12x12 - ' + bobina.numero_bobina + '.pdf'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}
