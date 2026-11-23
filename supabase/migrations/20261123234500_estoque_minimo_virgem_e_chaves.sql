
-- Chaves do estoque virgem por medida e código, mais parâmetros e cálculo do mínimo.
-- Depende de 20261123233000_campos_csv_filme_virgem.sql.

begin;

update estoque_atual.bobinas_estoque_virgem
set medida_texto = coalesce(nullif(medida_texto,''), case when medida is not null then to_char(medida,'FM999999990.00') else '' end);
alter table estoque_atual.bobinas_estoque_virgem
  alter column medida_texto set default '',
  alter column medida_texto set not null;
drop index if exists estoque_atual.bobinas_estoque_virgem_categoria_codigo_idx;
create unique index if not exists bobinas_estoque_virgem_categoria_medida_codigo_uidx
  on estoque_atual.bobinas_estoque_virgem(categoria,medida_texto,codigo);

alter table estoque_atual.bobinas_estoque_virgem_lixeira
  add column if not exists medida_texto text not null default '';
update estoque_atual.bobinas_estoque_virgem_lixeira
set medida_texto=coalesce(nullif(dados->>'medida_texto',''), '');
drop index if exists estoque_atual.bobinas_estoque_virgem_lixeira_categoria_codigo_idx;
create unique index if not exists bobinas_estoque_virgem_lixeira_categoria_medida_codigo_uidx
  on estoque_atual.bobinas_estoque_virgem_lixeira(categoria,medida_texto,codigo);

create table if not exists estoque_atual.parametros_estoque_minimo_virgem (
  referencia text primary key,
  lead_time_dias integer not null default 90 check (lead_time_dias between 0 and 3650),
  minimo_calibrado_kg numeric check (minimo_calibrado_kg >= 0),
  kg_bopp_por_jumbo numeric check (kg_bopp_por_jumbo > 0),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
alter table estoque_atual.parametros_estoque_minimo_virgem enable row level security;
revoke all on estoque_atual.parametros_estoque_minimo_virgem from anon,authenticated;
grant select,insert,update,delete on estoque_atual.parametros_estoque_minimo_virgem to service_role;

insert into estoque_atual.parametros_estoque_minimo_virgem
  (referencia,lead_time_dias,minimo_calibrado_kg,kg_bopp_por_jumbo)
values
 ('980.20',90,5000,null),
 ('980.25',90,4000,null),
 ('980.28',90,1000,null),
 ('1200.20',90,8000,null),
 ('1265.20',90,25000,137.9),
 ('1270.20',90,23000,null),
 ('1270.25',90,3000,null),
 ('1600.20',90,10000,171.8),
 ('980.20 METALIZADA',90,1000,null),
 ('1600.20 METALIZADA',90,1000,null),
 ('PEBD',90,1000,null)
on conflict (referencia) do nothing;

create or replace view estoque_atual.vw_estoque_minimo_virgem
with (security_invoker=true) as
with inventario as (
  select
    case when categoria='PEBD' then 'PEBD'
      else coalesce(nullif(medida_texto,''), to_char(medida,'FM999999990.00'))
    end as referencia,
    count(*)::integer as bobinas_estoque,
    coalesce(sum(peso_kg),0)::numeric as peso_estoque_kg,
    avg(peso_kg)::numeric as peso_medio_bobina_kg
  from estoque_atual.bobinas_estoque_virgem
  group by 1
),
producao as (
  select
    to_char(largura,'FM999999990') || '.' || lpad(micragem::text,2,'0') as referencia,
    coalesce(sum(peso_filme_bopp_kg),0)::numeric as consumo_periodo_kg,
    min(data) as primeira_producao,
    max(data) as ultima_producao,
    count(*)::integer as registros_producao
  from cobrideira.bobinas
  where upper(trim(material))='BOPP'
    and largura is not null
    and micragem is not null
    and peso_filme_bopp_kg > 0
  group by 1
),
referencias as (
  select referencia from estoque_atual.parametros_estoque_minimo_virgem where ativo
  union
  select referencia from inventario where referencia is not null
),
base as (
  select
    r.referencia,
    coalesce(p.lead_time_dias,90) as lead_time_dias,
    p.minimo_calibrado_kg,
    p.kg_bopp_por_jumbo,
    coalesce(i.bobinas_estoque,0) as bobinas_estoque,
    coalesce(i.peso_estoque_kg,0) as peso_estoque_kg,
    i.peso_medio_bobina_kg,
    coalesce(pr.consumo_periodo_kg,0) as consumo_periodo_kg,
    pr.primeira_producao,
    pr.ultima_producao,
    coalesce(pr.registros_producao,0) as registros_producao,
    case when pr.primeira_producao is not null and pr.ultima_producao is not null
      then greatest(1, (extract(year from pr.ultima_producao)::integer - extract(year from pr.primeira_producao)::integer)*12
          + extract(month from pr.ultima_producao)::integer - extract(month from pr.primeira_producao)::integer + 1)
      else 0 end as meses_periodo
  from referencias r
  left join estoque_atual.parametros_estoque_minimo_virgem p on p.referencia=r.referencia
  left join inventario i on i.referencia=r.referencia
  left join producao pr on pr.referencia=r.referencia
)
select
  referencia,
  bobinas_estoque,
  round(peso_estoque_kg,2) as peso_estoque_kg,
  round(peso_medio_bobina_kg,2) as peso_medio_bobina_kg,
  consumo_periodo_kg,
  meses_periodo,
  round(case when meses_periodo>0 then consumo_periodo_kg/meses_periodo else 0 end,2) as consumo_mensal_kg,
  round(case when meses_periodo>0 then consumo_periodo_kg/meses_periodo/30.0 else 0 end,2) as consumo_diario_kg,
  lead_time_dias,
  round(case when meses_periodo>0 then consumo_periodo_kg/meses_periodo/30.0*lead_time_dias else 0 end,2) as minimo_calculado_kg,
  minimo_calibrado_kg,
  case when minimo_calibrado_kg is not null and peso_medio_bobina_kg>0
    then ceil(minimo_calibrado_kg/peso_medio_bobina_kg)::integer else null end as minimo_calibrado_bobinas,
  kg_bopp_por_jumbo,
  case when kg_bopp_por_jumbo>0 then floor(peso_estoque_kg/kg_bopp_por_jumbo)::integer else null end as capacidade_jumbos,
  round(peso_estoque_kg-coalesce(minimo_calibrado_kg,0),2) as folga_calibrada_kg,
  case when minimo_calibrado_kg is null then 'NÃO CALIBRADO'
    when peso_estoque_kg=0 and minimo_calibrado_kg>0 then 'ZERADO'
    when peso_estoque_kg<minimo_calibrado_kg then 'ABAIXO'
    else 'OK' end as status_estoque,
  primeira_producao,
  ultima_producao,
  registros_producao
from base;

grant select on estoque_atual.vw_estoque_minimo_virgem to service_role;
notify pgrst,'reload schema';
commit;
