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
  dataProducao: string
  caixas: number
  unidadesPorCaixa: number
  perdaKg: number
  operador: string
}

export type TipoInsumo = 'ROTULO' | 'CAPA'
export type CatalogoChave = 'destinos' | 'espessuras' | 'tubos' | 'capas'

export type InsumoRolo = {
  idCodigo: string
  tipo: TipoInsumo
  medidaCategoria: string
  pesoLiqKg: number
  validade: string | null
  dataRegistro: string
}

export type ReferenciaTubete = {
  descricao: string
  medida: string
  cor: string | null
  tubetesPorCaixa: number
  estoqueMin: number | null
}

export type ReferenciaInsumo = {
  tipo: TipoInsumo
  medidaCategoria: string
  estoqueMinKg: number | null
  limiteCriticoKg: number | null
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
  quantidadeCarrinhos: number
  quantidadeContainers: number
  tubosPorCarrinho: number
  tubosPorContainer: number
  quantidadeTubos: number
}

export type CodigoGrupo = 'codCapa' | 'codRotulo' | 'codCola'

export const CODIGO_GRUPOS: { key: CodigoGrupo; label: string }[] = [
  { key: 'codCapa', label: 'Cód Capa' },
  { key: 'codRotulo', label: 'Cód Rótulo' },
  { key: 'codCola', label: 'Cód Cola' },
]

export type CapacidadeProducao = {
  medida: string
  tubosPorCarrinho: number
  tubosPorContainer: number
}

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
    dataProducao: '2026-10-10',
    caixas: 24,
    unidadesPorCaixa: 310,
    perdaKg: 0,
    operador: 'Juliana R.',
  },
  {
    id: 2,
    medida: '50x2,5',
    cor: 'Marrom',
    dataProducao: '2026-10-11',
    caixas: 18,
    unidadesPorCaixa: 400,
    perdaKg: 0,
    operador: 'Carlos M.',
  },
  {
    id: 3,
    medida: '76x3,0',
    cor: 'Marrom',
    dataProducao: '2026-10-13',
    caixas: 12,
    unidadesPorCaixa: 280,
    perdaKg: 0,
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
      codCola: ['CL-PVA-3'],
    },
    operador: 'Anderson P.',
    perda: 6.5,
    container: 'C-12',
    carrinho: 'K-04',
    quantidadeCarrinhos: 0,
    quantidadeContainers: 0,
    tubosPorCarrinho: 0,
    tubosPorContainer: 0,
    quantidadeTubos: 0,
  },
]
