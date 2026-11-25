
create or replace function estoque_atual.remover_bopp_consumido_do_estoque_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from estoque_atual.bobinas_estoque_virgem
  where categoria='BOPP'
    and upper(trim(codigo))=upper(trim(new.codigo));
  return new;
end;
$$;

drop trigger if exists trg_remover_bopp_consumido_do_estoque on estoque_atual.bobinas_utilizadas;
create trigger trg_remover_bopp_consumido_do_estoque
after insert on estoque_atual.bobinas_utilizadas
for each row execute function estoque_atual.remover_bopp_consumido_do_estoque_trigger();
