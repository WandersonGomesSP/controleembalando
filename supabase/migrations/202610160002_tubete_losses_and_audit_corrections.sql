begin;

alter table public.lotes_tubete
  add column if not exists perda_kg numeric(12, 3) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lotes_tubete'::regclass
      and conname = 'lotes_tubete_perda_kg_check'
  ) then
    alter table public.lotes_tubete
      add constraint lotes_tubete_perda_kg_check check (perda_kg >= 0);
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lotes_tubete'
      and column_name = 'perda'
  ) then
    execute 'update public.lotes_tubete set perda_kg = 0 where perda <> 0';
    alter table public.lotes_tubete drop column perda;
  end if;
end;
$$;

alter table public.lotes_tubete drop column if exists gramatura;

alter table public.stock_operation_logs
  add column if not exists corrige_log_id bigint
  references public.stock_operation_logs(id) on delete set null;

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
    quantidade_registro := greatest(cardinality(codigos_registro), 1);
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
      from public.stock_operation_logs
      where id = correcao_log_id;
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
    acao,
    entidade,
    registro_id,
    quantidade,
    codigos,
    operador,
    ator_email,
    ator_id,
    detalhes,
    corrige_log_id
  )
  values (
    operacao,
    nome_entidade,
    id_registro,
    quantidade_registro,
    codigos_registro,
    operador_registro,
    coalesce(email_ator, nullif(auth.jwt() ->> 'email', '')),
    coalesce(id_ator, auth.uid()),
    registro,
    correcao_log_id
  );

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

drop trigger if exists log_stock_operation on public.residuos;
create trigger log_stock_operation
after insert or update or delete on public.residuos
for each row execute function public.log_stock_operation();

