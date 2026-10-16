begin;

alter table public.insumos_rolos
  add column if not exists peso_alterado boolean not null default false;

with eventos_peso as (
  select
    registro_id,
    (detalhes ->> 'peso_liq_kg')::numeric as peso_atual,
    lag((detalhes ->> 'peso_liq_kg')::numeric) over (
      partition by registro_id
      order by id
    ) as peso_anterior
  from public.stock_operation_logs
  where entidade = 'Rolo de insumo'
    and detalhes ? 'peso_liq_kg'
)
update public.insumos_rolos as insumo
set peso_alterado = true
where exists (
  select 1
  from eventos_peso
  where eventos_peso.registro_id = insumo.id_codigo
    and eventos_peso.peso_anterior is not null
    and eventos_peso.peso_atual is distinct from eventos_peso.peso_anterior
);

create or replace function public.mark_insumo_weight_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.peso_alterado := coalesce(old.peso_alterado, false)
    or new.peso_liq_kg is distinct from old.peso_liq_kg;
  return new;
end;
$$;

drop trigger if exists mark_insumo_weight_changed on public.insumos_rolos;
create trigger mark_insumo_weight_changed
before update of peso_liq_kg, peso_alterado on public.insumos_rolos
for each row execute function public.mark_insumo_weight_changed();

commit;
