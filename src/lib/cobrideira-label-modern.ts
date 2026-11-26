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
  if (!/^\d{1,41}$/.test(input)) throw new Error('O número da bobina precisa conter de 1 a 41 dígitos para gerar o QR Code.')
  const bits: number[] = []
  const append = (value: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1) }
  append(1, 4); append(input.length, 10)
  for (let i = 0; i < input.length; i += 3) {
    const group = input.slice(i, i + 3)
    append(Number(group), group.length === 3 ? 10 : group.length === 2 ? 7 : 4)
  }
  const capacity = 19 * 8
  append(0, Math.min(4, capacity - bits.length))
  while (bits.length % 8) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0))
  for (let pad = 0; data.length < 19; pad++) data.push(pad % 2 ? 0x11 : 0xec)

  const exp = new Array<number>(512).fill(0), log = new Array<number>(256).fill(0)
  let value = 1
  for (let i = 0; i < 255; i++) { exp[i] = value; log[value] = i; value <<= 1; if (value & 0x100) value ^= 0x11d }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255]
  const mul = (a: number, b: number) => (!a || !b ? 0 : exp[log[a] + log[b]])
  let gen = [1]
  for (let i = 0; i < 7; i++) {
    const next = new Array<number>(gen.length + 1).fill(0)
    gen.forEach((coef, j) => { next[j] ^= coef; next[j + 1] ^= mul(coef, exp[i]) })
    gen = next
  }
  const work = [...data, ...new Array<number>(7).fill(0)]
  for (let i = 0; i < 19; i++) {
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
  const format = 0x77c4
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
    commands.push(`0 0 0 RG 0 0 0 rg 0.8 w ${(X+R).toFixed(2)} ${Y.toFixed(2)} m ${(X+W-R).toFixed(2)} ${Y.toFixed(2)} l ${(X+W-R+R*k).toFixed(2)} ${Y.toFixed(2)} ${(X+W).toFixed(2)} ${(Y+R-R*k).toFixed(2)} ${(X+W).toFixed(2)} ${(Y+R).toFixed(2)} c ${(X+W).toFixed(2)} ${(Y+H-R).toFixed(2)} l ${(X+W).toFixed(2)} ${(Y+H-R+R*k).toFixed(2)} ${(X+W-R+R*k).toFixed(2)} ${(Y+H).toFixed(2)} ${(X+W-R).toFixed(2)} ${(Y+H).toFixed(2)} c ${(X+R).toFixed(2)} ${(Y+H).toFixed(2)} l ${(X+R-R*k).toFixed(2)} ${(Y+H).toFixed(2)} ${X.toFixed(2)} ${(Y+H-R+R*k).toFixed(2)} ${X.toFixed(2)} ${(Y+H-R).toFixed(2)} c ${X.toFixed(2)} ${(Y+R).toFixed(2)} l ${X.toFixed(2)} ${(Y+R-R*k).toFixed(2)} ${(X+R-R*k).toFixed(2)} ${Y.toFixed(2)} ${(X+R).toFixed(2)} ${Y.toFixed(2)} c ${fill ? 'B' : 'S'}`)
  }
  const drawText = (value: string, x: number, baselineTop: number, size: number, font = 'F2', white = false) => {
    commands.push(`${white ? '1 1 1' : '0 0 0'} rg BT /${font} ${size.toFixed(2)} Tf 1 0 0 1 ${mm(x).toFixed(2)} ${yTop(baselineTop).toFixed(2)} Tm <${pdfHex(value)}> Tj ET`)
  }
  const centerText = (value: string, x: number, top: number, w: number, baseline: number, size: number, white = false, font = 'F2') => {
    const fitted = fitSize(value, mm(w - 5), size, 4)
    drawText(value, x + (w - textWidth(value, fitted) / MM) / 2, top + baseline, fitted, font, white)
  }
  const field = (key: keyof CobrideiraBobinaRow | 'peso_bopp' | 'operador_turno' | 'pigmento', label: string, x: number, top: number, w: number, h: number, value: string, options: { black?: boolean; max?: number; labelMax?: number } = {}) => {
    const black = Boolean(options.black)
    pathRound(x, top, w, h, 1.45, black)
    const colorWhite = black
    const labelSize = fitSize(label, mm(w - 5), options.labelMax ?? 5.5, 4.1)
    centerText(label, x, top, w, 3.15, labelSize, colorWhite)
    commands.push(`${colorWhite ? '1 1 1' : '0 0 0'} RG 0.38 w ${mm(x+2).toFixed(2)} ${yTop(top+5.55).toFixed(2)} m ${mm(x+w-2).toFixed(2)} ${yTop(top+5.55).toFixed(2)} l S`)
    const fs = fitSize(value, mm(w - 5), options.max ?? 14, 5)
    const available = h - 5.55
    const glyph = 0.72 * fs / MM
    const baseline = h - ((available - glyph) / 2 + 0.13 * fs / MM)
    centerText(value, x, top, w, baseline, fs, colorWhite)
  }

  const outerX = 1.5, outerTop = 1.5
  pathRound(outerX, outerTop, 117, 97, 3.1, false)

  // Logo com símbolo circular e assinatura em preto, sem invadir o número da bobina.
  const logoTop = 4.0, logoX = 4.0
  commands.push(`0 0 0 rg ${mm(logoX+4.1).toFixed(2)} ${yTop(logoTop+8.4).toFixed(2)} ${mm(4.1).toFixed(2)} 0 360 arc f`)
  // Ícone branco de dispensador de fita, desenhado com formas vetoriais.
  commands.push(`1 1 1 rg ${mm(logoX+2.0).toFixed(2)} ${yTop(logoTop+4.6).toFixed(2)} ${mm(4.2).toFixed(2)} ${mm(1.0).toFixed(2)} re f ${mm(logoX+2.0).toFixed(2)} ${yTop(logoTop+6.0).toFixed(2)} ${mm(2.0).toFixed(2)} ${mm(1.2).toFixed(2)} re f ${mm(logoX+3.5).toFixed(2)} ${yTop(logoTop+3.2).toFixed(2)} ${mm(2.7).toFixed(2)} ${mm(1.0).toFixed(2)} re f`)
  drawText('Controle', 13.1, 8.4, 8.0, 'F3')
  drawText('Embalando', 13.1, 12.2, 8.0, 'F3')
  drawText('Planejamento e Controle de Produção', 4.0, 18.0, 3.55, 'F4')

  const line1 = 4.0, h1 = 15.0
  field('numero_bobina','Nº DA BOBINA',34.0,line1,32.0,h1,fmt(bobina.numero_bobina),{black:true,max:26})
  field('data','DATA DA PRODUÇÃO',67.6,line1,26.0,h1,dateBR(bobina.data),{max:13})
  const shift = String(bobina.turno ?? '').replace(/\s*TURNO\s*/i,'').trim()
  field('operador','OPERADOR / TURNO',95.2,line1,20.8,h1,`${upper(bobina.operador)} / ${shift || '-'}`,{max:12,labelMax:5.5})

  const gap = 1.6
  let x = 4.0, y = 20.6, h = 12.0
  field('cod_bob','COD. BOBINA',x,y,44.0,h,upper(bobina.cod_bob),{black:true,max:16}); x += 45.6
  field('peso_bruto','PESO BOPP VIRGEM (kg)',x,y,37.0,h,fmt(money(bobina.peso_bruto)),{max:14}); x += 38.6
  field('fornecedor_filme','FORNECEDOR',x,y,27.8,h,upper(bobina.fornecedor_filme),{max:14})

  x=4.0; y=34.2; h=12.0
  field('emenda','EMENDA',x,y,27.0,h,bobina.emenda?'SIM':'NÃO',{max:14}); x+=28.6
  field('lote_cola','LOTE DOW',x,y,47.0,h,upper(bobina.lote_cola),{max:14}); x+=48.6
  field('codigo_interno','CÓD.',x,y,34.8,h,upper(bobina.codigo_interno),{max:14})

  const corFundo = upper(bobina.cor_fundo)
  const pigmentos = [String(bobina.cor_mistura ?? '').trim(),String(bobina.pigmento_mistura ?? '').trim()].filter(Boolean)
  const pigmento = pigmentos.length ? upper(pigmentos.join(' / ')) : (/^CRISTAL$/i.test(corFundo) ? '-' : corFundo)
  const cola = upper(bobina.fornecedor_cola || (Number(bobina.kg_cola)>0 ? '100% DOW' : '-'))
  const pigmentoPeso = Number(bobina.pigmento_kg)>0 ? `${money(bobina.pigmento_kg)} KG` : '-'
  x=4.0; y=47.8; h=11.5
  const row4: Array<[string,string,number,string]> = [
    ['cola','COLA',20.0,cola],['pigmento','PIGMENTO',20.0,pigmento],
    ['pigmento_kg','PESO PIGM.',20.0,pigmentoPeso],['cor_fundo','COR FUNDO',20.0,corFundo],
    ['cor_impressao','COR IMPRESSÃO',25.6,upper(bobina.cor_impressao)],
  ]
  row4.forEach(([key,label,w,val])=>{field(key as keyof CobrideiraBobinaRow,label,x,y,w,h,val,{max:14});x+=w+gap})

  x=4.0; y=61.0; h=12.0
  field('cliente','CLIENTE',x,y,39.0,h,upper(bobina.cliente),{max:14});x+=40.6
  field('largura','MEDIDA DA BOB.',x,y,25.0,h,fmt(bobina.largura),{max:14});x+=26.6
  field('micragem','MICRAS',x,y,18.0,h,fmt(bobina.micragem),{max:14});x+=19.6
  field('vareta_g','GRAMATURA',x,y,25.2,h,`${fmt(bobina.vareta_g)} G`,{max:14})

  // QR exclusivo abaixo da linha 5, com zona branca de silêncio e módulos vetoriais.
  const qrArea = { x:4.0, top:74.6, w:20.6, h:21.4 }
  const qr = qrMatrix(String(bobina.numero_bobina))
  const side = 17.0, quiet = 1.0, module = side / 21
  const qrX = qrArea.x + (qrArea.w - side - quiet*2)/2 + quiet
  const qrTop = qrArea.top + (qrArea.h - side - quiet*2)/2 + quiet
  commands.push(`1 1 1 rg ${mm(qrX-quiet).toFixed(2)} ${yTop(qrTop+side+quiet).toFixed(2)} ${mm(side+quiet*2).toFixed(2)} ${mm(side+quiet*2).toFixed(2)} re f 0 0 0 rg`)
  qr.forEach((row, rowIndex)=>row.forEach((dark,colIndex)=>{
    if(dark) commands.push(`${mm(qrX+colIndex*module).toFixed(2)} ${yTop(qrTop+(rowIndex+1)*module).toFixed(2)} ${mm(module).toFixed(3)} ${mm(module).toFixed(3)} re f`)
  }))

  field('metragem','METRAGEM TOTAL',26.2,74.6,45.2,13.0,Number(bobina.metragem||0).toLocaleString('pt-BR'),{black:true,max:20})
  field('peso_final','PESO TOTAL',73.0,74.6,43.0,13.0,`${money(bobina.peso_final)} Kg`,{black:true,max:20})

  pathRound(26.2,89.2,89.8,6.8,1.35,false)
  centerText('VALIDADE: 06 MESES   |   ESCANEIE ESTA BOBINA',26.2,89.2,89.8,4.55,7.5)

  const stream=commands.join('\n')
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R >> >> /Contents 8 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf='%PDF-1.4\n'; const offsets=[0]
  objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`})
  const xref=pdf.length
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach(offset=>{pdf+=String(offset).padStart(10,'0')+' 00000 n \n'})
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([new Uint8Array(Array.from(pdf,char=>char.charCodeAt(0)))],{type:'application/pdf'})
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
