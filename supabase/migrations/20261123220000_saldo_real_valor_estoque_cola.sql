-- Corrige valor de dois lotes sem custo e calcula o saldo pelo número real
-- de containers que continuam disponíveis. Lotes sem container disponível
-- deixam de aparecer no Estoque de Cola.

update cobrideira.estoque_cola_entradas
set valor_por_container=8830,
    observacoes=concat_ws(' ',nullif(observacoes,''),'Custo/kg ajustado para R$ 8,83 conforme orientação do usuário; peso do container 1.000 kg.')
where id=8 and valor_por_container=0;

update cobrideira.estoque_cola_entradas
set valor_por_container=8940,
    observacoes=concat_ws(' ',nullif(observacoes,''),'Custo/kg ajustado para R$ 8,94 conforme orientação do usuário; peso do container 1.000 kg.')
where id=14 and valor_por_container=0;

create or replace view cobrideira.vw_estoque_cola_saldo
with (security_invoker=true) as
select
  e.id,
  e.data_chegada,
  e.nf,
  e.produto,
  e.lote,
  e.quantidade_containers,
  e.peso_por_container_kg,
  e.valor_por_container,
  e.valor_por_kg,
  e.fornecedor,
  c.containers_disponiveis,
  e.localizacao,
  (c.containers_disponiveis * e.valor_por_container)::numeric as valor_estoque
from cobrideira.estoque_cola_entradas e
join lateral (
  select count(*) filter (where cc.status='DISPONIVEL')::integer as containers_disponiveis
  from cobrideira.estoque_cola_containers cc
  where cc.entrada_id=e.id
) c on c.containers_disponiveis > 0;

notify pgrst, 'reload schema';
