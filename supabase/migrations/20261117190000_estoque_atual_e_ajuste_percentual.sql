-- Prepara o schema do estoque físico; as tabelas serão criadas após validar o CSV e seus campos.
create schema if not exists estoque_atual;

-- Ajuste manual individual do estoque mínimo por produto.
alter table rebobinadeira.produtos_jumbo
  add column if not exists ajuste_estoque_percentual numeric(6,2) not null default 0
  check (ajuste_estoque_percentual >= 0 and ajuste_estoque_percentual <= 300);

-- A metragem de consumo deve refletir a metragem única efetivamente produzida,
-- sem substituir esse valor pela metragem nominal da bobina.
do $$
declare
  v_sql text;
begin
  v_sql := pg_get_viewdef('rebobinadeira.vw_estoque_minimo'::regclass, true);
  v_sql := replace(v_sql, 'metragem_bobina_m', 'metragem_unica_m');
  execute 'create or replace view rebobinadeira.vw_estoque_minimo as ' || v_sql;
end
$$;
