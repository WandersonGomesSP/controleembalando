import * as React from 'react'
import { toast } from 'sonner'
import {
  type LoteTubete,
  type InsumoRolo,
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
  ProducaoTuboRow,
  ReferenciaInsumoRow,
  ReferenciaTubeteRow,
  ResiduoRow,
  RoloRow,
} from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

type Store = {
  rolos: Rolo[]
  residuos: Residuo[]
  tubetes: LoteTubete[]
  insumosRolos: InsumoRolo[]
  referenciasTubetes: ReferenciaTubete[]
  referenciasInsumos: ReferenciaInsumo[]
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
  sugerirCodigoInsumo: (tipo: TipoInsumo, medidaCategoria: string) => Promise<string>
  adicionarInsumoRolo: (
    insumo: Omit<InsumoRolo, 'dataRegistro' | 'status'>,
    codigoSugerido: string,
  ) => Promise<string>
  baixarInsumoRolo: (idCodigo: string) => Promise<void>
  ajustarPesoInsumo: (idCodigo: string, pesoLiqKg: number) => Promise<boolean>
  buscarInsumos: (termo: string) => Promise<InsumoRolo[]>
  buscarInsumoPorCodigo: (idCodigo: string) => Promise<InsumoRolo | null>
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
    gramatura: row.gramatura,
    dataProducao: row.data_producao,
    caixas: row.caixas,
    unidadesPorCaixa: row.unidades_por_caixa,
    perda: row.perda,
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
    status: row.status,
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

export function formatId(n: number) {
  return `R-${n}`
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [rolos, setRolos] = React.useState<Rolo[]>([])
  const [residuos, setResiduos] = React.useState<Residuo[]>([])
  const [tubetes, setTubetes] = React.useState<LoteTubete[]>([])
  const [insumosRolos, setInsumosRolos] = React.useState<InsumoRolo[]>([])
  const [referenciasTubetes, setReferenciasTubetes] = React.useState<ReferenciaTubete[]>([])
  const [referenciasInsumos, setReferenciasInsumos] = React.useState<ReferenciaInsumo[]>([])
  const [producao, setProducao] = React.useState<ProducaoTubo[]>([])
  const [proximoId, setProximoId] = React.useState(PRIMEIRO_ID_LIVRE)
  const [carregando, setCarregando] = React.useState(true)

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
        ])

      if (rolosResult.error) throw rolosResult.error
      if (residuosResult.error) throw residuosResult.error
      if (tubetesResult.error) throw tubetesResult.error
      if (producaoResult.error) throw producaoResult.error
      if (insumosResult.error) throw insumosResult.error
      if (referenciasTubetesResult.error) throw referenciasTubetesResult.error
      if (referenciasInsumosResult.error) throw referenciasInsumosResult.error
      if (!ativo) return

      const rolosCarregados = (rolosResult.data ?? []).map(mapearRolo)
      setRolos(rolosCarregados)
      setResiduos((residuosResult.data ?? []).map(mapearResiduo))
      setTubetes((tubetesResult.data ?? []).map(mapearTubete))
      setProducao((producaoResult.data ?? []).map(mapearProducao))
      setInsumosRolos((insumosResult.data ?? []).map(mapearInsumoRolo))
      setReferenciasTubetes(
        (referenciasTubetesResult.data ?? []).map(mapearReferenciaTubete),
      )
      setReferenciasInsumos(
        (referenciasInsumosResult.data ?? []).map(mapearReferenciaInsumo),
      )
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

  const value = React.useMemo<Store>(
    () => ({
      rolos,
      residuos,
      tubetes,
      insumosRolos,
      referenciasTubetes,
      referenciasInsumos,
      producao,
      proximoId,
      carregando,
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
      },
      adicionarTubetes: async (l) => {
        const { data, error } = await supabase
          .from('lotes_tubete')
          .insert({
            medida: l.medida,
            cor: l.cor,
            gramatura: l.gramatura,
            data_producao: l.dataProducao,
            caixas: l.caixas,
            unidades_por_caixa: l.unidadesPorCaixa,
            perda: l.perda,
            operador: l.operador,
          })
          .select('*')
          .single()
        if (error) throw error
        setTubetes((lista) => [mapearTubete(data), ...lista])
      },
      sugerirCodigoInsumo: async (tipo, medidaCategoria) => {
        const { data, error } = await supabase.rpc('proximo_codigo_insumo', {
          p_tipo: tipo,
          p_medida_categoria: medidaCategoria,
        })
        if (error) throw error
        return data
      },
      adicionarInsumoRolo: async (insumo, codigoSugerido) => {
        const { data, error } = await supabase.rpc('registrar_insumo_rolo', {
          p_tipo: insumo.tipo,
          p_medida_categoria: insumo.medidaCategoria,
          p_peso_liq_kg: insumo.pesoLiqKg,
          p_validade: insumo.validade,
          p_id_codigo: insumo.idCodigo === codigoSugerido ? null : insumo.idCodigo,
        })
        if (error) throw error
        const row = data?.[0]
        if (!row) throw new Error('O Supabase não retornou o rolo inserido.')
        const created = mapearInsumoRolo(row)
        setInsumosRolos((list) => [created, ...list])
        return created.idCodigo
      },
      baixarInsumoRolo: async (idCodigo) => {
        const { data, error } = await supabase.rpc('baixar_insumo_rolo', {
          p_id_codigo: idCodigo,
        })
        if (error) throw error
        if (!data) throw new Error('Rolo já baixado ou não encontrado.')
        setInsumosRolos((list) =>
          list.map((entry) =>
            entry.idCodigo === idCodigo ? { ...entry, status: 'BAIXADO' } : entry,
          ),
        )
      },
      ajustarPesoInsumo: async (idCodigo, pesoLiqKg) => {
        const { data, error } = await supabase
          .from('insumos_rolos')
          .update({ peso_liq_kg: pesoLiqKg })
          .eq('id_codigo', idCodigo)
          .eq('status', 'DISPONIVEL')
          .select('id_codigo')
          .maybeSingle()
        if (error) throw error
        if (!data) return false
        setInsumosRolos((list) =>
          list.map((entry) =>
            entry.idCodigo === idCodigo ? { ...entry, pesoLiqKg } : entry,
          ),
        )
        return true
      },
      buscarInsumos: async (termo) => {
        const filtro = termo.trim()
        if (!filtro) {
          const { data, error } = await supabase
            .from('insumos_rolos')
            .select('*')
            .eq('status', 'DISPONIVEL')
            .order('data_registro', { ascending: false })
          if (error) throw error
          return (data ?? []).map(mapearInsumoRolo)
        }

        const [codigoResult, categoriaResult] = await Promise.all([
          supabase
            .from('insumos_rolos')
            .select('*')
            .eq('id_codigo', filtro.toUpperCase())
            .eq('status', 'DISPONIVEL'),
          supabase
            .from('insumos_rolos')
            .select('*')
            .ilike('medida_categoria', `%${filtro}%`)
            .eq('status', 'DISPONIVEL'),
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
          .eq('status', 'DISPONIVEL')
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
      producao,
      proximoId,
      carregando,
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
