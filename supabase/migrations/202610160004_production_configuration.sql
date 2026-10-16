begin;

create table if not exists public.operadores_operacionais (
  nome text primary key check (length(btrim(nome)) between 1 and 120)
);

create table if not exists public.capacidades_producao (
  medida text primary key check (medida in ('12mm', '18mm', '19mm', '25mm', '38mm', '45mm', '48mm', '50mm', '70mm')),
  tubos_por_carrinho integer not null default 0 check (tubos_por_carrinho >= 0),
  tubos_por_container integer not null default 0 check (tubos_por_container >= 0)
);

insert into public.capacidades_producao (medida)
values ('12mm'), ('18mm'), ('19mm'), ('25mm'), ('38mm'), ('45mm'), ('48mm'), ('50mm'), ('70mm')
on conflict (medida) do nothing;

insert into public.operadores_operacionais (nome)
select distinct btrim(nome)
from (
  select operador as nome from public.producao_tubos
  union all select operador from public.lotes_tubete
  union all select operador from public.residuos
) as operadores
where nullif(btrim(nome), '') is not null
  and btrim(nome) not in ('Sistema', 'Operador atual')
on conflict (nome) do nothing;

alter table public.producao_tubos
  add column if not exists quantidade_carrinhos integer not null default 0
    check (quantidade_carrinhos >= 0),
  add column if not exists quantidade_containers integer not null default 0
    check (quantidade_containers >= 0),
  add column if not exists tubos_por_carrinho integer not null default 0
    check (tubos_por_carrinho >= 0),
  add column if not exists tubos_por_container integer not null default 0
    check (tubos_por_container >= 0),
  add column if not exists quantidade_tubos integer not null default 0
    check (quantidade_tubos >= 0);

create or replace function public.calculate_production_tube_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  capacidade public.capacidades_producao%rowtype;
  quantidade_calculada numeric;
begin
  if TG_OP = 'INSERT'
     and NEW.quantidade_carrinhos = 0
     and NEW.quantidade_containers = 0 then
    raise exception 'Informe ao menos um carrinho ou container na produção.';
  end if;

  if TG_OP = 'UPDATE'
     and NEW.tubo is not distinct from OLD.tubo
     and NEW.quantidade_carrinhos is not distinct from OLD.quantidade_carrinhos
     and NEW.quantidade_containers is not distinct from OLD.quantidade_containers
     and NEW.tubos_por_carrinho is not distinct from OLD.tubos_por_carrinho
     and NEW.tubos_por_container is not distinct from OLD.tubos_por_container then
    return NEW;
  end if;

  select * into capacidade
  from public.capacidades_producao
  where medida = NEW.tubo;
  if not found then
    raise exception 'A medida de tubo ainda não tem configuração de produção.';
  end if;
  if NEW.quantidade_carrinhos > 0 and capacidade.tubos_por_carrinho = 0 then
    raise exception 'Configure primeiro a quantidade de tubos por carrinho para esta medida.';
  end if;
  if NEW.quantidade_containers > 0 and capacidade.tubos_por_container = 0 then
    raise exception 'Configure primeiro a quantidade de tubos por container para esta medida.';
  end if;

  NEW.tubos_por_carrinho := capacidade.tubos_por_carrinho;
  NEW.tubos_por_container := capacidade.tubos_por_container;
  quantidade_calculada :=
    NEW.quantidade_carrinhos::numeric * NEW.tubos_por_carrinho +
    NEW.quantidade_containers::numeric * NEW.tubos_por_container;
  if quantidade_calculada > 2147483647 then
    raise exception 'O total calculado excede o limite permitido.';
  end if;
  NEW.quantidade_tubos := quantidade_calculada::integer;
  return NEW;
end;
$$;

drop trigger if exists calculate_production_tube_quantity on public.producao_tubos;
create trigger calculate_production_tube_quantity
before insert or update on public.producao_tubos
for each row execute function public.calculate_production_tube_quantity();

alter table public.producao_tubos
  alter column destino set default 'Produção';

insert into public.catalogos_operacionais (chave, valores)
values
  ('espessuras', '["3,0 mm", "5,0 mm"]'::jsonb),
  ('tubos', '["12mm", "18mm", "19mm", "25mm", "38mm", "45mm", "48mm", "50mm", "70mm"]'::jsonb),
  ('capas', '["Branca", "Marrom"]'::jsonb)
on conflict (chave) do update set valores = excluded.valores;

alter table public.operadores_operacionais enable row level security;
alter table public.capacidades_producao enable row level security;

drop policy if exists "area users read operational operators" on public.operadores_operacionais;
create policy "area users read operational operators"
on public.operadores_operacionais for select to authenticated
using (public.can_access_area('tubeteira'));

