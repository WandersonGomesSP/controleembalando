import type { CobrideiraBobinaRow } from '@/lib/database.types'

type LabelLine = { text: string; size?: number; bold?: boolean; highlight?: boolean }

function pdfTextHex(value: string) {
  const bytes = Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 63
    return code <= 255 ? code : 63
  })
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function labelLines(bobina: CobrideiraBobinaRow): LabelLine[] {
  const turno = String(bobina.turno ?? '').replace(/\\s*TURNO\\s*/i, '').trim()
  const operador = String(bobina.created_by ?? '').split('@')[0].replace(/[._-]+/g, ' ').toUpperCase()
  const pesoPigmento = Number(bobina.pigmento_kg) > 0
    ? ` / PESO: ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(bobina.pigmento_kg))}`
    : ''
  const linhas: LabelLine[] = [
    { text: `NUMERO DA BOBINA: ${bobina.numero_bobina}`, size: 16, bold: true, highlight: true },
    { text: `DATA DA PRODUÇÃO: ${new Date(`${bobina.data}T00:00:00`).toLocaleDateString('pt-BR')}` },
    { text: `OPERADOR: ${operador || '—'} / TURNO: ${turno || '—'}` },
    { text: `MEDIDA DA BOB: ${bobina.largura} / MICRAS: ${bobina.micragem}` },
    { text: `COD. BOB: ${bobina.cod_bob} / PESO: ${Math.round(Number(bobina.peso_bruto))}` },
    { text: `FORN. BOPP: ${bobina.fornecedor_filme}` },
    { text: `METRAGEM PRODUZIDA: ${bobina.metragem}` },
    { text: `EMENDA: ${bobina.emenda ? 'SIM' : 'NÃO'}` },
    { text: `LOTE DOW: ${bobina.lote_cola || '—'} / CÓD: ${bobina.codigo_interno || '—'}` },
    { text: `COLA: ${bobina.fornecedor_cola || (Number(bobina.kg_cola) > 0 ? `${bobina.kg_cola} KG` : '—')}` },
    { text: `COR: ${bobina.cor_fundo || '—'}` },
    { text: `PIGMENTO: ${bobina.cor_mistura || bobina.pigmento_mistura || '—'}${pesoPigmento}` },
    { text: `METRAGEM TOTAL ADESIVADO: ${bobina.metragem}` },
    { text: `PESO TOTAL ADESIVADO: ${formatarPeso(Number(bobina.peso_final))} KG` },
    { text: `GRAMATURA DA BOBINA: ${bobina.vareta_g} G` },
    { text: 'VALIDADE DA BOBINA: 06 MESES' },
  ]
  return linhas
}

function formatarPeso(value: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function buildPdf(bobina: CobrideiraBobinaRow) {
  const commands: string[] = []
  const x = 21
  let y = 303
  const lineHeight = 17.2

  for (const line of labelLines(bobina)) {
    const size = line.size ?? 13
    const font = line.bold ? 'F2' : 'F1'
    const width = Math.min(248, line.text.length * size * 0.535)
    if (line.highlight) {
      commands.push(`0 g ${x - 1} ${y - 3} ${width + 4} 18 re f`)
      commands.push('1 g')
    } else {
      commands.push('0 g')
    }
    commands.push(`BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm <${pdfTextHex(line.text)}> Tj ET`)
    commands.push(`0 G 0.55 w ${x} ${y - 2.5} m ${x + width} ${y - 2.5} l S`)
    y -= lineHeight
  }

  const stream = commands.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 290 360] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index++) {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new Blob([new Uint8Array(Array.from(pdf, (character) => character.charCodeAt(0)))], { type: 'application/pdf' })
}

export function downloadCobrideiraLabel(bobina: CobrideiraBobinaRow) {
  const blob = buildPdf(bobina)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `Etiqueta - ${bobina.numero_bobina}.pdf`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
