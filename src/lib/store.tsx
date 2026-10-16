import * as React from 'react'
import { toast } from 'sonner'
import {
  type LoteTubete,
  type InsumoRolo,
  type CatalogoChave,
  type ProducaoTubo,
  type ReferenciaInsumo,
  type ReferenciaTubete,
  type Residuo,
  type Rolo,
  type TipoInsumo,
} from '@/lib/fixtures'
import type {
  LoteTubeteRow,
  InsumoRoloRow,
  CatalogoOperacionalRow,
  ProducaoTuboRow,
  ReferenciaInsumoRow,
  ReferenciaTubeteRow,
  ResiduoRow,
  RoloRow,
  StockOperationLogRow,
} from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

type Store = {
  rolos: Rolo[]
  residuos: Residuo[]
  tubetes: LoteTubete[]
  insumosRolos: InsumoRolo[]
  historicoEstoque: StockOperationLogRow[]
  historicoTemMais: boolean
  atualizarHistoricoEstoque: () => Promise<void>
  carregarMaisHistoricoEstoque: () => Promise<void>
  consultarHistoricoEstoque: (
    filtros: FiltrosHistoricoEstoque,
  ) => Promise<{ registros: StockOperationLogRow[]; temMais: boolean }>
  referenciasTubetes: ReferenciaTubete[]
  referenciasInsumos: ReferenciaInsumo[]
  catalogos: Record<CatalogoChave, string[]>
  producao: ProducaoTubo[]
  proximoId: number
  carregando: boolean
  adicionarRolos: (
    dados: Omit<Rolo, 'id' | 'entrada'>,
    quantidade: number,
  ) => Promise<string[]>
  darBaixa: (id: string, residuoKg: number) => Promise<void>
  ajustarPeso: (id: string, pesoBruto: number, tara: number) => Promise<boolean>
  adicionarProducao: (p: Omit<ProducaoTubo, 'id'>) => Promise<void>
  adicionarTubetes: (l: Omit<LoteTubete, 'id'>) => Promise<void>
  sugerirCodigosInsumo: (
    tipo: TipoInsumo,
    medidaCategoria: string,
    quantidade: number,
  ) => Promise<{ codigos: string[]; maiorCodigo: string | null }>
  adicionarInsumoRolo: (
    insumo: Omit<InsumoRolo, 'dataRegistro' | 'idCodigo'>,
    quantidade: number,
  ) => Promise<string[]>
  baixarInsumoRolo: (idCodigo: string) => Promise<void>
  ajustarPesoInsumo: (idCodigo: string, pesoLiqKg: number) => Promise<boolean>
  buscarInsumos: (termo: string) => Promise<InsumoRolo[]>
  buscarInsumoPorCodigo: (idCodigo: string) => Promise<InsumoRolo | null>
}

export type FiltrosHistoricoEstoque = {
  entidades?: string[]
  acao?: StockOperationLogRow['acao'] | ''
  busca?: string
  operador?: string
  de?: string
  ate?: string
  inicio?: number
  limite?: number
}

const StoreContext = React.createContext<Store | null>(null)
const PRIMEIRO_ID_LIVRE = 1043

function erroMensagem(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return 'Verifique sua conexão e tente novamente.'
}

function mapearRolo(row: RoloRow): Rolo {
  return {
    id: row.id,
    medida: row.medida,
    pesoBruto: Number(row.peso_bruto),
    tara: Number(row.tara),
    validade: row.validade,
    entrada: row.entrada,
  }
}

function mapearResiduo(row: ResiduoRow): Residuo {
  return { ...row, peso: Number(row.peso) }
}

function mapearTubete(row: LoteTubeteRow): LoteTubete {
  return {
    id: row.id,
    medida: row.medida,
    cor: row.cor,
    dataProducao: row.data_producao,
    caixas: row.caixas,
    unidadesPorCaixa: row.unidades_por_caixa,
    perdaKg: Number(row.perda_kg),
    operador: row.operador,
  }
}

function mapearProducao(row: ProducaoTuboRow): ProducaoTubo {
  return { ...row, perda: Number(row.perda) }
}

