import type { CobrideiraBobinaRow } from '@/lib/database.types'

const PAGE_W = 120 * 72 / 25.4
const PAGE_H = 100 * 72 / 25.4
const MM = 72 / 25.4

function pdfHex(value: string) {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 63
    return (code <= 255 ? code : 63).toString(16).padStart(2, '0')
  }).join('').toUpperCase()
}

function textWidth(value: string, size: number) {
  const factors: Record<string, number> = { ' ': 0.278, i: 0.222, l: 0.222, I: 0.278, '.': 0.278, ',': 0.278, ':': 0.278, ';': 0.278, '!': 0.333, '|': 0.26, M: 0.833, W: 0.944, '@': 0.92, '%': 0.889, f: 0.333, r: 0.389, t: 0.333, '(': 0.333, ')': 0.333, '-': 0.333, '/': 0.278 }
  return Array.from(value).reduce((sum, char) => sum + (factors[char] ?? 0.556) * size, 0)
}

function fitSize(value: string, maxWidth: number, maximum: number, minimum = 5) {
  let size = maximum
  while (size > minimum && textWidth(value, size) > maxWidth) size = Math.max(minimum, size - 0.5)
  return size
}

function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))
}
function fmt(value: unknown) {
  const result = String(value ?? '').trim()
  return result || '-'
}
function upper(value: unknown) {
  return fmt(value).toLocaleUpperCase('pt-BR')
}
function dateBR(value: unknown) {
  if (!value) return '-'
  const raw = String(value)
  const date = new Date(raw.length === 10 ? raw + 'T00:00:00' : raw)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR')
}

// QR Code Model 2, versão 1-L, codificação numérica (o número da bobina).
// O desenho é composto por módulos vetoriais, sem PNG ou suavização.
function qrMatrix(input: string): boolean[][] {
  if (!/^\d{1,34}$/.test(input)) throw new Error('O número da bobina precisa conter de 1 a 34 dígitos para gerar o QR Code.')
  const bits: number[] = []
  const append = (value: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1) }
  append(1, 4); append(input.length, 10)
  for (let i = 0; i < input.length; i += 3) {
    const group = input.slice(i, i + 3)
    append(Number(group), group.length === 3 ? 10 : group.length === 2 ? 7 : 4)
  }
  const capacity = 16 * 8
  append(0, Math.min(4, capacity - bits.length))
  while (bits.length % 8) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0))
  for (let pad = 0; data.length < 16; pad++) data.push(pad % 2 ? 0x11 : 0xec)

  const exp = new Array<number>(512).fill(0), log = new Array<number>(256).fill(0)
  let value = 1
  for (let i = 0; i < 255; i++) { exp[i] = value; log[value] = i; value <<= 1; if (value & 0x100) value ^= 0x11d }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255]
  const mul = (a: number, b: number) => (!a || !b ? 0 : exp[log[a] + log[b]])
  let gen = [1]
  for (let i = 0; i < 10; i++) {
    const next = new Array<number>(gen.length + 1).fill(0)
    gen.forEach((coef, j) => { next[j] ^= coef; next[j + 1] ^= mul(coef, exp[i]) })
    gen = next
  }
  const work = [...data, ...new Array<number>(10).fill(0)]
  for (let i = 0; i < 16; i++) {
    const factor = work[i]
    if (factor) for (let j = 0; j < gen.length; j++) work[i + j] ^= mul(gen[j], factor)
  }
  const codewords = [...data, ...work.slice(19)]
  const stream = codewords.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1))
  const n = 21
  const matrix = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const reserved = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const set = (x: number, y: number, dark: boolean) => { if (x >= 0 && y >= 0 && x < n && y < n) { matrix[y][x] = dark; reserved[y][x] = true } }
  const finder = (ox: number, oy: number) => {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      const xx = ox + x, yy = oy + y
      if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue
      const dark = x >= 0 && x <= 6 && y >= 0 && y <= 6 && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4))
      set(xx, yy, dark)
    }
  }
  finder(0, 0); finder(14, 0); finder(0, 14)
  for (let i = 8; i < 13; i++) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0) }
  // Formato: nível L, máscara 0 (BCH do padrão QR).
  const format = 0x5412
  for (let i = 0; i < 15; i++) {
    const bit = ((format >>> i) & 1) !== 0
    const a = i < 6 ? [8, i] : i < 8 ? [8, i + 1] : [8, 14 - i]
    const b = i < 8 ? [20 - i, 8] : i < 9 ? [15 - i, 8] : [14 - i, 8]
    set(a[0], a[1], bit); set(b[0], b[1], bit)
  }
  set(8, 13, true)
  let bitIndex = 0, upward = true
  for (let right = 20; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < n; vert++) {
      const y = upward ? n - 1 - vert : vert
      for (let offset = 0; offset < 2; offset++) {
        const x = right - offset
        if (reserved[y][x]) continue
        const bit = bitIndex < stream.length ? stream[bitIndex++] === 1 : false
        matrix[y][x] = bit !== ((x + y) % 2 === 0)
      }
    }
    upward = !upward
  }
  return matrix
}

