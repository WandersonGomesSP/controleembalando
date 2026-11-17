-- Estoque mínimo da Rebobinadeira: catálogo, importação e indicadores.
CREATE SCHEMA IF NOT EXISTS rebobinadeira;

CREATE OR REPLACE FUNCTION rebobinadeira.para_numeric_br(txt text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE
    WHEN NULLIF(TRIM(txt), '') IS NULL THEN NULL
    WHEN POSITION(',' IN TRIM(txt)) > 0
      THEN REPLACE(REPLACE(TRIM(txt), '.', ''), ',', '.')::numeric
    ELSE TRIM(txt)::numeric
  END;
$function$;

CREATE OR REPLACE FUNCTION rebobinadeira.normaliza_numero(txt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  SELECT NULLIF(REGEXP_REPLACE(COALESCE(txt, ''), '\D', '', 'g'), '');
$function$;

CREATE OR REPLACE FUNCTION rebobinadeira.codigo_produto(
  p_material text, p_cor text, p_largura numeric, p_tipo text
)
RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  SELECT CONCAT_WS('|',
    UPPER(REGEXP_REPLACE(TRIM(COALESCE(p_material, '')), '\s+', ' ', 'g')),
    UPPER(REGEXP_REPLACE(TRIM(COALESCE(p_cor, '')), '\s+', ' ', 'g')),
    CASE
      WHEN UPPER(COALESCE(p_material, '')) LIKE '%CREPE%'
        OR UPPER(COALESCE(p_material, '')) LIKE '%DUPLA FACE%'
        OR UPPER(COALESCE(p_material, '')) LIKE '%KRAFT%'
      THEN 'SEM_LARGURA'
      ELSE COALESCE(ROUND(p_largura)::text, 'SEM_LARGURA')
    END,
    UPPER(REGEXP_REPLACE(TRIM(COALESCE(NULLIF(p_tipo, ''), 'PADRÃO')), '\s+', ' ', 'g'))
  );
$function$;

CREATE OR REPLACE FUNCTION rebobinadeira.lead_time_padrao(
  p_material text, p_cor text, p_largura numeric, p_tipo text
)
RETURNS integer LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE
    WHEN UPPER(COALESCE(p_material, '')) IN ('PEBD PRETO', 'PERSONALIZADAS') THEN NULL
    WHEN UPPER(COALESCE(p_tipo, 'PADRÃO')) = 'IMPRESSA (DE LINHA)' THEN 30
    WHEN UPPER(COALESCE(p_material, '')) IN ('CREPE BR', 'DUPLA FACE', 'CREPE KT', 'KRAFT', 'KRAFT LISA') THEN 90
    WHEN UPPER(COALESCE(p_cor, '')) = 'CRISTAL'
      AND ROUND(COALESCE(p_largura, 0)) IN (1200, 1265, 1270) THEN 7
    WHEN UPPER(COALESCE(p_cor, '')) = 'MARROM'
      AND ROUND(COALESCE(p_largura, 0)) = 1265
      AND UPPER(COALESCE(p_material, '')) = '20 MICRAS' THEN 15
    WHEN UPPER(COALESCE(p_material, '')) IN ('20 MICRAS', '25 MICRAS', '28 MICRAS')
      AND UPPER(COALESCE(p_cor, '')) IN (
        'AMARELO','AZUL','AZUL CLARO','BRANCO','CINZA','CRISTAL','LARANJA',
        'LILÁS','MARROM','METALIZADA','PRETO','ROSA','ROXO','TRANSPARENTE',
        'VERDE','VERDE CLARO','VERMELHO'
      ) THEN 30
    ELSE NULL
  END;
$function$;

CREATE TABLE IF NOT EXISTS rebobinadeira.produtos_jumbo (
  codigo text PRIMARY KEY,
  descricao text NOT NULL,
  material text NOT NULL,
  cor text NOT NULL,
  largura_jumbo_mm numeric(8,2),
  tipo_produto text NOT NULL DEFAULT 'PADRÃO',
  lead_time_dias integer CHECK (lead_time_dias IS NULL OR lead_time_dias >= 0),
  piso_minimo_jumbos integer NOT NULL DEFAULT 1 CHECK (piso_minimo_jumbos >= 1),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION rebobinadeira.preparar_produto_jumbo()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.lead_time_dias IS NULL THEN
    NEW.lead_time_dias := rebobinadeira.lead_time_padrao(
      NEW.material, NEW.cor, NEW.largura_jumbo_mm, NEW.tipo_produto
    );
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_preparar_produto_jumbo ON rebobinadeira.produtos_jumbo;
CREATE TRIGGER trg_preparar_produto_jumbo
BEFORE INSERT OR UPDATE OF material, cor, largura_jumbo_mm, tipo_produto, lead_time_dias
ON rebobinadeira.produtos_jumbo
FOR EACH ROW EXECUTE FUNCTION rebobinadeira.preparar_produto_jumbo();

CREATE TABLE IF NOT EXISTS rebobinadeira.staging_planilha (
  id bigserial PRIMARY KEY, lote_id uuid NOT NULL, linha_csv integer NOT NULL,
  data_texto text, maquina text, setup text, numero_bobina text, turno_texto text,
  material text, largura_bobina_texto text, peso_bobina_texto text, fornec_filme text,
  lote_cola text, fornec_cola text, medida text, largura_fita_texto text,
  comp_fita_texto text, cor text, linha text, cliente text, caixas_texto text,
  pcts_texto text, rolos_texto text, refugos_texto text, fitas_rebobinadas_texto text,
  refilo_texto text, perda_producao_texto text, perda_filme_texto text,
  metragem_bobina_texto text, metragem_unica_texto text, area_bobina_texto text,
  observacoes text, peso_unico_texto text, area_unica_texto text,
  importado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rebobinadeira.bobinas (
  id bigserial PRIMARY KEY,
  numero_bobina text NOT NULL, numero_normalizado text NOT NULL UNIQUE,
  data date NOT NULL, maquina text, setup boolean NOT NULL DEFAULT false, turno text,
  material text NOT NULL, produto_codigo text NOT NULL REFERENCES rebobinadeira.produtos_jumbo(codigo),
  largura_jumbo_mm numeric(8,2), peso_jumbo_kg numeric(10,3),
  fornec_filme text, lote_cola text, fornec_cola text, medida text,
  largura_fita_mm numeric(10,2), comp_fita_mm numeric(10,2),
  cor text NOT NULL, linha text NOT NULL DEFAULT 'PADRÃO', cliente text,
  caixas integer, pcts integer, rolos integer, refugos numeric(10,3),
  fitas_rebobinadas numeric(10,3), refilo_kg numeric(10,3),
  perda_producao_kg numeric(10,3), perda_filme_kg numeric(10,3),
  metragem_bobina_m numeric(12,2), metragem_unica_m numeric(12,2),
  area_bobina_m2 numeric(12,2), peso_unico_kg numeric(10,3),
  area_unica_m2 numeric(12,3), observacoes text, lote_importacao uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rebobinadeira.importacao_log (
  id uuid PRIMARY KEY, origem text NOT NULL, nome_arquivo text,
  linhas_recebidas integer NOT NULL DEFAULT 0, linhas_gravadas integer NOT NULL DEFAULT 0,
  status text, criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION rebobinadeira.processar_lote(p_lote uuid)
RETURNS integer LANGUAGE plpgsql AS $function$
DECLARE n integer; recebidas integer;
BEGIN
  SELECT COUNT(*) INTO recebidas FROM rebobinadeira.staging_planilha WHERE lote_id = p_lote;

  INSERT INTO rebobinadeira.produtos_jumbo
    (codigo, descricao, material, cor, largura_jumbo_mm, tipo_produto)
  SELECT DISTINCT
    rebobinadeira.codigo_produto(TRIM(s.material), COALESCE(NULLIF(TRIM(s.cor), ''), 'SEM COR'),
      rebobinadeira.para_numeric_br(s.largura_bobina_texto), COALESCE(NULLIF(TRIM(s.linha), ''), 'PADRÃO')),
    CONCAT_WS(' · ', NULLIF(TRIM(s.cor), ''), NULLIF(TRIM(s.material), ''),
      CASE WHEN UPPER(COALESCE(s.material, '')) LIKE '%CREPE%'
        OR UPPER(COALESCE(s.material, '')) LIKE '%DUPLA FACE%'
        OR UPPER(COALESCE(s.material, '')) LIKE '%KRAFT%'
        THEN NULL ELSE NULLIF(ROUND(rebobinadeira.para_numeric_br(s.largura_bobina_texto))::text, '') END,
      COALESCE(NULLIF(TRIM(s.linha), ''), 'PADRÃO')),
    TRIM(s.material), COALESCE(NULLIF(TRIM(s.cor), ''), 'SEM COR'),
    rebobinadeira.para_numeric_br(s.largura_bobina_texto),
    COALESCE(NULLIF(TRIM(s.linha), ''), 'PADRÃO')
  FROM rebobinadeira.staging_planilha s
  WHERE s.lote_id = p_lote AND NULLIF(TRIM(s.material), '') IS NOT NULL
    AND NULLIF(TRIM(s.numero_bobina), '') IS NOT NULL
    AND (rebobinadeira.para_numeric_br(s.largura_bobina_texto) IS NOT NULL
      OR UPPER(COALESCE(s.material, '')) LIKE '%CREPE%'
      OR UPPER(COALESCE(s.material, '')) LIKE '%DUPLA FACE%'
      OR UPPER(COALESCE(s.material, '')) LIKE '%KRAFT%')
  ON CONFLICT (codigo) DO NOTHING;

  INSERT INTO rebobinadeira.bobinas (
    numero_bobina, numero_normalizado, data, maquina, setup, turno, material,
    produto_codigo, largura_jumbo_mm, peso_jumbo_kg, fornec_filme, lote_cola,
    fornec_cola, medida, largura_fita_mm, comp_fita_mm, cor, linha, cliente,
    caixas, pcts, rolos, refugos, fitas_rebobinadas, refilo_kg, perda_producao_kg,
    perda_filme_kg, metragem_bobina_m, metragem_unica_m, area_bobina_m2,
    peso_unico_kg, area_unica_m2, observacoes, lote_importacao
  )
  SELECT
    TRIM(s.numero_bobina), rebobinadeira.normaliza_numero(s.numero_bobina),
    TO_DATE(TRIM(s.data_texto), 'DD/MM/YYYY'), NULLIF(TRIM(s.maquina), ''),
    UPPER(TRIM(COALESCE(s.setup, ''))) IN ('SIM', 'S', 'YES', '1'),
    NULLIF(TRIM(s.turno_texto), ''), TRIM(s.material),
    rebobinadeira.codigo_produto(TRIM(s.material), COALESCE(NULLIF(TRIM(s.cor), ''), 'SEM COR'),
      rebobinadeira.para_numeric_br(s.largura_bobina_texto), COALESCE(NULLIF(TRIM(s.linha), ''), 'PADRÃO')),
    rebobinadeira.para_numeric_br(s.largura_bobina_texto),
    rebobinadeira.para_numeric_br(s.peso_bobina_texto),
    NULLIF(TRIM(s.fornec_filme), ''), NULLIF(TRIM(s.lote_cola), ''),
    NULLIF(TRIM(s.fornec_cola), ''), NULLIF(TRIM(s.medida), ''),
    rebobinadeira.para_numeric_br(s.largura_fita_texto),
    rebobinadeira.para_numeric_br(s.comp_fita_texto),
    COALESCE(NULLIF(TRIM(s.cor), ''), 'SEM COR'),
    COALESCE(NULLIF(TRIM(s.linha), ''), 'PADRÃO'), NULLIF(TRIM(s.cliente), ''),
    rebobinadeira.para_numeric_br(s.caixas_texto)::integer,
    rebobinadeira.para_numeric_br(s.pcts_texto)::integer,
    rebobinadeira.para_numeric_br(s.rolos_texto)::integer,
    rebobinadeira.para_numeric_br(s.refugos_texto),
    rebobinadeira.para_numeric_br(s.fitas_rebobinadas_texto),
    rebobinadeira.para_numeric_br(s.refilo_texto),
    rebobinadeira.para_numeric_br(s.perda_producao_texto),
    rebobinadeira.para_numeric_br(s.perda_filme_texto),
    rebobinadeira.para_numeric_br(s.metragem_bobina_texto),
    rebobinadeira.para_numeric_br(s.metragem_unica_texto),
    rebobinadeira.para_numeric_br(s.area_bobina_texto),
    rebobinadeira.para_numeric_br(s.peso_unico_texto),
    rebobinadeira.para_numeric_br(s.area_unica_texto),
    NULLIF(TRIM(s.observacoes), ''), s.lote_id
  FROM rebobinadeira.staging_planilha s
  WHERE s.lote_id = p_lote
    AND rebobinadeira.normaliza_numero(s.numero_bobina) IS NOT NULL
    AND NULLIF(TRIM(s.material), '') IS NOT NULL
    AND NULLIF(TRIM(s.data_texto), '') IS NOT NULL
    AND (rebobinadeira.para_numeric_br(s.largura_bobina_texto) IS NOT NULL
      OR UPPER(COALESCE(s.material, '')) LIKE '%CREPE%'
      OR UPPER(COALESCE(s.material, '')) LIKE '%DUPLA FACE%'
      OR UPPER(COALESCE(s.material, '')) LIKE '%KRAFT%')
  ON CONFLICT (numero_normalizado) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO rebobinadeira.importacao_log
    (id, origem, linhas_recebidas, linhas_gravadas, status)
  VALUES (p_lote, 'planilha', recebidas, n, 'PROCESSADO')
  ON CONFLICT (id) DO UPDATE SET linhas_recebidas = EXCLUDED.linhas_recebidas,
    linhas_gravadas = EXCLUDED.linhas_gravadas, status = EXCLUDED.status;
  DELETE FROM rebobinadeira.staging_planilha WHERE lote_id = p_lote;
  RETURN n;
END;
$;

CREATE OR REPLACE VIEW rebobinadeira.vw_estoque_minimo
WITH (security_invoker = true) AS
WITH kg_unicos AS (
  SELECT DISTINCT ON (b.produto_codigo, b.numero_normalizado, b.peso_jumbo_kg)
    b.produto_codigo, b.numero_normalizado, b.peso_jumbo_kg
  FROM rebobinadeira.bobinas b
  WHERE b.data >= CURRENT_DATE - 90 AND b.data <= CURRENT_DATE AND b.peso_jumbo_kg > 0
  ORDER BY b.produto_codigo, b.numero_normalizado, b.peso_jumbo_kg, b.data DESC, b.id DESC
),
m_unicos AS (
  SELECT DISTINCT ON (b.produto_codigo, b.numero_normalizado, b.metragem_bobina_m)
    b.produto_codigo, b.numero_normalizado, b.metragem_bobina_m
  FROM rebobinadeira.bobinas b
  WHERE b.data >= CURRENT_DATE - 90 AND b.data <= CURRENT_DATE AND b.metragem_bobina_m > 0
  ORDER BY b.produto_codigo, b.numero_normalizado, b.metragem_bobina_m, b.data DESC, b.id DESC
),
kg AS (
  SELECT produto_codigo, SUM(peso_jumbo_kg) AS peso_consumido_90d,
    AVG(peso_jumbo_kg) AS peso_medio_jumbo_kg,
    COUNT(DISTINCT numero_normalizado) AS jumbos_consumidos
  FROM kg_unicos GROUP BY produto_codigo
),
metros AS (
  SELECT produto_codigo, SUM(metragem_bobina_m) AS metros_consumidos_90d,
    AVG(metragem_bobina_m) AS metragem_media_jumbo_m
  FROM m_unicos GROUP BY produto_codigo
),
base AS (
  SELECT p.codigo, p.descricao, p.material, p.cor, p.largura_jumbo_mm,
    p.tipo_produto, p.lead_time_dias, p.piso_minimo_jumbos,
    COALESCE(k.peso_consumido_90d, 0) AS peso_consumido_90d,
    COALESCE(k.peso_medio_jumbo_kg, 0) AS peso_medio_jumbo_kg,
    COALESCE(k.jumbos_consumidos, 0) AS jumbos_consumidos,
    COALESCE(m.metros_consumidos_90d, 0) AS metros_consumidos_90d,
    COALESCE(m.metragem_media_jumbo_m, 0) AS metragem_media_jumbo_m
  FROM rebobinadeira.produtos_jumbo p
  LEFT JOIN kg k ON k.produto_codigo = p.codigo
  LEFT JOIN metros m ON m.produto_codigo = p.codigo
  WHERE p.ativo
),
calculos AS (
  SELECT *, peso_consumido_90d / 3.0 AS consumo_mensal_kg,
    peso_consumido_90d / 3.0 / 22.0 AS consumo_diario_kg,
    metros_consumidos_90d / 13.0 AS consumo_semanal_m
  FROM base
)
SELECT
  codigo, descricao, material, cor, largura_jumbo_mm, tipo_produto,
  lead_time_dias, piso_minimo_jumbos,
  ROUND(consumo_mensal_kg, 2) AS consumo_mensal_kg,
  ROUND(consumo_diario_kg, 2) AS consumo_diario_kg,
  ROUND(COALESCE(consumo_diario_kg * lead_time_dias, 0), 2) AS estoque_minimo_calculado_kg,
  CASE WHEN peso_medio_jumbo_kg > 0 THEN CEIL(peso_medio_jumbo_kg) ELSE 0 END AS peso_medio_jumbo_kg,
  jumbos_consumidos,
  GREATEST(piso_minimo_jumbos,
    CASE WHEN peso_medio_jumbo_kg > 0 AND lead_time_dias IS NOT NULL
      THEN CEIL((consumo_diario_kg * lead_time_dias) / CEIL(peso_medio_jumbo_kg))::integer
      ELSE piso_minimo_jumbos END
  ) AS estoque_minimo_jumbos,
  ROUND(consumo_semanal_m, 2) AS consumo_semanal_m,
  ROUND(consumo_semanal_m * 1.5, 2) AS estoque_minimo_recomendado_m,
  ROUND(metragem_media_jumbo_m, 2) AS metragem_media_jumbo_m,
  ROUND(CASE WHEN jumbos_consumidos = 0
    THEN metragem_media_jumbo_m * piso_minimo_jumbos
    ELSE consumo_semanal_m * 1.5 END, 2) AS estoque_minimo_m,
  (jumbos_consumidos > 0) AS possui_consumo,
  ROUND(COALESCE(consumo_diario_kg * lead_time_dias, 0), 2) AS estoque_minimo_kg
FROM calculos;

ALTER TABLE rebobinadeira.produtos_jumbo ENABLE ROW LEVEL SECURITY;
ALTER TABLE rebobinadeira.bobinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE rebobinadeira.staging_planilha ENABLE ROW LEVEL SECURITY;
ALTER TABLE rebobinadeira.importacao_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitura produtos rebobinadeira" ON rebobinadeira.produtos_jumbo;
CREATE POLICY "leitura produtos rebobinadeira" ON rebobinadeira.produtos_jumbo
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.current_user_access() a
    WHERE a.role IN ('DEVELOPER', 'ADMIN') OR a.area = 'rebobinadeira'
  ));
DROP POLICY IF EXISTS "edicao lead time desenvolvedor" ON rebobinadeira.produtos_jumbo;
CREATE POLICY "edicao lead time desenvolvedor" ON rebobinadeira.produtos_jumbo
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.current_user_access() a WHERE a.role = 'DEVELOPER'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.current_user_access() a WHERE a.role = 'DEVELOPER'));
DROP POLICY IF EXISTS "leitura bobinas rebobinadeira" ON rebobinadeira.bobinas;
CREATE POLICY "leitura bobinas rebobinadeira" ON rebobinadeira.bobinas
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.current_user_access() a
    WHERE a.role IN ('DEVELOPER', 'ADMIN') OR a.area = 'rebobinadeira'
  ));