create or replace function public.correct_stock_record(
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
  registro_corrigido jsonb;
  linhas_afetadas integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Correções de estoque devem ser autorizadas pelo servidor.';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object'
     or p_changes = '{}'::jsonb then
    raise exception 'Informe os campos que deseja corrigir.';
  end if;
  if nullif(btrim(p_motivo), '') is null or nullif(btrim(p_actor_email), '') is null then
    raise exception 'Informe o motivo e o responsável pela correção.';
  end if;

  select * into evento
  from public.stock_operation_logs
  where id = p_log_id
  for share;
  if not found then raise exception 'Operação original não encontrada.'; end if;
  if exists (
    select 1 from public.stock_operation_logs
    where corrige_log_id = p_log_id
  ) or exists (
    select 1
    from public.stock_operation_logs as posterior
    where posterior.entidade = evento.entidade
      and posterior.registro_id = evento.registro_id
      and posterior.id > p_log_id
  ) then
    raise exception 'Só é possível corrigir a operação mais recente deste registro. Abra o evento mais recente no log.';
  end if;

  perform set_config('app.stock_correction_log_id', p_log_id::text, true);
  perform set_config('app.stock_correction_reason', btrim(p_motivo), true);
  perform set_config('app.stock_correction_actor_email', lower(btrim(p_actor_email)), true);
  perform set_config('app.stock_correction_actor_id', p_actor_id::text, true);

  if evento.entidade = 'Lote de tubetes' then
    if p_changes - array['medida', 'cor', 'data_producao', 'caixas',
        'unidades_por_caixa', 'perda_kg', 'operador']::text[] <> '{}'::jsonb then
      raise exception 'Campo não permitido para correção de lote de tubetes.';
    end if;
    update public.lotes_tubete as lote
    set medida = case when p_changes ? 'medida' then p_changes ->> 'medida' else lote.medida end,
        cor = case when p_changes ? 'cor' then p_changes ->> 'cor' else lote.cor end,
        data_producao = case when p_changes ? 'data_producao'
          then (p_changes ->> 'data_producao')::date else lote.data_producao end,
        caixas = case when p_changes ? 'caixas'
          then (p_changes ->> 'caixas')::integer else lote.caixas end,
        unidades_por_caixa = case when p_changes ? 'unidades_por_caixa'
          then (p_changes ->> 'unidades_por_caixa')::integer else lote.unidades_por_caixa end,
        perda_kg = case when p_changes ? 'perda_kg'
          then (p_changes ->> 'perda_kg')::numeric else lote.perda_kg end,
        operador = case when p_changes ? 'operador' then p_changes ->> 'operador' else lote.operador end
    where lote.id::text = evento.registro_id
    returning to_jsonb(lote) into registro_atual;
  elsif evento.entidade = 'Rolo de insumo' then
    if p_changes - array['id_codigo', 'tipo', 'medida_categoria', 'peso_liq_kg',
        'validade', 'data_registro']::text[] <> '{}'::jsonb then
      raise exception 'Campo não permitido para correção de rolo de insumo.';
    end if;
    select to_jsonb(insumo) into registro_atual
    from public.insumos_rolos as insumo
    where insumo.id_codigo = evento.registro_id
    for update;
    if evento.acao = 'SAÍDA' and registro_atual is not null then
      raise exception 'Este código já está ativo. A saída antiga não pode restaurar ou alterar outro registro.';
    end if;
    if not found and evento.acao = 'SAÍDA' then
      registro_corrigido := evento.detalhes || p_changes;
      insert into public.insumos_rolos as insumo (
        id_codigo, tipo, medida_categoria, peso_liq_kg, validade, data_registro
      )
      values (
        coalesce(registro_corrigido ->> 'id_codigo', evento.registro_id),
        registro_corrigido ->> 'tipo',
        registro_corrigido ->> 'medida_categoria',
        (registro_corrigido ->> 'peso_liq_kg')::numeric,
        registro_corrigido ->> 'validade',
        (registro_corrigido ->> 'data_registro')::date
      )
      returning to_jsonb(insumo) into registro_atual;
    else
      update public.insumos_rolos as insumo
      set id_codigo = case when p_changes ? 'id_codigo' then p_changes ->> 'id_codigo' else insumo.id_codigo end,
          tipo = case when p_changes ? 'tipo' then p_changes ->> 'tipo' else insumo.tipo end,
          medida_categoria = case when p_changes ? 'medida_categoria'
            then p_changes ->> 'medida_categoria' else insumo.medida_categoria end,
          peso_liq_kg = case when p_changes ? 'peso_liq_kg'
            then (p_changes ->> 'peso_liq_kg')::numeric else insumo.peso_liq_kg end,
          validade = case when p_changes ? 'validade'
            then p_changes ->> 'validade' else insumo.validade end,
          data_registro = case when p_changes ? 'data_registro'
            then (p_changes ->> 'data_registro')::date else insumo.data_registro end
      where insumo.id_codigo = evento.registro_id
      returning to_jsonb(insumo) into registro_atual;
    end if;
  elsif evento.entidade = 'Rolo' then
    if p_changes - array['id', 'medida', 'peso_bruto', 'tara', 'validade', 'entrada']::text[] <> '{}'::jsonb then
      raise exception 'Campo não permitido para correção de rolo.';
    end if;
    select to_jsonb(rolo) into registro_atual
    from public.rolos as rolo
    where rolo.id = evento.registro_id
    for update;
    if evento.acao = 'SAÍDA' and registro_atual is not null then
      raise exception 'Este código já está ativo. A saída antiga não pode restaurar ou alterar outro registro.';
    end if;
    if not found and evento.acao = 'SAÍDA' then
      registro_corrigido := evento.detalhes || p_changes;
      insert into public.rolos as rolo (
        id, medida, peso_bruto, tara, validade, entrada
      )
      values (
        coalesce(registro_corrigido ->> 'id', evento.registro_id),
        registro_corrigido ->> 'medida',
        (registro_corrigido ->> 'peso_bruto')::numeric,
        (registro_corrigido ->> 'tara')::numeric,
        registro_corrigido ->> 'validade',
        (registro_corrigido ->> 'entrada')::date
      )
      returning to_jsonb(rolo) into registro_atual;
    else
      update public.rolos as rolo
      set id = case when p_changes ? 'id' then p_changes ->> 'id' else rolo.id end,
          medida = case when p_changes ? 'medida' then p_changes ->> 'medida' else rolo.medida end,
          peso_bruto = case when p_changes ? 'peso_bruto'
            then (p_changes ->> 'peso_bruto')::numeric else rolo.peso_bruto end,
          tara = case when p_changes ? 'tara' then (p_changes ->> 'tara')::numeric else rolo.tara end,
          validade = case when p_changes ? 'validade' then p_changes ->> 'validade' else rolo.validade end,
          entrada = case when p_changes ? 'entrada'
            then (p_changes ->> 'entrada')::date else rolo.entrada end
      where rolo.id = evento.registro_id
      returning to_jsonb(rolo) into registro_atual;
    end if;
  elsif evento.entidade = 'Produção de tubos' then
    if p_changes - array['destino', 'data', 'espessura', 'tubo', 'capa',
        'codigos', 'operador', 'perda', 'container', 'carrinho']::text[] <> '{}'::jsonb then
      raise exception 'Campo não permitido para correção de produção de tubos.';
    end if;
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
        carrinho = case when p_changes ? 'carrinho' then p_changes ->> 'carrinho' else producao.carrinho end
    where producao.id::text = evento.registro_id
    returning to_jsonb(producao) into registro_atual;
  elsif evento.entidade = 'Resíduo' then
    if p_changes - array['data', 'origem', 'peso', 'operador']::text[] <> '{}'::jsonb then
      raise exception 'Campo não permitido para correção de resíduo.';
    end if;
    update public.residuos as residuo
    set data = case when p_changes ? 'data' then (p_changes ->> 'data')::date else residuo.data end,
        origem = case when p_changes ? 'origem' then p_changes ->> 'origem' else residuo.origem end,
        peso = case when p_changes ? 'peso' then (p_changes ->> 'peso')::numeric else residuo.peso end,
        operador = case when p_changes ? 'operador' then p_changes ->> 'operador' else residuo.operador end
    where residuo.id::text = evento.registro_id
    returning to_jsonb(residuo) into registro_atual;
  else
    raise exception 'Este tipo de operação não pode ser corrigido por esta tela.';
  end if;

  get diagnostics linhas_afetadas = row_count;
  if linhas_afetadas = 0 or registro_atual is null then
    raise exception 'O registro atual não existe mais no estoque.';
  end if;
  return registro_atual;
end;
$$;

revoke all on function public.correct_stock_record(bigint, jsonb, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.correct_stock_record(bigint, jsonb, text, text, uuid)
  to service_role;

commit;
