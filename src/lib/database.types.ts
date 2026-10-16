import type {
  CodigoGrupo,
  CatalogoChave,
  TipoInsumo,
} from '@/lib/fixtures'

type Table<Row, Insert = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Partial<Insert>
  Relationships: []
}

export type RoloRow = {
  id: string
  medida: string
  peso_bruto: number
  tara: number
  validade: string
  entrada: string
}

export type ResiduoRow = {
  id: number
  data: string
  origem: string
  peso: number
  operador: string
}

export type LoteTubeteRow = {
  id: number
  medida: string
  cor: string
  gramatura: number
  data_producao: string
  caixas: number
  unidades_por_caixa: number
  perda: number
  operador: string
}

export type ProducaoTuboRow = {
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

export type InsumoRoloRow = {
  id_codigo: string
  tipo: TipoInsumo
  medida_categoria: string
  peso_liq_kg: number
  validade: string | null
  data_registro: string
}

export type ReferenciaTubeteRow = {
  descricao: string
  medida: string
  cor: string | null
  tubetes_por_caixa: number
  estoque_min: number | null
}

export type ReferenciaInsumoRow = {
  tipo: TipoInsumo
  medida_categoria: string
  estoque_min_kg: number | null
  limite_critico_kg: number | null
}

export type StockOperationLogRow = {
  id: number
  ocorrido_em: string
  acao: 'ENTRADA' | 'SAÍDA' | 'ALTERAÇÃO'
  entidade: string
  registro_id: string
  quantidade: number
  codigos: string[]
  operador: string
  ator_email: string | null
  ator_id: string | null
  detalhes: Record<string, unknown>
}

export type RoleUsuario = 'ADMIN' | 'OPERATOR'

export type UserRoleRow = {
  user_id: string
  role: RoleUsuario
  area: 'tubeteira' | 'rebobinadeira' | null
  created_at: string
}

export type DeveloperAccountRow = {
  email: string
}

export type CatalogoOperacionalRow = {
  chave: CatalogoChave
  valores: string[]
}

export type Database = {
  public: {
    Tables: {
      rolos: Table<
        RoloRow,
        Omit<RoloRow, 'id' | 'entrada'> & { id?: string; entrada?: string }
      >
      residuos: Table<ResiduoRow, Omit<ResiduoRow, 'id'>>
      lotes_tubete: Table<LoteTubeteRow, Omit<LoteTubeteRow, 'id'>>
      producao_tubos: Table<ProducaoTuboRow, Omit<ProducaoTuboRow, 'id'>>
      referencias_tubetes: Table<ReferenciaTubeteRow>
      insumos_rolos: Table<
        InsumoRoloRow,
        Omit<InsumoRoloRow, 'data_registro'> & {
          data_registro?: string
        }
      >
      referencias_insumos: Table<ReferenciaInsumoRow>
      user_roles: Table<UserRoleRow, Omit<UserRoleRow, 'created_at'>>
      developer_accounts: Table<DeveloperAccountRow>
      catalogos_operacionais: Table<CatalogoOperacionalRow>
      stock_operation_logs: Table<StockOperationLogRow>
      stock_code_registry: Table<{ codigo: string; tabela_origem: string }>
    }
    Views: Record<string, never>
    Functions: {
      adicionar_rolos: {
        Args: {
          p_medida: string
          p_peso_bruto: number
          p_tara: number
          p_validade: string
          p_quantidade: number
        }
        Returns: RoloRow[]
      }
      dar_baixa_rolo: {
        Args: { p_id: string; p_residuo: number; p_operador?: string }
        Returns: boolean
      }
      proximo_codigo_insumo: {
        Args: { p_tipo: TipoInsumo; p_medida_categoria: string }
        Returns: string
      }
      consultar_codigos_insumo: {
        Args: {
          p_tipo: TipoInsumo
          p_medida_categoria: string
          p_quantidade: number
        }
        Returns: { codigos: string[]; maior_codigo: string | null }[]
      }
      registrar_insumos_rolos: {
        Args: {
          p_tipo: TipoInsumo
          p_medida_categoria: string
          p_peso_liq_kg: number
          p_validade: string | null
          p_quantidade: number
        }
        Returns: InsumoRoloRow[]
      }
      registrar_insumo_rolo: {
        Args: {
          p_tipo: TipoInsumo
          p_medida_categoria: string
          p_peso_liq_kg: number
          p_validade: string | null
          p_id_codigo?: string | null
        }
        Returns: InsumoRoloRow[]
      }
      baixar_insumo_rolo: {
        Args: { p_id_codigo: string }
        Returns: boolean
      }
      current_user_access: {
        Args: Record<string, never>
        Returns: { role: string; area: string | null }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}