DROP POLICY IF EXISTS "leitura log rebobinadeira" ON rebobinadeira.importacao_log;
CREATE POLICY "leitura log rebobinadeira" ON rebobinadeira.importacao_log
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.current_user_access() a
    WHERE a.role IN ('DEVELOPER', 'ADMIN') OR a.area = 'rebobinadeira'
  ));

GRANT USAGE ON SCHEMA rebobinadeira TO authenticated, service_role;
GRANT SELECT, UPDATE ON rebobinadeira.produtos_jumbo TO authenticated;
GRANT SELECT ON rebobinadeira.bobinas, rebobinadeira.vw_estoque_minimo,
  rebobinadeira.importacao_log TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA rebobinadeira TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA rebobinadeira TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA rebobinadeira TO service_role;

ALTER ROLE authenticator
  SET pgrst.db_schemas = 'public, storage, graphql_public, cobrideira, rebobinadeira';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- Catálogo inicial baseado nas linhas da planilha de estoque mínimo.
WITH produtos(material, cor, largura, tipo, descricao) AS (
  VALUES
  ('20 MICRAS','AMARELO',980,'PADRÃO','AMARELO 980.20'),
  ('20 MICRAS','AZUL',980,'PADRÃO','AZUL 980.20'),
  ('20 MICRAS','AZUL CLARO',980,'PADRÃO','AZUL CLARO 980.20'),
  ('20 MICRAS','BRANCO',980,'PADRÃO','BRANCO 980.20'),
  ('25 MICRAS','BRANCO',980,'PADRÃO','BRANCO 980.25'),
  ('20 MICRAS','CINZA',980,'PADRÃO','CINZA 980.20'),
  ('CREPE BR','BRANCO',NULL,'PADRÃO','CREPE'),
  ('20 MICRAS','CRISTAL',1200,'PADRÃO','CRISTAL 1200.20'),
  ('20 MICRAS','CRISTAL',1265,'PADRÃO','CRISTAL 1265.20'),
  ('20 MICRAS','CRISTAL',1270,'PADRÃO','CRISTAL 1270.20'),
  ('25 MICRAS','CRISTAL',1270,'PADRÃO','CRISTAL 1270.25'),
  ('20 MICRAS','CRISTAL',980,'PADRÃO','CRISTAL 980.20'),
  ('25 MICRAS','CRISTAL',980,'PADRÃO','CRISTAL 980.25'),
  ('28 MICRAS','CRISTAL',980,'PADRÃO','CRISTAL 980.28'),
  ('DUPLA FACE','BRANCO',NULL,'PADRÃO','DUPLA FACE'),
  ('CREPE KT','MARROM',1175,'PADRÃO','KRAFT 1175mm'),
  ('KRAFT LISA','MARROM',1175,'PADRÃO','KRAFT LISA 1175mm'),
  ('20 MICRAS','LARANJA',980,'PADRÃO','LARANJA 980.20'),
  ('20 MICRAS','LILÁS',980,'PADRÃO','LILÁS 980.20'),
  ('20 MICRAS','MARROM',1270,'PADRÃO','MARROM 1270.20'),
  ('25 MICRAS','MARROM',1270,'PADRÃO','MARROM 1270.25'),
  ('20 MICRAS','MARROM',1265,'PADRÃO','MARROM 1265.20'),
  ('20 MICRAS','MARROM',1200,'PADRÃO','MARROM 1200.20'),
  ('20 MICRAS','METALIZADA',980,'PADRÃO','METALIZADA 980.20'),
  ('20 MICRAS','PRETO',980,'PADRÃO','PRETO 980.20'),
  ('20 MICRAS','ROSA',980,'PADRÃO','ROSA 980.20'),
  ('20 MICRAS','ROXO',980,'PADRÃO','ROXO 980.20'),
  ('20 MICRAS','TRANSPARENTE',1200,'PADRÃO','TRANSPARENTE 1200.20'),
  ('20 MICRAS','VERDE',980,'PADRÃO','VERDE 980.20'),
  ('20 MICRAS','VERDE CLARO',980,'PADRÃO','VERDE CLARO 980.20'),
  ('20 MICRAS','VERMELHO',980,'PADRÃO','VERMELHO 980.20'),
  ('20 MICRAS','CUIDADO FRÁGIL/IMPRE. PRETA – BRANCO',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. PRETA – BRANCO 20'),
  ('25 MICRAS','CUIDADO FRÁGIL/IMPRE. PRETA – BRANCO',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. PRETA – BRANCO 25'),
  ('20 MICRAS','CUIDADO FRÁGIL/IMPRE. PRETA – CRISTAL',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. PRETA – CRISTAL 20'),
  ('25 MICRAS','CUIDADO FRÁGIL/IMPRE. PRETA – CRISTAL',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. PRETA – CRISTAL 25'),
  ('20 MICRAS','CUIDADO FRÁGIL/IMPRE. PRETA – MARROM',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. PRETA – MARROM 20'),
  ('25 MICRAS','CUIDADO FRÁGIL/IMPRE. PRETA – MARROM',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. PRETA – MARROM 25'),
  ('20 MICRAS','CUIDADO FRÁGIL/IMPRE. VER – BRANCO',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. VER – BRANCO 20'),
  ('25 MICRAS','CUIDADO FRÁGIL/IMPRE. VER – BRANCO',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. VER – BRANCO 25'),
  ('20 MICRAS','CUIDADO FRÁGIL/IMPRE. VER – CRISTAL',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. VER – CRISTAL 20'),
  ('25 MICRAS','CUIDADO FRÁGIL/IMPRE. VER – CRISTAL',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. VER – CRISTAL 25'),
  ('20 MICRAS','CUIDADO FRÁGIL/IMPRE. VER – MARROM',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. VER – MARROM 20'),
  ('25 MICRAS','CUIDADO FRÁGIL/IMPRE. VER – MARROM',980,'Impressa (de linha)','CUIDADO FRÁGIL/IMPRE. VER – MARROM 25'),
  ('20 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – BRANCO',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – BRANCO 20'),
  ('25 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – BRANCO',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – BRANCO 25'),
  ('20 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – CRISTAL',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – CRISTAL 20'),
  ('25 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – CRISTAL',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – CRISTAL 25'),
  ('20 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – MARROM',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – MARROM 20'),
  ('25 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – MARROM',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. PRETA – MARROM 25'),
  ('20 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. VER – BRANCO',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. VER – BRANCO 20'),
  ('25 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. VER – BRANCO',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. VER – BRANCO 25'),
  ('20 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. VER – CRISTAL',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. VER – CRISTAL 20'),
  ('25 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. VER – CRISTAL',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. VER – CRISTAL 25'),
  ('20 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. VER – MARROM',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. VER – MARROM 20'),
  ('25 MICRAS','VIOLAÇÃO (CADEADO)/IMPRE. VER – MARROM',980,'Impressa (de linha)','VIOLAÇÃO (CADEADO)/IMPRE. VER – MARROM 25')
)
INSERT INTO rebobinadeira.produtos_jumbo
  (codigo, descricao, material, cor, largura_jumbo_mm, tipo_produto)
SELECT rebobinadeira.codigo_produto(material, cor, largura, tipo),
  descricao, material, cor, largura, tipo
FROM produtos
ON CONFLICT (codigo) DO NOTHING;

-- Harden function search paths and index the foreign key / rolling-window filter.
ALTER FUNCTION rebobinadeira.para_numeric_br(text) SET search_path TO '';
ALTER FUNCTION rebobinadeira.normaliza_numero(text) SET search_path TO '';
ALTER FUNCTION rebobinadeira.codigo_produto(text, text, numeric, text) SET search_path TO '';
ALTER FUNCTION rebobinadeira.lead_time_padrao(text, text, numeric, text) SET search_path TO '';
ALTER FUNCTION rebobinadeira.preparar_produto_jumbo() SET search_path TO '';
ALTER FUNCTION rebobinadeira.processar_lote(uuid) SET search_path TO '';

CREATE INDEX IF NOT EXISTS bobinas_produto_codigo_idx
  ON rebobinadeira.bobinas (produto_codigo);
CREATE INDEX IF NOT EXISTS bobinas_data_produto_codigo_idx
  ON rebobinadeira.bobinas (data, produto_codigo);
