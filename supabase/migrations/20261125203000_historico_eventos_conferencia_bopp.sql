-- Histórico auditável de cada mudança relevante na conferência automática do BOPP.
create table if not exists estoque_atual.bopp_baixa_conferencias_historico (
  id bigint generated always as identity primary key,
  codigo text not null,
  status text not null,
  quantidade_bobinas integer,
  peso_estoque_kg numeric,
  peso_produzido_kg numeric,
  diferenca_percentual numeric,
  mensagem text,
  registrado_em timestamptz not null default now(),
  baixada_em timestamptz
);

alter table estoque_atual.bopp_baixa_conferencias_historico enable row level security;
grant select on estoque_atual.bopp_baixa_conferencias_historico to authenticated;
drop policy if exists "authenticated read bopp baixa conference history" on estoque_atual.bopp_baixa_conferencias_historico;
create policy "authenticated read bopp baixa conference history"
  on estoque_atual.bopp_baixa_conferencias_historico
  for select to authenticated
  using ((select auth.uid()) is not null);

create or replace function estoque_atual.registrar_historico_conferencia_bopp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or old.status is distinct from new.status
     or old.quantidade_bobinas is distinct from new.quantidade_bobinas
     or old.peso_estoque_kg is distinct from new.peso_estoque_kg
     or old.peso_produzido_kg is distinct from new.peso_produzido_kg
     or old.diferenca_percentual is distinct from new.diferenca_percentual
     or old.mensagem is distinct from new.mensagem then
    insert into estoque_atual.bopp_baixa_conferencias_historico
      (codigo,status,quantidade_bobinas,peso_estoque_kg,peso_produzido_kg,diferenca_percentual,mensagem,baixada_em)
    values
      (new.codigo,new.status,new.quantidade_bobinas,new.peso_estoque_kg,new.peso_produzido_kg,new.diferenca_percentual,new.mensagem,new.baixada_em);
  end if;
  return new;
end;
$$;

revoke all on function estoque_atual.registrar_historico_conferencia_bopp() from public, anon, authenticated, service_role;
drop trigger if exists trg_historico_conferencia_bopp on estoque_atual.bopp_baixa_conferencias;
create trigger trg_historico_conferencia_bopp
after insert or update on estoque_atual.bopp_baixa_conferencias
for each row execute function estoque_atual.registrar_historico_conferencia_bopp();
