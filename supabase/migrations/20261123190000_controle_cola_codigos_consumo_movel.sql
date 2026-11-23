-- Corrige códigos numéricos importados, cria localização dos containers,
-- geração automática NNDDMMYY e indicadores móveis de cola.
begin;

create table if not exists cobrideira.backup_codigos_cola_corrigidos (
  codigo_antigo text primary key,
  codigo_corrigido text not null,
  container_original jsonb,
  bobinas_originais jsonb not null default '[]'::jsonb,
  registrado_em timestamptz not null default now()
);

insert into cobrideira.backup_codigos_cola_corrigidos
  (codigo_antigo,codigo_corrigido,container_original,bobinas_originais)
select c.codigo,
       case when length(regexp_replace(c.codigo,'[.]0$',''))=7
            then '0'||regexp_replace(c.codigo,'[.]0$','')
            else regexp_replace(c.codigo,'[.]0$','') end,
       to_jsonb(c),
       coalesce((select jsonb_agg(to_jsonb(b)) from cobrideira.bobinas b where b.codigo_interno=c.codigo),'[]'::jsonb)
from cobrideira.estoque_cola_containers c
where c.codigo like '%.0'
on conflict(codigo_antigo) do nothing;

alter table cobrideira.bobinas disable trigger trg_sincronizar_uso_cola;

update cobrideira.bobinas
set codigo_interno = case
  when length(regexp_replace(codigo_interno,'[.]0$',''))=7
    then '0'||regexp_replace(codigo_interno,'[.]0$','')
  else regexp_replace(codigo_interno,'[.]0$','')
end
where codigo_interno like '%.0';

update cobrideira.historico_cola_producao
set codigo_container = case
  when length(regexp_replace(codigo_container,'[.]0$',''))=7
    then '0'||regexp_replace(codigo_container,'[.]0$','')
  else regexp_replace(codigo_container,'[.]0$','')
end
where codigo_container like '%.0';

update cobrideira.movimentacoes_cola
set codigo_container = case
  when length(regexp_replace(codigo_container,'[.]0$',''))=7
    then '0'||regexp_replace(codigo_container,'[.]0$','')
  else regexp_replace(codigo_container,'[.]0$','')
end
where codigo_container like '%.0';

with mapa as (
  select codigo codigo_antigo,
         case when length(regexp_replace(codigo,'[.]0$',''))=7
              then '0'||regexp_replace(codigo,'[.]0$','')
              else regexp_replace(codigo,'[.]0$','') end codigo_novo
  from cobrideira.estoque_cola_containers where codigo like '%.0'
)
delete from cobrideira.estoque_cola_containers c
using mapa m
where c.codigo=m.codigo_antigo
  and exists(select 1 from cobrideira.estoque_cola_containers x where x.codigo=m.codigo_novo);

with mapa as (
  select codigo codigo_antigo,
         case when length(regexp_replace(codigo,'[.]0$',''))=7
              then '0'||regexp_replace(codigo,'[.]0$','')
              else regexp_replace(codigo,'[.]0$','') end codigo_novo
  from cobrideira.estoque_cola_containers where codigo like '%.0'
)
update cobrideira.estoque_cola_containers c
set codigo=m.codigo_novo
from mapa m
where c.codigo=m.codigo_antigo;

alter table cobrideira.bobinas enable trigger trg_sincronizar_uso_cola;

alter table cobrideira.estoque_cola_containers
  add column if not exists localizacao text not null default 'ESTOQUE';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='estoque_cola_containers_localizacao_check'
      and conrelid='cobrideira.estoque_cola_containers'::regclass
  ) then
    alter table cobrideira.estoque_cola_containers
      add constraint estoque_cola_containers_localizacao_check
      check (localizacao in ('ESTOQUE','GALPAO_MARIO_COVAS'));
  end if;
end $$;

