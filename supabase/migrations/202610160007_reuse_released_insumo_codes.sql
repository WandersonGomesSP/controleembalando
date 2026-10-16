begin;

delete from public.stock_code_registry as reservado
where not exists (
  select 1
  from public.rolos
  where rolos.id = reservado.codigo
)
and not exists (
  select 1
  from public.insumos_rolos
  where insumos_rolos.id_codigo = reservado.codigo
);

create or replace function public.reserve_global_stock_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  codigo_novo text;
  codigo_antigo text;
  origem text;
  linhas_afetadas integer;
begin
  origem := TG_TABLE_NAME;
  if origem = 'rolos' then
    if TG_OP = 'INSERT' then
      codigo_antigo := null;
    else
      codigo_antigo := OLD.id;
    end if;
    if TG_OP = 'DELETE' then
      codigo_novo := null;
    else
      codigo_novo := NEW.id;
    end if;
  else
    if TG_OP = 'INSERT' then
      codigo_antigo := null;
    else
      codigo_antigo := OLD.id_codigo;
    end if;
    if TG_OP = 'DELETE' then
      codigo_novo := null;
    else
      codigo_novo := NEW.id_codigo;
    end if;
  end if;

  if TG_OP = 'DELETE' then
    delete from public.stock_code_registry
    where codigo = codigo_antigo and tabela_origem = origem;
    return OLD;
  end if;

  if TG_OP = 'UPDATE' and codigo_antigo = codigo_novo then
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    delete from public.stock_code_registry
    where codigo = codigo_antigo and tabela_origem = origem;
  end if;

  insert into public.stock_code_registry as reservado (codigo, tabela_origem)
  values (codigo_novo, origem)
  on conflict (codigo) do update
    set tabela_origem = excluded.tabela_origem
    where reservado.tabela_origem = excluded.tabela_origem;
  get diagnostics linhas_afetadas = row_count;
  if linhas_afetadas = 0 then
    raise exception using
      errcode = '23505',
      message = 'Código já está cadastrado em outra tabela de estoque: ' || codigo_novo;
  end if;
  return NEW;
end;
$$;

insert into public.stock_code_registry (codigo, tabela_origem)
select id, 'rolos' from public.rolos
union all
select id_codigo, 'insumos_rolos' from public.insumos_rolos
on conflict (codigo) do update
set tabela_origem = excluded.tabela_origem
where public.stock_code_registry.tabela_origem = excluded.tabela_origem;

create or replace function public.codigo_insumo_utilizado(p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.insumos_rolos where id_codigo = p_codigo
  );
$$;

