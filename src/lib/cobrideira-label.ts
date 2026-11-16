import type { CobrideiraBobinaRow } from '@/lib/database.types'

type LabelLine = { text: string; size?: number; bold?: boolean; highlight?: boolean; value?: string }

function pdfTextHex(value: string) {
  const bytes = Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 63
    return code <= 255 ? code : 63
  })
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function quebrarTexto(texto: string, maxCaracteres = 37) {
  const palavras = texto.split(/\s+/)
  const linhas: string[] = []
  let atual = ''
  for (const palavra of palavras) {
    const partes = palavra.length > maxCaracteres
      ? palavra.match(new RegExp(`.{1,${maxCaracteres}}`, 'g')) ?? [palavra]
      : [palavra]
    for (const parte of partes) {
      const proxima = atual ? `${atual} ${parte}` : parte
      if (proxima.length > maxCaracteres && atual) {
        linhas.push(atual)
        atual = parte
      } else atual = proxima
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

function labelLines(bobina: CobrideiraBobinaRow): LabelLine[] {
  const turno = String(bobina.turno ?? '').replace(/\s*TURNO\s*/i, '').trim()
  const limparZeroDecimal = (valor: unknown) => {
    const texto = String(valor ?? '').trim()
    if (!texto || /^[-+]?0+(?:[.,]0+)?$/.test(texto)) return ''
    return texto.replace(/^(\d+)[.,]0+$/, '$1')
  }
  const pigmentosInformados = [limparZeroDecimal(bobina.cor_mistura), limparZeroDecimal(bobina.pigmento_mistura)].filter(Boolean)
  const pigmento = pigmentosInformados.length ? pigmentosInformados.join(' / ') : String(bobina.cor_fundo || '').trim()
  const codigoInternoCola = limparZeroDecimal(bobina.codigo_interno) || '—'
  const pesoPigmento = Number(bobina.pigmento_kg) > 0
    ? ` / PESO: ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(bobina.pigmento_kg))}`
    : ''
  const linhas: LabelLine[] = [
    { text: `NUMERO DA BOBINA: ${bobina.numero_bobina}`, size: 16, highlight: true },
    { text: `DATA DA PRODUÇÃO: ${new Date(`${bobina.data}T00:00:00`).toLocaleDateString('pt-BR')}` },
    { text: `OPERADOR: ${bobina.operador || '—'} / TURNO: ${turno || '—'}` },
    { text: `MEDIDA DA BOB: ${bobina.largura} / MICRAS: ${bobina.micragem}` },
    { text: `COD. BOB: ${bobina.cod_bob} / PESO:` },
    { text: String(Math.round(Number(bobina.peso_bruto))) },
    { text: `FORN. BOPP: ${bobina.fornecedor_filme}` },
    { text: `METRAGEM PRODUZIDA: ${bobina.metragem}` },
    { text: `EMENDA: ${bobina.emenda ? 'SIM' : 'NÃO'}` },
    { text: `LOTE DOW: ${String(bobina.lote_cola || '—')} / CÓD: ${codigoInternoCola}` },
    { text: `COLA: ${bobina.fornecedor_cola || (Number(bobina.kg_cola) > 0 ? `${bobina.kg_cola} KG` : '—')}` },
    { text: `COR: ${bobina.cor_fundo || '—'}` },
    ...(pigmento || Number(bobina.pigmento_kg) > 0
      ? [{ text: `PIGMENTO: ${pigmento}${pesoPigmento}` }]
      : []),
    { text: 'METRAGEM TOTAL ADESIVADO: ', value: String(bobina.metragem), size: 13 },
    { text: 'PESO TOTAL ADESIVADO: ', value: `${formatarPeso(Number(bobina.peso_final))} KG`, size: 13 },
    { text: `GRAMATURA DA BOBINA: ${bobina.vareta_g} G` },
    { text: 'VALIDADE DA BOBINA: 06 MESES' },
  ]
  return linhas.flatMap((linha) => linha.value !== undefined
    ? [linha]
    : quebrarTexto(linha.text, linha.size ? 33 : 41).map((text) => ({ ...linha, text })))
}

function formatarPeso(value: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function larguraTexto(texto: string, tamanho: number) {
  // Estimativa conservadora da largura Helvetica para manter cada linha dentro da etiqueta.
  return Array.from(texto).reduce((total, caractere) => {
    const fator = caractere === ' ' ? 0.278
      : 'ilI.,:;!|'.includes(caractere) ? 0.278
      : 'MW@%'.includes(caractere) ? 0.82
      : 'frt()[]'.includes(caractere) ? 0.35
      : 0.56
    return total + fator * tamanho
  }, 0)
}

function buildPdf(bobina: CobrideiraBobinaRow) {
  const commands: string[] = []
  const lines = labelLines(bobina)
  const horizontalPadding = 12.75
  const maxWidth = 290 - horizontalPadding
  const prepared = lines.map((line) => {
    const requestedSize = line.size ?? 13
    const text = line.value !== undefined ? line.text + line.value : line.text
    const deslocamentoValor = line.value !== undefined ? requestedSize * 0.278 * 15 : 0
    const textWidth = larguraTexto(text, requestedSize) + deslocamentoValor
    const size = textWidth > maxWidth ? requestedSize * maxWidth / textWidth : requestedSize
    const prefixWidth = line.value !== undefined ? larguraTexto(line.text, size) : 0
    const valueWidth = line.value !== undefined ? larguraTexto(line.value, size) : 0
    const width = line.value !== undefined ? prefixWidth + valueWidth : larguraTexto(line.text, size)
    return { line, size, prefixWidth, valueWidth, width }
  })

  // Retoma o espaçamento compacto anterior, sem distribuir as linhas
  // por toda a altura da etiqueta.
  const lineHeight = prepared.length > 1
    ? Math.min(18, (360 - 18 - Math.max(...prepared.map((item) => item.size))) / (prepared.length - 1))
    : 18
  const verticalSpan = lineHeight * Math.max(0, prepared.length - 1)
  const maiorFonte = Math.max(...prepared.map((item) => item.size), 13)
  let y = (360 + verticalSpan - maiorFonte * 0.5) / 2

  for (const item of prepared) {
    const { line, size, prefixWidth, valueWidth, width } = item
    const x = horizontalPadding
    const font = line.bold ? 'F2' : 'F1'
    if (line.value !== undefined) {
      commands.push('0 g')
      commands.push(`BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm <${pdfTextHex(line.text)}> Tj ET`)
      const deslocamentoValor = size * 0.278 * 15
      const folgaDireita = size * 0.278 * 3
      const inicioValor = x + prefixWidth + deslocamentoValor
      commands.push(`0 g ${inicioValor} ${y - 3} ${valueWidth + folgaDireita} 18 re f`)
      commands.push('1 g')
      commands.push(`BT /${font} ${size} Tf 1 0 0 1 ${inicioValor} ${y} Tm <${pdfTextHex(line.value)}> Tj ET`)
      commands.push('0 g')
    } else {
      if (line.highlight) {
        const folgaDireita = size * 0.278 * 10
        commands.push(`0 g ${x} ${y - 3} ${width + folgaDireita} 18 re f`, '1 g')
      } else commands.push('0 g')
      commands.push(`BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm <${pdfTextHex(line.text)}> Tj ET`)
      if (line.highlight) commands.push('0 g')
    }
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
