begin;

insert into public.stock_code_registry (codigo, tabela_origem)
select distinct historico.registro_id, 'insumos_rolos'
from public.stock_operation_logs as historico
where historico.entidade = 'Rolo de insumo'
union
select distinct codigo, 'rolos'
from public.stock_operation_logs as historico
cross join lateral unnest(historico.codigos) as codigos(codigo)
where historico.entidade = 'Rolo'
union
select distinct upper(btrim(item.valor #>> '{}')), 'insumos_rolos'
from public.producao_tubos as producao
cross join lateral jsonb_each(producao.codigos) as grupos(chave, valor)
cross join lateral jsonb_array_elements(grupos.valor) as item(valor)
where grupos.chave in ('codCapa', 'codRotulo')
  and jsonb_typeof(item.valor) = 'string'
  and btrim(item.valor #>> '{}') <> ''
on conflict (codigo) do nothing;

create or replace function public.reserve_global_stock_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  codigo_novo text;
  codigo_antigo text;
  linhas_afetadas integer;
begin
  if TG_TABLE_NAME = 'rolos' then
    codigo_novo := NEW.id;
    if TG_OP = 'UPDATE' then codigo_antigo := OLD.id; end if;
  else
    codigo_novo := NEW.id_codigo;
    if TG_OP = 'UPDATE' then codigo_antigo := OLD.id_codigo; end if;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  if TG_OP = 'UPDATE' and codigo_antigo = codigo_novo then
    return NEW;
  end if;

  insert into public.stock_code_registry (codigo, tabela_origem)
  values (codigo_novo, TG_TABLE_NAME)
  on conflict (codigo) do nothing;
  get diagnostics linhas_afetadas = row_count;
  if linhas_afetadas = 0 then
    raise exception using
      errcode = '23505',
      message = 'Código já foi utilizado no sistema: ' || codigo_novo;
  end if;
  return NEW;
end;
$$;

create or replace function public.registrar_producao_tubos_com_baixa(
  p_data date,
  p_espessura text,
  p_tubo text,
  p_capa text,
  p_codigos jsonb,
  p_operador text,
  p_perda numeric,
  p_container text,
  p_carrinho text,
  p_quantidade_carrinhos integer,
  p_quantidade_containers integer,
  p_tubos_por_carrinho integer,
  p_tubos_por_container integer
)
returns setof public.producao_tubos
language plpgsql
security definer
set search_path = ''
as $$
declare
  codigos_capa text[];
  codigos_rotulo text[];
  todos_codigos text[];
  quantidade_esperada integer;
  quantidade_encontrada integer;
  quantidade_excluida integer;
  producao_criada public.producao_tubos%rowtype;
begin
  if not public.can_access_area('tubeteira') then
    raise exception 'Acesso negado à área de tubeteira.';
  end if;
  if p_codigos is null or jsonb_typeof(p_codigos) <> 'object' then
    raise exception 'Os códigos da produção são inválidos.';
  end if;
  if exists (
    select 1
    from jsonb_each(p_codigos) as grupos(chave, valor)
    where jsonb_typeof(grupos.valor) <> 'array'
       or exists (
         select 1
         from jsonb_array_elements(
           case
             when jsonb_typeof(grupos.valor) = 'array' then grupos.valor
             else '[]'::jsonb
           end
         ) as item(valor)
         where jsonb_typeof(item.valor) <> 'string'
            or btrim(item.valor #>> '{}') = ''
       )
  ) then
    raise exception 'Os códigos devem ser listas de textos não vazios.';
  end if;

  select coalesce(array_agg(upper(btrim(item.valor #>> '{}'))), array[]::text[])
  into todos_codigos
  from jsonb_each(p_codigos) as grupos(chave, valor)
  cross join lateral jsonb_array_elements(grupos.valor) as item(valor);

  if cardinality(todos_codigos) <> (
    select count(distinct codigo)
    from unnest(todos_codigos) as codigos(codigo)
  ) then
    raise exception 'A produção não pode conter códigos repetidos.';
  end if;

  select coalesce(
    array_agg(upper(btrim(item.valor #>> '{}')) order by item.ordem),
    array[]::text[]
  )
  into codigos_capa
  from jsonb_array_elements(
    coalesce(p_codigos -> 'codCapa', '[]'::jsonb)
  ) with ordinality as item(valor, ordem);

  select coalesce(
    array_agg(upper(btrim(item.valor #>> '{}')) order by item.ordem),
    array[]::text[]
  )
  into codigos_rotulo
  from jsonb_array_elements(
    coalesce(p_codigos -> 'codRotulo', '[]'::jsonb)
  ) with ordinality as item(valor, ordem);

  todos_codigos := codigos_capa || codigos_rotulo;
  quantidade_esperada := cardinality(todos_codigos);

  perform insumo.id_codigo
  from public.insumos_rolos as insumo
  where insumo.id_codigo = any(todos_codigos)
  order by insumo.id_codigo
  for update;

  select count(*)::integer
  into quantidade_encontrada
  from public.insumos_rolos as insumo
  where (
    insumo.tipo = 'CAPA' and insumo.id_codigo = any(codigos_capa)
  ) or (
    insumo.tipo = 'ROTULO' and insumo.id_codigo = any(codigos_rotulo)
  );

  if quantidade_encontrada <> quantidade_esperada then
    raise exception 'Um ou mais códigos de capa/rótulo não existem no estoque ou são do tipo incorreto.';
  end if;

  insert into public.producao_tubos (
    destino,
    data,
    espessura,
    tubo,
    capa,
    codigos,
    operador,
    perda,
    container,
    carrinho,
    quantidade_carrinhos,
    quantidade_containers,
    tubos_por_carrinho,
    tubos_por_container
  )
  values (
    'Produção',
    p_data,
    p_espessura,
    p_tubo,
    p_capa,
    p_codigos,
    p_operador,
    p_perda,
    p_container,
    p_carrinho,
    p_quantidade_carrinhos,
    p_quantidade_containers,
    p_tubos_por_carrinho,
    p_tubos_por_container
  )
  returning * into producao_criada;

  delete from public.insumos_rolos
  where id_codigo = any(todos_codigos);
  get diagnostics quantidade_excluida = row_count;

  if quantidade_excluida <> quantidade_esperada then
    raise exception 'O estoque mudou durante a produção; nenhum registro foi salvo.';
  end if;

  return next producao_criada;
end;
$$;

create or replace function public.codigo_insumo_utilizado(p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.stock_code_registry as codigos_reservados
      where codigos_reservados.codigo = p_codigo
  );
$$;

revoke all on function public.codigo_insumo_utilizado(text)
  from public, anon, authenticated;

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
      ) and not public.codigo_insumo_utilizado(codigo_candidato) then
        return codigo_candidato;
      end if;
    end loop;
    raise exception 'Sequência de dois dígitos esgotada para esta série.';
  end if;

  select coalesce(
    max(substring(codigos.codigo from char_length(prefixo) + 1 for 2)::integer),
    0
  ) + 1
  into sequencia
  from (
    select codigos_reservados.codigo
    from public.stock_code_registry as codigos_reservados
  ) as codigos
  where codigos.codigo ~ ('^' || prefixo || '[0-9]{2}$');

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
    max(substring(codigos.codigo from char_length(prefixo) + 1 for 2)::integer),
    0
  )
  into maior_sequencia
  from (
    select codigos_reservados.codigo
    from public.stock_code_registry as codigos_reservados
  ) as codigos
  where codigos.codigo ~ ('^' || prefixo || '[0-9]{2}' || sufixo || '$');

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
        select 1 from public.insumos_rolos as estoque
        where estoque.id_codigo = codigo_candidato
      ) and not public.codigo_insumo_utilizado(codigo_candidato) then
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

revoke all on function public.proximo_codigo_insumo(text, text)
  from public, anon;
revoke all on function public.consultar_codigos_insumo(text, text, integer)
  from public, anon;
grant execute on function public.proximo_codigo_insumo(text, text)
  to authenticated;
grant execute on function public.consultar_codigos_insumo(text, text, integer)
  to authenticated;

revoke all on function public.registrar_producao_tubos_com_baixa(
  date, text, text, text, jsonb, text, numeric, text, text, integer, integer, integer, integer
) from public, anon;
grant execute on function public.registrar_producao_tubos_com_baixa(
  date, text, text, text, jsonb, text, numeric, text, text, integer, integer, integer, integer
) to authenticated;

drop policy if exists "authenticated users manage producao tubos"
  on public.producao_tubos;
drop policy if exists "tubeteira users manage producao tubos"
  on public.producao_tubos;
create policy "tubeteira users read producao tubos"
on public.producao_tubos for select to authenticated
using (public.can_access_area('tubeteira'));
create policy "tubeteira users update producao tubos"
on public.producao_tubos for update to authenticated
using (public.can_access_area('tubeteira'))
with check (public.can_access_area('tubeteira'));
create policy "tubeteira users delete producao tubos"
on public.producao_tubos for delete to authenticated
using (public.can_access_area('tubeteira'));

revoke insert on public.producao_tubos from public, anon, authenticated;

commit;