function buildPdf(bobina: CobrideiraBobinaRow) {
  const commands: string[] = []
  const mm = (v: number) => v * MM
  const yTop = (top: number) => PAGE_H - mm(top)
  const pathRound = (x: number, top: number, w: number, h: number, r: number, fill: boolean) => {
    const X = mm(x), Y = yTop(top + h), W = mm(w), H = mm(h), R = mm(r)
    const k = 0.5522847498
    commands.push(\`0 0 0 RG \${fill ? '0 0 0' : '1 1 1'} rg 0.8 w \${(X+R).toFixed(2)} \${Y.toFixed(2)} m \${(X+W-R).toFixed(2)} \${Y.toFixed(2)} l \${(X+W-R+R*k).toFixed(2)} \${Y.toFixed(2)} \${(X+W).toFixed(2)} \${(Y+R-R*k).toFixed(2)} \${(X+W).toFixed(2)} \${(Y+R).toFixed(2)} c \${(X+W).toFixed(2)} \${(Y+H-R).toFixed(2)} l \${(X+W).toFixed(2)} \${(Y+H-R+R*k).toFixed(2)} \${(X+W-R+R*k).toFixed(2)} \${(Y+H).toFixed(2)} \${(X+W-R).toFixed(2)} \${(Y+H).toFixed(2)} c \${(X+R).toFixed(2)} \${(Y+H).toFixed(2)} l \${(X+R-R*k).toFixed(2)} \${(Y+H).toFixed(2)} \${X.toFixed(2)} \${(Y+H-R+R*k).toFixed(2)} \${X.toFixed(2)} \${(Y+H-R).toFixed(2)} c \${X.toFixed(2)} \${(Y+R).toFixed(2)} l \${X.toFixed(2)} \${(Y+R-R*k).toFixed(2)} \${(X+R-R*k).toFixed(2)} \${Y.toFixed(2)} \${(X+R).toFixed(2)} \${Y.toFixed(2)} c \${fill ? 'B' : 'S'}\`)
  }
  const drawText = (value: string, x: number, baselineTop: number, size: number, font = 'F2', white = false) => {
    commands.push(\`\${white ? '1 1 1' : '0 0 0'} rg BT /\${font} \${size.toFixed(2)} Tf 1 0 0 1 \${mm(x).toFixed(2)} \${yTop(baselineTop).toFixed(2)} Tm <\${pdfHex(value)}> Tj ET\`)
  }
  const centerText = (value: string, x: number, top: number, w: number, baseline: number, size: number, white = false, font = 'F2') => {
    const fitted = fitSize(value, mm(w - 4), size, 4.5)
    drawText(value, x + (w - textWidth(value, fitted) / MM) / 2, top + baseline, fitted, font, white)
  }
  const field = (label: string, value: unknown, x: number, top: number, w: number, h: number, options: { black?: boolean; max?: number; labelMax?: number } = {}) => {
    const black = Boolean(options.black)
    pathRound(x, top, w, h, 1.6, black)
    const labelSize = fitSize(label, mm(w - 2), options.labelMax ?? 6.5, 5)
    centerText(label, x, top, w, 3.15, labelSize, black)
    commands.push(\`\${black ? '1 1 1' : '0 0 0'} RG 0.9 w \${mm(x+2).toFixed(2)} \${yTop(top+4.2).toFixed(2)} m \${mm(x+w-2).toFixed(2)} \${yTop(top+4.2).toFixed(2)} l S\`)
    const content = fmt(value)
    const size = fitSize(content, mm(w - 4), options.max ?? 15, 4.5)
    const valueArea = h - 4.2
    const glyphHeight = 0.718 * size / MM
    const baseline = h - (4.2 + valueArea / 2 - glyphHeight / 2)
    centerText(content, x, top, w, baseline, size, black)
  }

  // Geometria idêntica ao modelo Python do Claude: etiqueta Argox 120 × 100 mm.
  const x0 = 7, x1 = 113, gap = 1.5
  const rows = { l1: 7, l2: 22.3, l3: 34.6, l4: 46.9, l5: 59.2, l6: 71.5, l7: 86 }
  const heights = { l1: 13.8, l2: 10.8, l3: 10.8, l4: 10.8, l5: 10.8, l6: 13, l7: 7 }

  pathRound(4, 4, 112, 92, 4, false)

  // Cabeçalho: logotipo, número da bobina, data e operador/turno.
  const logoX = x0, logoY = rows.l1, d = 6.5
  const cx = logoX + d / 2, cyTop = logoY + heights.l1 - 1 - d / 2
  commands.push(\`0 0 0 rg \${mm(cx+d/2).toFixed(2)} \${yTop(cyTop).toFixed(2)} m \${mm(cx+d/2).toFixed(2)} \${yTop(cyTop-d/2).toFixed(2)} \${mm(cx+d/2*0.5522847498).toFixed(2)} \${yTop(cyTop-d/2).toFixed(2)} \${mm(cx).toFixed(2)} \${yTop(cyTop-d/2).toFixed(2)} c \${mm(cx-d/2*0.5522847498).toFixed(2)} \${yTop(cyTop-d/2).toFixed(2)} \${mm(cx-d/2).toFixed(2)} \${yTop(cyTop-d/2*0.5522847498).toFixed(2)} \${mm(cx-d/2).toFixed(2)} \${yTop(cyTop).toFixed(2)} c \${mm(cx-d/2).toFixed(2)} \${yTop(cyTop+d/2*0.5522847498).toFixed(2)} \${mm(cx-d/2*0.5522847498).toFixed(2)} \${yTop(cyTop+d/2).toFixed(2)} \${mm(cx).toFixed(2)} \${yTop(cyTop+d/2).toFixed(2)} c \${mm(cx+d/2*0.5522847498).toFixed(2)} \${yTop(cyTop+d/2).toFixed(2)} \${mm(cx+d/2).toFixed(2)} \${yTop(cyTop+d/2*0.5522847498).toFixed(2)} \${mm(cx+d/2).toFixed(2)} \${yTop(cyTop).toFixed(2)} c f\`)
  commands.push(\`1 1 1 rg \${mm(cx-2.3).toFixed(2)} \${yTop(cyTop+0.2).toFixed(2)} \${mm(3.2).toFixed(2)} \${mm(1.5).toFixed(2)} re f \${mm(cx-0.9).toFixed(2)} \${yTop(cyTop-1.7).toFixed(2)} \${mm(3.2).toFixed(2)} \${mm(1.5).toFixed(2)} re f\`)
  drawText('Controle', logoX+d+1, 8.4, 7.5, 'F3')
  drawText('Embalando', logoX+d+1, 11.5, 7.5, 'F3')
  drawText('Planejamento e Controle', logoX, 16.8, 5.3, 'F4')
  drawText('de Produção', logoX, 18.9, 5.3, 'F4')

  const shift = String(bobina.turno ?? '').replace(/\s*TURNO\s*/i, '').trim()
  let x = 32.5 + gap
  field('Nº DA BOBINA', bobina.numero_bobina, x, rows.l1, 29, heights.l1, { black: true, max: 24 })
  x += 29 + gap
  field('DATA DA PRODUÇÃO', dateBR(bobina.data), x, rows.l1, 26, heights.l1, { max: 14 })
  x += 26 + gap
  field('OPERADOR / TURNO', \`\${upper(bobina.operador)} / \${shift || '-'}\`, x, rows.l1, 24, heights.l1, { max: 14 })

  // Linha 2.
  x = x0
  field('COD. BOBINA', bobina.cod_bob, x, rows.l2, 44, heights.l2, { black: true })
  x += 44 + gap
  field('PESO BOPP VIRGEM (kg)', money(bobina.peso_bruto), x, rows.l2, 33, heights.l2)
  x += 33 + gap
  field('FORNECEDOR', upper(bobina.fornecedor_filme), x, rows.l2, 26, heights.l2)

  // Linha 3.
  x = x0
  field('EMENDA', bobina.emenda ? 'SIM' : 'NÃO', x, rows.l3, 25, heights.l3)
  x += 25 + gap
  field('LOTE DOW', bobina.lote_cola, x, rows.l3, 43, heights.l3)
  x += 43 + gap
  field('CÓD.', bobina.codigo_interno, x, rows.l3, 35, heights.l3)

  // Linha 4: informações de cola e pigmentação.
  const corFundo = upper(bobina.cor_fundo)
  const pigmentos = [String(bobina.cor_mistura ?? '').trim(), String(bobina.pigmento_mistura ?? '').trim()].filter(Boolean)
  const pigmento = pigmentos.length ? upper(pigmentos.join(' / ')) : (/^CRISTAL$/i.test(corFundo) ? '-' : corFundo)
  const cola = upper(bobina.fornecedor_cola || (Number(bobina.kg_cola) > 0 ? '100% DOW' : '-'))
  const pesoPigmento = Number(bobina.pigmento_kg) > 0 ? \`\${money(bobina.pigmento_kg)} KG\` : '-'
  const row4: Array<[string, number, string]> = [
    ['COLA', 25, cola], ['PIGMENTO', 19.5, pigmento], ['PESO PIGM.', 15.5, pesoPigmento],
    ['COR FUNDO', 19, corFundo], ['COR IMPRESSÃO', 21, upper(bobina.cor_impressao)],
  ]
  x = x0
  row4.forEach(([label, width, value]) => { field(label, value, x, rows.l4, width, heights.l4); x += width + gap })

  // Linha 5.
  x = x0
  field('CLIENTE', bobina.cliente, x, rows.l5, 38, heights.l5)
  x += 38 + gap
  field('MEDIDA DA BOB.', bobina.largura, x, rows.l5, 24.5, heights.l5)
  x += 24.5 + gap
  field('MICRAS', bobina.micragem, x, rows.l5, 17, heights.l5)
  x += 17 + gap
  field('GRAMATURA', \`\${fmt(bobina.vareta_g)} G\`, x, rows.l5, 22, heights.l5)

  // QR Code com margem branca, ocupando as duas últimas linhas à esquerda.
  const matrix = qrMatrix(String(bobina.numero_bobina))
  const qrX = x0, qrTop = rows.l7, qrW = 21
  const qrH = heights.l6 + gap + heights.l7
  const module = 0.72, side = module * 21, quiet = 1
  const originX = qrX + (qrW - side - quiet * 2) / 2 + quiet
  const originTop = qrTop + (qrH - side - quiet * 2) / 2 + quiet
  commands.push(\`1 1 1 rg \${mm(originX-quiet).toFixed(2)} \${yTop(originTop+side+quiet).toFixed(2)} \${mm(side+quiet*2).toFixed(2)} \${mm(side+quiet*2).toFixed(2)} re f 0 0 0 rg\`)
  matrix.forEach((row, rowIndex) => row.forEach((dark, colIndex) => {
    if (dark) commands.push(\`\${mm(originX+colIndex*module).toFixed(3)} \${yTop(originTop+(rowIndex+1)*module).toFixed(2)} \${mm(module).toFixed(3)} \${mm(module).toFixed(3)} re f\`)
  }))

  const rightX = x0 + qrW + gap
  const rightW = x1 - rightX
  const blackW = (rightW - gap) / 2
  field('METRAGEM TOTAL', Number(bobina.metragem || 0).toLocaleString('pt-BR'), rightX, rows.l6, blackW, heights.l6, { black: true, max: 20 })
  field('PESO TOTAL', \`\${money(bobina.peso_final)} Kg\`, rightX + blackW + gap, rows.l6, blackW, heights.l6, { black: true, max: 20 })

  pathRound(rightX, rows.l7, rightW, heights.l7, 1.6, false)
  centerText('VALIDADE: 06 MESES   |   ESCANEIE ESTA BOBINA', rightX, rows.l7, rightW, 4.55, 8)

  const stream = commands.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    \`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 \${PAGE_W.toFixed(2)} \${PAGE_H.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R >> >> /Contents 8 0 R >>\`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>',
    \`<< /Length \${stream.length} >>\nstream\n\${stream}\nendstream\`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += \`\${i+1} 0 obj\n\${obj}\nendobj\n\` })
  const xref = pdf.length
  pdf += \`xref\n0 \${objects.length+1}\n0000000000 65535 f \n\`
  offsets.slice(1).forEach((offset) => { pdf += String(offset).padStart(10, '0') + ' 00000 n \n' })
  pdf += \`trailer\n<< /Size \${objects.length+1} /Root 1 0 R >>\nstartxref\n\${xref}\n%%EOF\`
  return new Blob([new Uint8Array(Array.from(pdf, (character) => character.charCodeAt(0)))], { type: 'application/pdf' })
}

export function downloadCobrideiraLabelNova(bobina: CobrideiraBobinaRow) {
  const blob=buildPdf(bobina)
  const url=URL.createObjectURL(blob)
  const anchor=document.createElement('a')
  anchor.href=url
  anchor.download='Etiqueta 12x10 - '+bobina.numero_bobina+'.pdf'
  document.body.appendChild(anchor);anchor.click();anchor.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),30000)
}
