import type { CodigoGrupo, CatalogoChave, TipoInsumo } from '@/lib/fixtures'

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
  data_producao: string
  caixas: number
  unidades_por_caixa: number
  perda_kg: number
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
  quantidade_carrinhos: number
  quantidade_containers: number
  tubos_por_carrinho: number
  tubos_por_container: number
  quantidade_tubos: number
}

export type InsumoRoloRow = {
  id_codigo: string
  tipo: TipoInsumo
  medida_categoria: string
  peso_liq_kg: number
  peso_alterado: boolean
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
  corrige_log_id: number | null
}

export type RoleUsuario = 'ADMIN' | 'OPERATOR'
export type AreaOperacional = 'tubeteira' | 'rebobinadeira' | 'cobrideira'

export type UserRoleRow = {
  user_id: string
  role: RoleUsuario
  area: AreaOperacional | null
  created_at: string
}

export type CobrideiraBobinaRow = {
  numero_bobina: string
  operador: string
  cod_bob: string
  data: string
  aba: string
  material: string
  largura: number
  micragem: number
  peso_bruto: number
  peso_final: number
  peso_cilindro: number
  peso_liquido: number
  peso_filme_bopp_kg: number | null
  peso_cola_seca_kg: number | null
  consumo_cola_liquida_kg: number | null
  gramatura_seca_g_m2: number | null
  metragem: number
  perda_kg: number
  fornecedor_filme: string
  vareta_g: number
  kg_cola: number
  lote_cola: string
  codigo_interno: string
  fornecedor_cola: string
  turno: string
  linha: string
  cor_fundo: string
  pigmento_kg: number
  cor_mistura: string
  pigmento_mistura: string
  cliente: string
  cor_impressao: string
  emenda: boolean
  codigo_emenda: string
  created_by: string
  created_at: string
  updated_at?: string
  updated_by?: string | null
}


export type CobrideiraBobinaLixeiraRow = {
  numero_bobina: string
  dados: CobrideiraBobinaRow
  excluida_em: string
  excluida_por: string | null
}

export type CobrideiraBobinaInsert = Omit<
  CobrideiraBobinaRow,
  'peso_liquido' | 'peso_filme_bopp_kg' | 'peso_cola_seca_kg' | 'consumo_cola_liquida_kg' | 'gramatura_seca_g_m2' | 'created_by' | 'created_at' | 'operador'
> & { operador?: string }

export type DeveloperAccountRow = {
  email: string
}

export type CatalogoOperacionalRow = {
  chave: CatalogoChave
  valores: string[]
}

export type CapacidadeProducaoRow = {
  medida: string
  tubos_por_carrinho: number
  tubos_por_container: number
}


export type RebobinadeiraProdutoRow = {
  codigo: string
  descricao: string
  material: string
  cor: string
  largura_jumbo_mm: number | null
  tipo_produto: string
  lead_time_dias: number | null
  piso_minimo_jumbos: number
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export type RebobinadeiraEstoqueMinimoRow = {
  codigo: string
  descricao: string
  material: string
  cor: string
  largura_jumbo_mm: number | null
  tipo_produto: string
  lead_time_dias: number | null
  piso_minimo_jumbos: number
  consumo_mensal_kg: number
  consumo_diario_kg: number
  estoque_minimo_calculado_kg: number
  peso_medio_jumbo_kg: number
  jumbos_consumidos: number
  estoque_minimo_jumbos: number
  consumo_semanal_m: number
  estoque_minimo_recomendado_m: number
  metragem_media_jumbo_m: number
  estoque_minimo_m: number
  possui_consumo: boolean
  estoque_minimo_kg: number
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
        Omit<InsumoRoloRow, 'data_registro' | 'peso_alterado'> & {
          data_registro?: string
          peso_alterado?: boolean
        }
      >
      referencias_insumos: Table<ReferenciaInsumoRow>
      user_roles: Table<UserRoleRow, Omit<UserRoleRow, 'created_at'>>
      developer_accounts: Table<DeveloperAccountRow>
      catalogos_operacionais: Table<CatalogoOperacionalRow>
      operadores_operacionais: Table<{ nome: string }>
      capacidades_producao: Table<CapacidadeProducaoRow>
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
      correct_stock_record: {
        Args: {
          p_log_id: number
          p_changes: Record<string, unknown>
          p_motivo: string
          p_actor_email: string
          p_actor_id: string
        }
        Returns: Record<string, unknown>
      }
      delete_admin_summary_record: {
        Args: {
          p_entidade: string
          p_registro_id: string
          p_motivo: string
          p_actor_email: string
          p_actor_id: string
        }
        Returns: undefined
      }
      correct_production_record: {
        Args: {
          p_log_id: number
          p_changes: Record<string, unknown>
          p_motivo: string
          p_actor_email: string
          p_actor_id: string
        }
        Returns: Record<string, unknown>
      }
      registrar_producao_tubos_com_baixa: {
        Args: {
          p_data: string
          p_espessura: string
          p_tubo: string
          p_capa: string
          p_codigos: Record<CodigoGrupo, string[]>
          p_operador: string
          p_perda: number
          p_container: string
          p_carrinho: string
          p_quantidade_carrinhos: number
          p_quantidade_containers: number
          p_tubos_por_carrinho: number
          p_tubos_por_container: number
        }
        Returns: ProducaoTuboRow[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
  rebobinadeira: {
    Tables: {
      produtos_jumbo: Table<RebobinadeiraProdutoRow>
      bobinas: Table<{
        id: number
        numero_bobina: string
        numero_normalizado: string
        data: string
        material: string
        produto_codigo: string
        largura_jumbo_mm: number | null
        peso_jumbo_kg: number | null
        cor: string
        linha: string
        metragem_bobina_m: number | null
      }>
      staging_planilha: Table<{ id: number; lote_id: string; linha_csv: number }>
      importacao_log: Table<{ id: string; origem: string; nome_arquivo: string | null; linhas_recebidas: number; linhas_gravadas: number; status: string | null; criado_em: string }>
    }
    Views: {
      vw_estoque_minimo: {
        Row: RebobinadeiraEstoqueMinimoRow
        Relationships: []
      }
    }
    Functions: {
      processar_lote: { Args: { p_lote: string }; Returns: number }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
  cobrideira: {
    Tables: {
      bobinas: Table<CobrideiraBobinaRow, CobrideiraBobinaInsert>
      bobinas_lixeira: Table<CobrideiraBobinaLixeiraRow, Omit<CobrideiraBobinaLixeiraRow, 'excluida_em'>>
      operadores: Table<{ nome: string; turno: '1º TURNO' | '2º TURNO' }>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
