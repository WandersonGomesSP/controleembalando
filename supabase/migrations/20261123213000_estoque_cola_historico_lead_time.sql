-- Estoque de cola: localização por lote, histórico de consumo válido e lead time móvel.
alter table cobrideira.estoque_cola_entradas
  add column if not exists localizacao text not null default 'ESTOQUE';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='estoque_cola_entradas_localizacao_check'
      and conrelid='cobrideira.estoque_cola_entradas'::regclass
  ) then
    alter table cobrideira.estoque_cola_entradas
      add constraint estoque_cola_entradas_localizacao_check
      check(localizacao in ('ESTOQUE','GALPAO_MARIO_COVAS'));
  end if;
end $$;

update cobrideira.estoque_cola_entradas e
set localizacao='GALPAO_MARIO_COVAS'
where exists (
  select 1 from cobrideira.estoque_cola_containers c
  where c.entrada_id=e.id and c.localizacao='GALPAO_MARIO_COVAS'
);

create or replace view cobrideira.vw_estoque_cola_saldo
with (security_invoker=true) as
select
  e.id,e.data_chegada,e.nf,e.produto,e.lote,e.quantidade_containers,
  e.peso_por_container_kg,e.valor_por_container,e.valor_por_kg,e.fornecedor,
  (e.quantidade_containers-coalesce((
    select sum(case
      when m.tipo in ('CONSUMO_PRODUCAO','RETIRADA_BAHIA') then m.quantidade_containers
      when m.tipo='ESTORNO_CONSUMO' then -m.quantidade_containers
      else 0 end)
    from cobrideira.movimentacoes_cola m where m.entrada_id=e.id
  ),0))::integer as containers_disponiveis,
  e.localizacao
from cobrideira.estoque_cola_entradas e;

create or replace view cobrideira.vw_historico_cola
with (security_invoker=true) as
select h.numero_bobina,h.codigo_container,h.data_producao,h.cola_liquida_kg,
       h.lote_cola,h.fornecedor_cola,c.status as status_container
from cobrideira.historico_cola_producao h
left join cobrideira.estoque_cola_containers c on c.codigo=h.codigo_container
where h.codigo_container ~ '^[0-9]{8}$';

create table if not exists cobrideira.parametros_consumo_cola (
  id smallint primary key default 1 check(id=1),
  lead_time_dias integer not null default 25 check(lead_time_dias between 0 and 365),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
insert into cobrideira.parametros_consumo_cola(id,lead_time_dias)
values(1,25) on conflict(id) do nothing;

create or replace view cobrideira.vw_consumo_movel_cola
with (security_invoker=true) as
with producao as (
  select
    count(*)::numeric as bobinas_90_dias,
    coalesce(sum(coalesce(b.kg_cola,0)),0)::numeric as consumo_90_dias_kg
  from cobrideira.bobinas b
  where b.data>=current_date-89 and b.data<=current_date
),
estoque as (
  select coalesce(sum(greatest(s.containers_disponiveis,0)*s.peso_por_container_kg),0)::numeric as cola_disponivel_kg
  from cobrideira.vw_estoque_cola_saldo s
),
parametros as (
  select p.lead_time_dias from cobrideira.parametros_consumo_cola p where p.id=1
)
select
  p.bobinas_90_dias,
  p.consumo_90_dias_kg,
  p.consumo_90_dias_kg/3 as consumo_movel_mensal_kg,
  p.consumo_90_dias_kg/90 as consumo_diario_kg,
  p.consumo_90_dias_kg/90*prm.lead_time_dias as estoque_minimo_25_dias_kg,
  e.cola_disponivel_kg,
  case when p.bobinas_90_dias>0 and p.consumo_90_dias_kg>0
       then e.cola_disponivel_kg/(p.consumo_90_dias_kg/p.bobinas_90_dias)
       else 0 end as capacidade_producao_bobinas,
  prm.lead_time_dias,
  case when p.bobinas_90_dias>0 then p.consumo_90_dias_kg/p.bobinas_90_dias else 0 end as consumo_medio_bobina_kg
from producao p cross join estoque e cross join parametros prm;

alter table cobrideira.parametros_consumo_cola enable row level security;
revoke all on cobrideira.parametros_consumo_cola from anon,authenticated;
grant select,insert,update,delete on cobrideira.parametros_consumo_cola to service_role;
grant select on cobrideira.vw_estoque_cola_saldo,cobrideira.vw_historico_cola,cobrideira.vw_consumo_movel_cola to service_role;

notify pgrst, 'reload schema';