drop policy if exists "developer manage operational operators" on public.operadores_operacionais;
create policy "developer manage operational operators"
on public.operadores_operacionais for all to authenticated
using (public.is_current_developer())
with check (public.is_current_developer());

drop policy if exists "area users read production capacities" on public.capacidades_producao;
create policy "area users read production capacities"
on public.capacidades_producao for select to authenticated
using (public.can_access_area('tubeteira'));

drop policy if exists "developer manage production capacities" on public.capacidades_producao;
create policy "developer manage production capacities"
on public.capacidades_producao for all to authenticated
using (public.is_current_developer())
with check (public.is_current_developer());

grant select on public.operadores_operacionais, public.capacidades_producao to authenticated;
grant insert, update, delete on public.operadores_operacionais, public.capacidades_producao to authenticated;

create or replace function public.log_stock_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registro jsonb;
  operacao text;
  id_registro text;
  quantidade_registro numeric(14, 3) := 1;
  codigos_registro text[] := array[]::text[];
  nome_entidade text;
  operador_registro text;
  correcao_log_id bigint;
  correcao_motivo text;
  email_ator text;
  id_ator uuid;
  registro_anterior jsonb;
begin
  if TG_OP = 'DELETE' then
    registro := to_jsonb(OLD);
    operacao := 'SAÍDA';
  elsif TG_OP = 'UPDATE' then
    registro := to_jsonb(NEW);
    operacao := 'ALTERAÇÃO';
  else
    registro := to_jsonb(NEW);
    operacao := 'ENTRADA';
  end if;

  if TG_TABLE_NAME = 'insumos_rolos' then
    nome_entidade := 'Rolo de insumo';
    id_registro := registro ->> 'id_codigo';
    codigos_registro := array[id_registro];
  elsif TG_TABLE_NAME = 'rolos' then
    nome_entidade := 'Rolo';
    id_registro := registro ->> 'id';
    codigos_registro := array[id_registro];
  elsif TG_TABLE_NAME = 'lotes_tubete' then
    nome_entidade := 'Lote de tubetes';
    id_registro := registro ->> 'id';
    quantidade_registro :=
      coalesce((registro ->> 'caixas')::numeric, 0) *
      coalesce((registro ->> 'unidades_por_caixa')::numeric, 0);
  elsif TG_TABLE_NAME = 'producao_tubos' then
    nome_entidade := 'Produção de tubos';
    id_registro := registro ->> 'id';
    select coalesce(array_agg(codigo), array[]::text[])
    into codigos_registro
    from jsonb_each(coalesce(registro -> 'codigos', '{}'::jsonb)) as grupo(chave, valor)
    cross join lateral jsonb_array_elements_text(grupo.valor) as itens(codigo);
    quantidade_registro := coalesce(
      nullif(registro ->> 'quantidade_tubos', '')::numeric,
      greatest(cardinality(codigos_registro), 1)
    );
  elsif TG_TABLE_NAME = 'residuos' then
    nome_entidade := 'Resíduo';
    id_registro := registro ->> 'id';
    quantidade_registro := coalesce((registro ->> 'peso')::numeric, 0);
  else
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  correcao_log_id := nullif(current_setting('app.stock_correction_log_id', true), '')::bigint;
  correcao_motivo := nullif(current_setting('app.stock_correction_reason', true), '');
  email_ator := nullif(current_setting('app.stock_correction_actor_email', true), '');
  id_ator := nullif(current_setting('app.stock_correction_actor_id', true), '')::uuid;
  if correcao_log_id is not null then
    operacao := 'ALTERAÇÃO';
    if TG_OP = 'UPDATE' then
      registro_anterior := to_jsonb(OLD);
    else
      select detalhes into registro_anterior
      from public.stock_operation_logs where id = correcao_log_id;
    end if;
    registro := jsonb_set(
      registro,
      '{correcao}',
      jsonb_build_object(
        'motivo', correcao_motivo,
        'log_original_id', correcao_log_id,
        'antes', registro_anterior
      ),
      true
    );
  end if;

  operador_registro := coalesce(
    nullif(registro ->> 'operador', ''),
    email_ator,
    nullif(auth.jwt() ->> 'email', ''),
    auth.uid()::text,
    'Sistema'
  );

  insert into public.stock_operation_logs (
    acao, entidade, registro_id, quantidade, codigos, operador,
    ator_email, ator_id, detalhes, corrige_log_id
  )
  values (
    operacao, nome_entidade, id_registro, quantidade_registro, codigos_registro,
    operador_registro, coalesce(email_ator, nullif(auth.jwt() ->> 'email', '')),
    coalesce(id_ator, auth.uid()), registro, correcao_log_id
  );

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