create or replace function public.proximo_codigo_insumo(
  p_tipo text,
  p_medida_categoria text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefixo text;
  sufixo text := '';
  chave_serie text;
  sequencia integer;
  codigo_candidato text;
begin
  if not public.can_access_area('tubeteira') then
    raise exception 'Acesso negado à área de tubeteira.';
  end if;
  if not exists (
    select 1 from public.referencias_insumos
    where tipo = p_tipo and medida_categoria = p_medida_categoria
  ) then
    raise exception 'Tipo ou categoria de insumo não cadastrada.';
  end if;

  if p_tipo = 'CAPA' then
    if p_medida_categoria = 'Capa Branca' then
      prefixo := 'B' || to_char(current_date, 'MM');
    elsif p_medida_categoria = 'Capa Marrom' then
      prefixo := 'M' || to_char(current_date, 'MM');
    else
      raise exception 'Categoria de capa inválida.';
    end if;
    chave_serie := prefixo;
  elsif p_tipo = 'ROTULO' then
    prefixo := substring(p_medida_categoria from '^([0-9]{2})');
    if prefixo is null then
      raise exception 'Categoria de rótulo inválida.';
    end if;
    if p_medida_categoria = '18mm Fix Baby' then
      sufixo := 'F';
    elsif p_medida_categoria = '19mm Hosp' then
      sufixo := 'H';
    end if;
    chave_serie := prefixo || sufixo;
  else
    raise exception 'Tipo de insumo inválido.';
  end if;

  perform pg_advisory_xact_lock(hashtext('insumo-codigo:' || chave_serie));

  if p_tipo = 'ROTULO' then
    for sequencia in 1..99 loop
      codigo_candidato := prefixo || lpad(sequencia::text, 2, '0') || sufixo;
      if not exists (
        select 1 from public.insumos_rolos
        where id_codigo = codigo_candidato
      ) then
        return codigo_candidato;
      end if;
    end loop;
    raise exception 'Sequência de dois dígitos esgotada para esta série.';
  end if;

  select coalesce(
    max(substring(id_codigo from char_length(prefixo) + 1 for 2)::integer),
    0
  ) + 1
  into sequencia
  from public.insumos_rolos
  where id_codigo ~ ('^' || prefixo || '[0-9]{2}$');

  if sequencia > 99 then
    raise exception 'Sequência mensal de capa esgotada.';
  end if;
  return prefixo || lpad(sequencia::text, 2, '0');
end;
$$;

create or replace function public.consultar_codigos_insumo(
  p_tipo text,
  p_medida_categoria text,
  p_quantidade integer
)
returns table (codigos text[], maior_codigo text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefixo text;
  sufixo text := '';
  chave_serie text;
  maior_sequencia integer := 0;
  sequencia integer;
  codigo_candidato text;
begin
  if not public.can_access_area('tubeteira') then
    raise exception 'Acesso negado à área de tubeteira.';
  end if;
  if p_quantidade < 1 or p_quantidade > 99 then
    raise exception 'A quantidade deve estar entre 1 e 99 rolos.';
  end if;
  if not exists (
    select 1 from public.referencias_insumos
    where tipo = p_tipo and medida_categoria = p_medida_categoria
  ) then
    raise exception 'Tipo ou categoria de insumo não cadastrada.';
  end if;

  if p_tipo = 'CAPA' then
    if p_medida_categoria = 'Capa Branca' then
      prefixo := 'B' || to_char(current_date, 'MM');
    elsif p_medida_categoria = 'Capa Marrom' then
      prefixo := 'M' || to_char(current_date, 'MM');
    else
      raise exception 'Categoria de capa inválida.';
    end if;
    chave_serie := prefixo;
  elsif p_tipo = 'ROTULO' then
    prefixo := substring(p_medida_categoria from '^([0-9]{2})');
    if prefixo is null then
      raise exception 'Categoria de rótulo inválida.';
    end if;
    if p_medida_categoria = '18mm Fix Baby' then
      sufixo := 'F';
    elsif p_medida_categoria = '19mm Hosp' then
      sufixo := 'H';
    end if;
    chave_serie := prefixo || sufixo;
  else
    raise exception 'Tipo de insumo inválido.';
  end if;

  perform pg_advisory_xact_lock(hashtext('insumo-codigo:' || chave_serie));

  select coalesce(
    max(substring(id_codigo from char_length(prefixo) + 1 for 2)::integer),
    0
  )
  into maior_sequencia
  from public.insumos_rolos
  where id_codigo ~ ('^' || prefixo || '[0-9]{2}' || sufixo || '$');

  if maior_sequencia > 0 then
    maior_codigo := prefixo || lpad(maior_sequencia::text, 2, '0') || sufixo;
  else
    maior_codigo := null;
  end if;

  codigos := array[]::text[];
  if p_tipo = 'ROTULO' then
    for sequencia in 1..99 loop
      codigo_candidato := prefixo || lpad(sequencia::text, 2, '0') || sufixo;
      if not exists (
        select 1 from public.insumos_rolos
        where id_codigo = codigo_candidato
      ) then
        codigos := array_append(codigos, codigo_candidato);
        if cardinality(codigos) = p_quantidade then
          exit;
        end if;
      end if;
    end loop;
  else
    for sequencia in (maior_sequencia + 1)..(maior_sequencia + p_quantidade) loop
      if sequencia > 99 then
        raise exception 'Sequência mensal de capa esgotada.';
      end if;
      codigo_candidato := prefixo || lpad(sequencia::text, 2, '0');
      codigos := array_append(codigos, codigo_candidato);
    end loop;
  end if;

  if cardinality(codigos) < p_quantidade then
    raise exception 'Sequência de códigos esgotada para esta série.';
  end if;
  return next;
end;
$$;

revoke all on function public.codigo_insumo_utilizado(text)
  from public, anon, authenticated;
revoke all on function public.proximo_codigo_insumo(text, text)
  from public, anon;
revoke all on function public.consultar_codigos_insumo(text, text, integer)
  from public, anon;
grant execute on function public.proximo_codigo_insumo(text, text)
  to authenticated;
grant execute on function public.consultar_codigos_insumo(text, text, integer)
  to authenticated;

commit;
