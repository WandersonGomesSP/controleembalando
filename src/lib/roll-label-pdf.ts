export type RollLabelData = {
  code: string
  measure: string
  weightKg: number
  registeredAt: string
  expiresAt: string | null
  weightChanged?: boolean
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 14.17
const MIN_MEASURE_WIDTH = (9 * 72) / 2.54

function pdfText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/[\\()]/g, '\\$&')
}

function textWidth(value: string, fontSize: number) {
  return value.length * fontSize * 0.52
}

function centeredText(
  value: string,
  y: number,
  fontSize: number,
  font: 'F1' | 'F2',
  maxWidth = PAGE_WIDTH - MARGIN * 2,
  minTextWidth = 0,
) {
  const safeValue = pdfText(value)
  const naturalWidth = Math.max(textWidth(safeValue, fontSize), 1)
  const horizontalScale = Math.min(
    Math.max(100, (minTextWidth / naturalWidth) * 100),
    (maxWidth / naturalWidth) * 100,
  )
  const renderedWidth = naturalWidth * (horizontalScale / 100)
  const x = Math.max(MARGIN, (PAGE_WIDTH - renderedWidth) / 2)
  return `BT /${font} ${fontSize} Tf ${horizontalScale.toFixed(2)} Tz 1 0 0 1 ${x.toFixed(2)} ${(PAGE_HEIGHT - y).toFixed(2)} Tm (${safeValue}) Tj ET\n`
}

function labelContent(label: RollLabelData) {
  const left = MARGIN
  const right = PAGE_WIDTH - MARGIN
  const logoWidth = 390
  const logoLeft = (PAGE_WIDTH - logoWidth) / 2
  let content = '0 G 0 g\n'

  content += `0 g ${logoLeft} ${PAGE_HEIGHT - 277} ${logoWidth} 185 re f\n`
  content += `1 g\n${centeredText(label.code, 208, 80, 'F2', logoWidth - 32, MIN_MEASURE_WIDTH)}`
  content += `0 g ${logoLeft} ${PAGE_HEIGHT - 302} ${logoWidth} 12 re f\n`

  const fields = [
    `MEDIDA: ${label.measure}`,
    `PESO: ${label.weightKg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`,
    'DATA DE REGISTRO:',
    new Date(`${label.registeredAt}T00:00:00`).toLocaleDateString('pt-BR'),
  ].map((text) => ({ text, minWidth: MIN_MEASURE_WIDTH }))
  if (label.expiresAt) {
    fields.push(
      { text: 'VALIDADE:', minWidth: MIN_MEASURE_WIDTH },
      { text: label.expiresAt, minWidth: MIN_MEASURE_WIDTH },
    )
  }
  if (label.weightChanged) {
    fields.push({ text: 'PESO ALTERADO', minWidth: MIN_MEASURE_WIDTH })
  }

  const firstY = 354
  const lastY = PAGE_HEIGHT - 54
  const fieldSpacing =
    fields.length > 1
      ? Math.min(75, (lastY - firstY) / (fields.length - 1))
      : 75
  fields.forEach(({ text: field, minWidth = 0 }, index) => {
    const y = firstY + index * fieldSpacing
    const fontSize = 27
    const safeField = pdfText(field)
    const naturalWidth = textWidth(safeField, fontSize)
    content += `0 g\n${centeredText(field, y, fontSize, 'F1', PAGE_WIDTH - MARGIN * 2, minWidth)}`
    const underlineWidth = Math.min(
      right - left - 36,
      Math.max(naturalWidth, minWidth) + 8,
    )
    const underlineLeft = (PAGE_WIDTH - underlineWidth) / 2
    content += `0 G 1.5 w ${underlineLeft.toFixed(2)} ${PAGE_HEIGHT - (y + 6)} m ${(underlineLeft + underlineWidth).toFixed(2)} ${PAGE_HEIGHT - (y + 6)} l S\n`
  })

  return content
}

export function createRollLabelPdf(label: RollLabelData) {
  const objects: string[] = []
  const addObject = (value: string) => {
    objects.push(value)
    return objects.length
  }

  const catalogId = addObject('')
  const pagesId = addObject('')
  const pageIds: number[] = []

  const stream = labelContent(label)
  const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
  const regularFontId = objects.length + 2
  const boldFontId = objects.length + 3
  const pageId = addObject(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
  )
  pageIds.push(pageId)

  addObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /HelveticaNeue /Encoding /WinAnsiEncoding >>',
  )
  addObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /HelveticaNeue-Bold /Encoding /WinAnsiEncoding >>',
  )
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

  const encoder = new TextEncoder()
  const chunks = ['%PDF-1.4\n']
  const offsets = [0]
  let byteOffset = encoder.encode(chunks[0]).length
  for (const [index, object] of objects.entries()) {
    const serialized = `${index + 1} 0 obj\n${object}\nendobj\n`
    offsets.push(byteOffset)
    chunks.push(serialized)
    byteOffset += encoder.encode(serialized).length
  }
  const xrefOffset = byteOffset
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`)
  for (const offset of offsets.slice(1)) {
    chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`)
  }
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  )

  return new Blob(chunks, { type: 'application/pdf' })
}

export function downloadRollLabelPdf(label: RollLabelData) {
  const blob = createRollLabelPdf(label)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  const date = label.registeredAt.replace(/-/g, '')
  const code = label.code.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  const weightChangedSuffix = label.weightChanged ? '-PESO-ALTERADO' : ''
  anchor.download = `${code}-${date}${weightChangedSuffix}.pdf`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