create or replace function cobrideira.registrar_entrada_cola(
  p_data_chegada date,
  p_nf text,
  p_produto text,
  p_lote text,
  p_quantidade_containers integer,
  p_peso_por_container_kg numeric,
  p_valor_por_container numeric,
  p_fornecedor text,
  p_observacoes text default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_entrada_id bigint;
  v_inicio integer;
  v_codigo text;
  v_codigos text[] := array[]::text[];
  v_data text;
  i integer;
begin
  if p_quantidade_containers < 1 or p_quantidade_containers > 10000 then
    raise exception 'Quantidade de containers inválida.';
  end if;

  v_data := to_char(p_data_chegada,'DDMMYY');
  perform pg_advisory_xact_lock(hashtext('cola-container-'||v_data));

  insert into cobrideira.estoque_cola_entradas(
    data_chegada,nf,produto,lote,quantidade_containers,peso_por_container_kg,
    valor_por_container,fornecedor,observacoes,criado_por
  ) values (
    p_data_chegada,p_nf,p_produto,p_lote,p_quantidade_containers,p_peso_por_container_kg,
    p_valor_por_container,p_fornecedor,p_observacoes,p_user_id
  ) returning id into v_entrada_id;

  select coalesce(max(left(codigo,length(codigo)-6)::integer),0)
    into v_inicio
  from cobrideira.estoque_cola_containers
  where codigo ~ '^[0-9]{7,}$'
    and right(codigo,6)=v_data;

  for i in 1..p_quantidade_containers loop
    v_codigo := lpad((v_inicio+i)::text,2,'0')||v_data;
    insert into cobrideira.estoque_cola_containers(codigo,status,entrada_id,localizacao)
    values(v_codigo,'DISPONIVEL',v_entrada_id,'ESTOQUE');
    v_codigos := array_append(v_codigos,v_codigo);
  end loop;

  return jsonb_build_object('entrada_id',v_entrada_id,'codigos',to_jsonb(v_codigos));
end;
$$;

revoke all on function cobrideira.registrar_entrada_cola(date,text,text,text,integer,numeric,numeric,text,text,uuid) from public,anon,authenticated;
grant execute on function cobrideira.registrar_entrada_cola(date,text,text,text,integer,numeric,numeric,text,text,uuid) to service_role;

-- Gera códigos para entradas antigas que ainda não tinham registros individuais.
do $
declare e record; v_inicio integer; v_codigo text; v_data text; v_faltam integer; i integer;
begin
 for e in
  select en.*,
   en.quantidade_containers-(select count(*) from cobrideira.estoque_cola_containers c where c.entrada_id=en.id) faltam
  from cobrideira.estoque_cola_entradas en
 loop
  v_faltam:=greatest(e.faltam,0);
  if v_faltam=0 then continue; end if;
  v_data:=to_char(e.data_chegada,'DDMMYY');
  perform pg_advisory_xact_lock(hashtext('cola-container-'||v_data));
  select coalesce(max(left(codigo,length(codigo)-6)::integer),0) into v_inicio
  from cobrideira.estoque_cola_containers where codigo ~ '^[0-9]{7,} cobrideira.vw_consumo_movel_cola
with (security_invoker=true)
as
with producao as (
  select count(*)::numeric as bobinas_90_dias
  from cobrideira.bobinas
  where data >= current_date-89 and data <= current_date
), estoque as (
  select coalesce(sum(greatest(containers_disponiveis,0)*peso_por_container_kg),0)::numeric as cola_disponivel_kg
  from cobrideira.vw_estoque_cola_saldo
)
select
  p.bobinas_90_dias,
  p.bobinas_90_dias*300 as consumo_90_dias_kg,
  p.bobinas_90_dias*300/3 as consumo_movel_mensal_kg,
  p.bobinas_90_dias*300/90 as consumo_diario_kg,
  p.bobinas_90_dias*300/90*25 as estoque_minimo_25_dias_kg,
  e.cola_disponivel_kg,
  e.cola_disponivel_kg/300 as capacidade_producao_bobinas
from producao p cross join estoque e;

grant select on cobrideira.vw_consumo_movel_cola to service_role;
commit;
 and right(codigo,6)=v_data;
  for i in 1..v_faltam loop
   v_codigo:=lpad((v_inicio+i)::text,2,'0')||v_data;
   insert into cobrideira.estoque_cola_containers(codigo,status,entrada_id,localizacao)
   values(v_codigo,'DISPONIVEL',e.id,'ESTOQUE')
   on conflict(codigo) do nothing;
  end loop;
 end loop;
end $;

create or replace view cobrideira.vw_consumo_movel_cola
with (security_invoker=true)
as
with producao as (
  select count(*)::numeric as bobinas_90_dias
  from cobrideira.bobinas
  where data >= current_date-89 and data <= current_date
), estoque as (
  select coalesce(sum(greatest(containers_disponiveis,0)*peso_por_container_kg),0)::numeric as cola_disponivel_kg
  from cobrideira.vw_estoque_cola_saldo
)
select
  p.bobinas_90_dias,
  p.bobinas_90_dias*300 as consumo_90_dias_kg,
  p.bobinas_90_dias*300/3 as consumo_movel_mensal_kg,
  p.bobinas_90_dias*300/90 as consumo_diario_kg,
  p.bobinas_90_dias*300/90*25 as estoque_minimo_25_dias_kg,
  e.cola_disponivel_kg,
  e.cola_disponivel_kg/300 as capacidade_producao_bobinas
from producao p cross join estoque e;

grant select on cobrideira.vw_consumo_movel_cola to service_role;
commit;
