// Dados de exemplo (stub) usados por todas as abas.
// Um marco futuro substitui este módulo por persistência real (ver PLAN.md).

export type Rolo = {
  id: string
  medida: string
  pesoBruto: number
  tara: number
  validade: string // MM/AA
  entrada: string // ISO date
}

export type Residuo = {
  id: number
  data: string
  origem: string
  peso: number
  operador: string
}

export type LoteTubete = {
  id: number
  medida: string
  cor: string
  gramatura: number
  dataProducao: string
  caixas: number
  unidadesPorCaixa: number
  perda: number
  operador: string
}

export type ProducaoTubo = {
  id: number
  destino: string
  data: string
  espessura: string
  tubo: string
  capa: string
  codigos: Record<CodigoGrupo, string[]>
  operador: string
  perda: number
  container: string
  carrinho: string
}

export type CodigoGrupo =
  | 'codCapa'
  | 'codRotulo'
  | 'ramenzoni400'
  | 'ramenzoni280'
  | 'codCola'

export const CODIGO_GRUPOS: { key: CodigoGrupo; label: string }[] = [
  { key: 'codCapa', label: 'Cód Capa' },
  { key: 'codRotulo', label: 'Cód Rótulo' },
  { key: 'ramenzoni400', label: 'Ramenzoni 400' },
  { key: 'ramenzoni280', label: 'Ramenzoni 280' },
  { key: 'codCola', label: 'Cód Cola' },
]

export const MEDIDAS: { medida: string; minimoKg: number }[] = [
  { medida: '12mm', minimoKg: 400 },
  { medida: '18mm', minimoKg: 500 },
  { medida: '24mm', minimoKg: 600 },
  { medida: '30mm', minimoKg: 600 },
  { medida: '38mm', minimoKg: 450 },
  { medida: '50mm', minimoKg: 800 },
  { medida: '70mm', minimoKg: 900 },
  { medida: '100mm', minimoKg: 350 },
]

export const DESTINOS = [
  'Linha 1 — Espiraladeira',
  'Linha 2 — Espiraladeira',
  'Linha 3 — Tubeteira',
  'Expedição',
  'Cliente externo',
]
export const ESPESSURAS = ['1,5 mm', '2,0 mm', '2,5 mm', '3,0 mm', '4,0 mm']
export const TUBOS = [
  '40 mm',
  '50 mm',
  '70 mm',
  '76 mm',
  '100 mm',
  '152 mm',
]
export const CAPAS = ['Kraft', 'Branca', 'Impressa', 'Sem capa']

export const MEDIDAS_TUBETE = ['70x3,0', '50x2,5', '76x3,0', '40x2,0', '30x1,5']
export const CORES_TUBETE = ['Marrom', 'Branco', 'Natural', 'Preto']

export const TUBETES_POR_CAIXA: {
  medida: string
  cor: string | null
  unidades: number
}[] = [
  { medida: '70x3,0', cor: 'Marrom', unidades: 310 },
  { medida: '70x3,0', cor: 'Branco', unidades: 300 },
  { medida: '76x3,0', cor: 'Marrom', unidades: 280 },
  { medida: '50x2,5', cor: null, unidades: 400 },
  { medida: '40x2,0', cor: null, unidades: 520 },
  { medida: '30x1,5', cor: null, unidades: 750 },
]

export function unidadesPadrao(medida: string, cor: string) {
  return (
    TUBETES_POR_CAIXA.find((r) => r.medida === medida && r.cor === cor) ??
    TUBETES_POR_CAIXA.find((r) => r.medida === medida && r.cor === null)
  )?.unidades
}

/** Consumo médio de papel (kg) por tubo produzido — usado na estimativa. */
export const KG_POR_TUBO = 0.42

export const PRIMEIRO_ID_LIVRE = 1043

const OPERADORES = ['Carlos M.', 'Juliana R.', 'Anderson P.', 'Bruna S.']

export const ROLOS_INICIAIS: Rolo[] = (
  [
    ['12mm', 182.4, 6.2, '03/27'],
    ['12mm', 176.9, 6.2, '03/27'],
    ['18mm', 210.0, 7.1, '05/27'],
    ['18mm', 205.3, 7.1, '05/27'],
    ['18mm', 198.7, 7.1, '01/27'],
    ['24mm', 240.5, 7.8, '06/27'],
    ['24mm', 236.2, 7.8, '06/27'],
    ['30mm', 251.0, 8.0, '12/26'],
    ['30mm', 248.6, 8.0, '12/26'],
    ['30mm', 255.1, 8.0, '02/27'],
    ['38mm', 260.4, 8.4, '04/27'],
    ['50mm', 312.8, 9.5, '07/27'],
    ['50mm', 308.1, 9.5, '07/27'],
    ['50mm', 315.6, 9.5, '07/27'],
    ['70mm', 340.2, 10.2, '08/27'],
    ['70mm', 336.9, 10.2, '08/27'],
    ['100mm', 380.0, 11.0, '09/27'],
  ] as const
).map(([medida, pesoBruto, tara, validade], i) => ({
  id: `R-${1026 + i}`,
  medida,
  pesoBruto,
  tara,
  validade,
  entrada: `2026-10-${String(1 + (i % 13)).padStart(2, '0')}`,
}))

export const RESIDUOS_INICIAIS: Residuo[] = Array.from(
  { length: 24 },
  (_, i) => {
    const m = MEDIDAS[i % MEDIDAS.length]!
    return {
      id: 500 + i,
      data: `2026-10-${String(14 - Math.floor(i / 2)).padStart(2, '0')}`,
      origem: `Rolo R-${1000 + i} · ${m.medida}`,
      peso: Math.round((4 + ((i * 7.3) % 18)) * 10) / 10,
      operador: OPERADORES[i % OPERADORES.length]!,
    }
  },
)

export const TUBETES_INICIAIS: LoteTubete[] = [
  {
    id: 1,
    medida: '70x3,0',
    cor: 'Marrom',
    gramatura: 380,
    dataProducao: '2026-10-10',
    caixas: 24,
    unidadesPorCaixa: 310,
    perda: 35,
    operador: 'Juliana R.',
  },
  {
    id: 2,
    medida: '50x2,5',
    cor: 'Marrom',
    gramatura: 340,
    dataProducao: '2026-10-11',
    caixas: 18,
    unidadesPorCaixa: 400,
    perda: 20,
    operador: 'Carlos M.',
  },
  {
    id: 3,
    medida: '76x3,0',
    cor: 'Marrom',
    gramatura: 400,
    dataProducao: '2026-10-13',
    caixas: 12,
    unidadesPorCaixa: 280,
    perda: 12,
    operador: 'Bruna S.',
  },
]

export const PRODUCAO_INICIAL: ProducaoTubo[] = [
  {
    id: 1,
    destino: 'Linha 1 — Espiraladeira',
    data: '2026-10-13',
    espessura: '3,0 mm',
    tubo: '76 mm',
    capa: 'Kraft',
    codigos: {
      codCapa: ['CP-221'],
      codRotulo: ['RT-090'],
      ramenzoni400: ['R4-17', 'R4-18'],
      ramenzoni280: ['R2-05'],
      codCola: ['CL-PVA-3'],
    },
    operador: 'Anderson P.',
    perda: 6.5,
    container: 'C-12',
    carrinho: 'K-04',
  },
]