function mapearInsumoRolo(row: InsumoRoloRow): InsumoRolo {
  return {
    idCodigo: row.id_codigo,
    tipo: row.tipo,
    medidaCategoria: row.medida_categoria,
    pesoLiqKg: Number(row.peso_liq_kg),
    validade: row.validade,
    dataRegistro: row.data_registro,
  }
}

function mapearReferenciaTubete(row: ReferenciaTubeteRow): ReferenciaTubete {
  return {
    descricao: row.descricao,
    medida: row.medida,
    cor: row.cor,
    tubetesPorCaixa: row.tubetes_por_caixa,
    estoqueMin: row.estoque_min,
  }
}

function mapearReferenciaInsumo(row: ReferenciaInsumoRow): ReferenciaInsumo {
  return {
    tipo: row.tipo,
    medidaCategoria: row.medida_categoria,
    estoqueMinKg: row.estoque_min_kg,
    limiteCriticoKg: row.limite_critico_kg,
  }
}

function mapearCatalogos(rows: CatalogoOperacionalRow[]): Record<CatalogoChave, string[]> {
  const catalogos: Record<CatalogoChave, string[]> = {
    destinos: [],
    espessuras: [],
    tubos: [],
    capas: [],
  }
  for (const row of rows) catalogos[row.chave] = row.valores
  return catalogos
}