create or replace function public.correct_production_record(
  p_log_id bigint,
  p_changes jsonb,
  p_motivo text,
  p_actor_email text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  evento public.stock_operation_logs%rowtype;
  registro_atual jsonb;
  linhas_afetadas integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Correções devem ser autorizadas pelo servidor.';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'Informe os campos que deseja corrigir.';
  end if;
  if nullif(btrim(p_actor_email), '') is null then
    raise exception 'Não foi possível identificar o responsável pela correção.';
  end if;

  select * into evento
  from public.stock_operation_logs
  where id = p_log_id
  for update;
  if not found then raise exception 'Operação original não encontrada.'; end if;
  if evento.entidade <> 'Produção de tubos' then
    raise exception 'Esta função corrige somente a produção de tubos.';
  end if;
  if exists (
    select 1 from public.stock_operation_logs where corrige_log_id = p_log_id
  ) or exists (
    select 1 from public.stock_operation_logs as posterior
    where posterior.entidade = evento.entidade
      and posterior.registro_id = evento.registro_id
      and posterior.id > p_log_id
  ) then
    raise exception 'Só é possível corrigir a operação mais recente deste registro.';
  end if;
  if p_changes - array[
    'destino', 'data', 'espessura', 'tubo', 'capa', 'codigos', 'operador',
    'perda', 'container', 'carrinho', 'quantidade_carrinhos',
    'quantidade_containers', 'tubos_por_carrinho', 'tubos_por_container',
    'quantidade_tubos'
  ]::text[] <> '{}'::jsonb then
    raise exception 'Campo não permitido para correção de produção de tubos.';
  end if;

  perform set_config('app.stock_correction_log_id', p_log_id::text, true);
  perform set_config(
    'app.stock_correction_reason',
    coalesce(nullif(btrim(p_motivo), ''), 'Correção administrativa sem motivo informado'),
    true
  );
  perform set_config('app.stock_correction_actor_email', lower(btrim(p_actor_email)), true);
  perform set_config('app.stock_correction_actor_id', p_actor_id::text, true);

  update public.producao_tubos as producao
  set destino = case when p_changes ? 'destino' then p_changes ->> 'destino' else producao.destino end,
      data = case when p_changes ? 'data' then (p_changes ->> 'data')::date else producao.data end,
      espessura = case when p_changes ? 'espessura' then p_changes ->> 'espessura' else producao.espessura end,
      tubo = case when p_changes ? 'tubo' then p_changes ->> 'tubo' else producao.tubo end,
      capa = case when p_changes ? 'capa' then p_changes ->> 'capa' else producao.capa end,
      codigos = case when p_changes ? 'codigos' then p_changes -> 'codigos' else producao.codigos end,
      operador = case when p_changes ? 'operador' then p_changes ->> 'operador' else producao.operador end,
      perda = case when p_changes ? 'perda' then (p_changes ->> 'perda')::numeric else producao.perda end,
      container = case when p_changes ? 'container' then p_changes ->> 'container' else producao.container end,
      carrinho = case when p_changes ? 'carrinho' then p_changes ->> 'carrinho' else producao.carrinho end,
      quantidade_carrinhos = case when p_changes ? 'quantidade_carrinhos'
        then (p_changes ->> 'quantidade_carrinhos')::integer else producao.quantidade_carrinhos end,
      quantidade_containers = case when p_changes ? 'quantidade_containers'
        then (p_changes ->> 'quantidade_containers')::integer else producao.quantidade_containers end,
      tubos_por_carrinho = case when p_changes ? 'tubos_por_carrinho'
        then (p_changes ->> 'tubos_por_carrinho')::integer else producao.tubos_por_carrinho end,
      tubos_por_container = case when p_changes ? 'tubos_por_container'
        then (p_changes ->> 'tubos_por_container')::integer else producao.tubos_por_container end,
      quantidade_tubos = case when p_changes ? 'quantidade_tubos'
        then (p_changes ->> 'quantidade_tubos')::integer else producao.quantidade_tubos end
  where producao.id::text = evento.registro_id
  returning to_jsonb(producao) into registro_atual;

  get diagnostics linhas_afetadas = row_count;
  if linhas_afetadas = 0 or registro_atual is null then
    raise exception 'O registro atual não existe mais.';
  end if;
  return registro_atual;
end;
$$;

revoke all on function public.correct_production_record(bigint, jsonb, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.correct_production_record(bigint, jsonb, text, text, uuid)
  to service_role;

commit;