export function formatId(n: number) {
  return `R-${n}`
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [rolos, setRolos] = React.useState<Rolo[]>([])
  const [residuos, setResiduos] = React.useState<Residuo[]>([])
  const [tubetes, setTubetes] = React.useState<LoteTubete[]>([])
  const [insumosRolos, setInsumosRolos] = React.useState<InsumoRolo[]>([])
  const [historicoEstoque, setHistoricoEstoque] = React.useState<
    StockOperationLogRow[]
  >([])
  const [historicoTemMais, setHistoricoTemMais] = React.useState(false)
  const [referenciasTubetes, setReferenciasTubetes] = React.useState<ReferenciaTubete[]>([])
  const [referenciasInsumos, setReferenciasInsumos] = React.useState<ReferenciaInsumo[]>([])
  const [catalogos, setCatalogos] = React.useState<Record<CatalogoChave, string[]>>({
    destinos: [],
    espessuras: [],
    tubos: [],
    capas: [],
  })
  const [producao, setProducao] = React.useState<ProducaoTubo[]>([])
  const [proximoId, setProximoId] = React.useState(PRIMEIRO_ID_LIVRE)
  const [carregando, setCarregando] = React.useState(true)

  const atualizarHistoricoEstoque = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('stock_operation_logs')
      .select('*')
      .order('ocorrido_em', { ascending: false })
      .order('id', { ascending: false })
      .range(0, 99)
    if (error) {
      toast.error('Não foi possível atualizar o histórico de operações.', {
        description: erroMensagem(error),
      })
      return
    }
    setHistoricoEstoque(data ?? [])
    setHistoricoTemMais((data?.length ?? 0) === 100)
  }, [])

  const carregarMaisHistoricoEstoque = React.useCallback(async () => {
    const inicio = historicoEstoque.length
    const { data, error } = await supabase
      .from('stock_operation_logs')
      .select('*')
      .order('ocorrido_em', { ascending: false })
      .order('id', { ascending: false })
      .range(inicio, inicio + 99)
    if (error) {
      toast.error('Não foi possível carregar mais operações.', {
        description: erroMensagem(error),
      })
      return
    }
    setHistoricoEstoque((logs) => [...logs, ...(data ?? [])])
    setHistoricoTemMais((data?.length ?? 0) === 100)
  }, [historicoEstoque.length])

  const consultarHistoricoEstoque = React.useCallback(
    async (filtros: FiltrosHistoricoEstoque) => {
      const inicio = filtros.inicio ?? 0
      const limite = filtros.limite ?? 50
      let query = supabase
        .from('stock_operation_logs')
        .select('*')
        .order('ocorrido_em', { ascending: false })
        .order('id', { ascending: false })
      if (filtros.entidades?.length) query = query.in('entidade', filtros.entidades)
      if (filtros.acao) query = query.eq('acao', filtros.acao)
      if (filtros.operador?.trim()) {
        query = query.ilike('operador', `%${filtros.operador.trim()}%`)
      }
      if (filtros.de) {
        query = query.gte(
          'ocorrido_em',
          new Date(`${filtros.de}T00:00:00`).toISOString(),
        )
      }
      if (filtros.ate) {
        const exclusiveEnd = new Date(`${filtros.ate}T00:00:00`)
        exclusiveEnd.setDate(exclusiveEnd.getDate() + 1)
        query = query.lt('ocorrido_em', exclusiveEnd.toISOString())
      }
      const termo = filtros.busca?.trim()
      if (termo) {
        const termoSeguro = termo.replace(/[^\p{L}\p{N}._@ -]/gu, ' ')
        const codigo = /^[a-zA-Z0-9._-]+$/.test(termoSeguro)
          ? `,codigos.cs.{${termoSeguro}}`
          : ''
        query = query.or(
          `registro_id.ilike.%${termoSeguro}%,entidade.ilike.%${termoSeguro}%,operador.ilike.%${termoSeguro}%,ator_email.ilike.%${termoSeguro}${codigo}`,
        )
      }
      const { data, error } = await query.range(inicio, inicio + limite)
      if (error) throw error
      const registros = data ?? []
      return { registros: registros.slice(0, limite), temMais: registros.length > limite }
    },
    [],
  )

  React.useEffect(() => {
    let ativo = true

    async function carregar() {
      const [
        rolosResult,
        residuosResult,
        tubetesResult,
        producaoResult,
        insumosResult,
        referenciasTubetesResult,
        referenciasInsumosResult,
        catalogosResult,
        historicoResult,
      ] =
        await Promise.all([
          supabase.from('rolos').select('*').order('id'),
          supabase.from('residuos').select('*').order('id', { ascending: false }),
          supabase.from('lotes_tubete').select('*').order('id', { ascending: false }),
          supabase.from('producao_tubos').select('*').order('id', { ascending: false }),
          supabase.from('insumos_rolos').select('*').order('data_registro', { ascending: false }),
          supabase.from('referencias_tubetes').select('*').order('descricao'),
          supabase
            .from('referencias_insumos')
            .select('*')
            .order('tipo')
            .order('medida_categoria'),
          supabase.from('catalogos_operacionais').select('*').order('chave'),
          supabase
            .from('stock_operation_logs')
            .select('*')
            .order('ocorrido_em', { ascending: false })
            .order('id', { ascending: false })
            .range(0, 99),
        ])

      if (rolosResult.error) throw rolosResult.error
      if (residuosResult.error) throw residuosResult.error
      if (tubetesResult.error) throw tubetesResult.error
      if (producaoResult.error) throw producaoResult.error
      if (insumosResult.error) throw insumosResult.error
      if (referenciasTubetesResult.error) throw referenciasTubetesResult.error
      if (referenciasInsumosResult.error) throw referenciasInsumosResult.error
      if (catalogosResult.error) throw catalogosResult.error
      if (historicoResult.error) throw historicoResult.error
      if (!ativo) return

      const rolosCarregados = (rolosResult.data ?? []).map(mapearRolo)
      setRolos(rolosCarregados)
      setResiduos((residuosResult.data ?? []).map(mapearResiduo))
      setTubetes((tubetesResult.data ?? []).map(mapearTubete))
      setProducao((producaoResult.data ?? []).map(mapearProducao))
      setInsumosRolos((insumosResult.data ?? []).map(mapearInsumoRolo))
      setHistoricoEstoque(historicoResult.data ?? [])
      setHistoricoTemMais((historicoResult.data?.length ?? 0) === 100)
      setReferenciasTubetes(
        (referenciasTubetesResult.data ?? []).map(mapearReferenciaTubete),
      )
      setReferenciasInsumos(
        (referenciasInsumosResult.data ?? []).map(mapearReferenciaInsumo),
      )
      setCatalogos(mapearCatalogos(catalogosResult.data ?? []))
      setProximoId(
        Math.max(
          PRIMEIRO_ID_LIVRE,
          ...rolosCarregados.map((rolo) => Number(rolo.id.replace(/^R-/, '')) + 1),
        ),
      )
    }

    carregar()
      .catch((error: unknown) => {
        if (ativo) {
          toast.error('Não foi possível carregar os dados do Supabase.', {
            description: erroMensagem(error),
          })
        }
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [])

  React.useEffect(() => {
    let erroNotificado = false
    const channel = supabase
      .channel('stock-operation-history')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_operation_logs' },
        () => void atualizarHistoricoEstoque(),
      )
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          erroNotificado = false
          return
        }
        if (
          (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') &&
          !erroNotificado
        ) {
          erroNotificado = true
          toast.error('Atualização automática do histórico indisponível.', {
            description: error?.message ?? 'Use o botão para atualizar manualmente.',
          })
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [atualizarHistoricoEstoque])

  const value = React.useMemo<Store>(
    () => ({
      rolos,
      residuos,
      tubetes,
      insumosRolos,
      referenciasTubetes,
      referenciasInsumos,
      catalogos,
      producao,
      proximoId,
      carregando,
      historicoEstoque,
      historicoTemMais,
      atualizarHistoricoEstoque,
      carregarMaisHistoricoEstoque,
      consultarHistoricoEstoque,
      adicionarRolos: async (dados, quantidade) => {
        const { data, error } = await supabase.rpc('adicionar_rolos', {
          p_medida: dados.medida,
          p_peso_bruto: dados.pesoBruto,
          p_tara: dados.tara,
          p_validade: dados.validade,
          p_quantidade: quantidade,
        })
        if (error) throw error
        const novos = (data ?? []).map(mapearRolo)
        setRolos((lista) => [...lista, ...novos])
        setProximoId((atual) => atual + novos.length)
        await atualizarHistoricoEstoque()
        return novos.map((rolo) => rolo.id)
      },
      darBaixa: async (id, residuoKg) => {
        const rolo = rolos.find((r) => r.id === id)
        const { data, error } = await supabase.rpc('dar_baixa_rolo', {
          p_id: id,
          p_residuo: residuoKg,
        })
        if (error) throw error
        if (!data) return
        setRolos((r) => r.filter((x) => x.id !== id))
        if (rolo && residuoKg > 0) {
          setResiduos((list) => [
            {
              id: Date.now(),
              data: new Date().toISOString().slice(0, 10),
              origem: `Rolo ${rolo.id} · ${rolo.medida}`,
              peso: residuoKg,
              operador: 'Operador atual',
            },
            ...list,
          ])
        }
        await atualizarHistoricoEstoque()
      },
      ajustarPeso: async (id, pesoBruto, tara) => {
        const { data, error } = await supabase
          .from('rolos')
          .update({ peso_bruto: pesoBruto, tara })
          .eq('id', id)
          .select('id')
          .maybeSingle()
        if (error) throw error
        if (!data) return false
        setRolos((r) =>
          r.map((x) => (x.id === id ? { ...x, pesoBruto, tara } : x)),
        )
        await atualizarHistoricoEstoque()
        return true
      },
      adicionarProducao: async (p) => {
        const { data, error } = await supabase
          .from('producao_tubos')
          .insert({
            destino: p.destino,
            data: p.data,
            espessura: p.espessura,
            tubo: p.tubo,
            capa: p.capa,
            codigos: p.codigos,
            operador: p.operador,
            perda: p.perda,
            container: p.container,
            carrinho: p.carrinho,
          })
          .select('*')
          .single()
        if (error) throw error
        setProducao((lista) => [mapearProducao(data), ...lista])
        await atualizarHistoricoEstoque()
      },
      adicionarTubetes: async (l) => {
        const { data, error } = await supabase
          .from('lotes_tubete')
          .insert({
            medida: l.medida,
            cor: l.cor,
            data_producao: l.dataProducao,
            caixas: l.caixas,
            unidades_por_caixa: l.unidadesPorCaixa,
            perda_kg: l.perdaKg,
            operador: l.operador,
          })
          .select('*')
          .single()
        if (error) throw error
        setTubetes((lista) => [mapearTubete(data), ...lista])
        await atualizarHistoricoEstoque()
      },
      sugerirCodigosInsumo: async (tipo, medidaCategoria, quantidade) => {
        const { data, error } = await supabase.rpc('consultar_codigos_insumo', {
          p_tipo: tipo,
          p_medida_categoria: medidaCategoria,
          p_quantidade: quantidade,
        })
        if (error) throw error
        const preview = data?.[0]
        if (!preview) throw new Error('O Supabase não retornou os códigos disponíveis.')
        return { codigos: preview.codigos, maiorCodigo: preview.maior_codigo }
      },
      adicionarInsumoRolo: async (insumo, quantidade) => {
        const { data, error } = await supabase.rpc('registrar_insumos_rolos', {
          p_tipo: insumo.tipo,
          p_medida_categoria: insumo.medidaCategoria,
          p_peso_liq_kg: insumo.pesoLiqKg,
          p_validade: insumo.validade,
          p_quantidade: quantidade,
        })
        if (error) throw error
        if (!data?.length) throw new Error('O Supabase não retornou os rolos inseridos.')
        const created = data.map(mapearInsumoRolo)
        setInsumosRolos((list) => [...created, ...list])
        await atualizarHistoricoEstoque()
        return created.map((rolo) => rolo.idCodigo)
      },
      baixarInsumoRolo: async (idCodigo) => {
        const { data, error } = await supabase.rpc('baixar_insumo_rolo', {
          p_id_codigo: idCodigo,
        })
        if (error) throw error
        if (!data) throw new Error('Rolo já baixado ou não encontrado.')
        setInsumosRolos((list) => list.filter((entry) => entry.idCodigo !== idCodigo))
        await atualizarHistoricoEstoque()
      },
      ajustarPesoInsumo: async (idCodigo, pesoLiqKg) => {
        const { data, error } = await supabase
          .from('insumos_rolos')
          .update({ peso_liq_kg: pesoLiqKg })
          .eq('id_codigo', idCodigo)
          .select('id_codigo')
          .maybeSingle()
        if (error) throw error
        if (!data) return false
        setInsumosRolos((list) =>
          list.map((entry) =>
            entry.idCodigo === idCodigo ? { ...entry, pesoLiqKg } : entry,
          ),
        )
        await atualizarHistoricoEstoque()
        return true
      },
      buscarInsumos: async (termo) => {
        const filtro = termo.trim()
        if (!filtro) {
          const { data, error } = await supabase
            .from('insumos_rolos')
            .select('*')
            .order('data_registro', { ascending: false })
          if (error) throw error
          return (data ?? []).map(mapearInsumoRolo)
        }

        const [codigoResult, categoriaResult] = await Promise.all([
          supabase
            .from('insumos_rolos')
            .select('*')
            .eq('id_codigo', filtro.toUpperCase()),
          supabase
            .from('insumos_rolos')
            .select('*')
            .ilike('medida_categoria', `%${filtro}%`),
        ])
        if (codigoResult.error) throw codigoResult.error
        if (categoriaResult.error) throw categoriaResult.error

        const registros = new Map<string, InsumoRolo>()
        for (const row of [...(codigoResult.data ?? []), ...(categoriaResult.data ?? [])]) {
          registros.set(row.id_codigo, mapearInsumoRolo(row))
        }
        return [...registros.values()]
      },
      buscarInsumoPorCodigo: async (idCodigo) => {
        const { data, error } = await supabase
          .from('insumos_rolos')
          .select('*')
          .eq('id_codigo', idCodigo.trim().toUpperCase())
          .maybeSingle()
        if (error) throw error
        return data ? mapearInsumoRolo(data) : null
      },
    }),
    [
      rolos,
      residuos,
      tubetes,
      insumosRolos,
      referenciasTubetes,
      referenciasInsumos,
      catalogos,
      producao,
      proximoId,
      carregando,
      historicoEstoque,
      historicoTemMais,
      atualizarHistoricoEstoque,
      carregarMaisHistoricoEstoque,
      consultarHistoricoEstoque,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = React.useContext(StoreContext)
  if (!ctx) throw new Error('useStore precisa de <StoreProvider>')
  return ctx
}

export const pesoLiquido = (r: Rolo) => r.pesoBruto - r.tara

export const kg = (n: number, digits = 1) =>
  n.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

export const int = (n: number) => n.toLocaleString('pt-BR')

export const dataBR = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y?.slice(2)}`
}
