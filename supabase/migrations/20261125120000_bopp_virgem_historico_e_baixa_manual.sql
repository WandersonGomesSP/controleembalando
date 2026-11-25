alter table estoque_atual.bobinas_utilizadas
  add column if not exists nota_fiscal text,
  add column if not exists data_entrada_origem date,
  add column if not exists operador text,
  add column if not exists numero_bobina text;

create unique index if not exists bobinas_utilizadas_codigo_uidx
  on estoque_atual.bobinas_utilizadas (upper(trim(codigo)));

create table if not exists estoque_atual.bobinas_utilizadas_eventos (
  id uuid primary key default gen_random_uuid(),
  chave_evento text not null unique,
  codigo text not null,
  data_utilizacao date,
  fornecedor text,
  nota_fiscal text,
  data_entrada_origem date,
  medida numeric,
  peso_kg numeric,
  operador text,
  origem_arquivo text not null default 'PCP - CONTROLE FILME - BOBINAS ADESIVADAS.csv',
  linha_arquivo integer,
  created_at timestamptz not null default now()
);

create index if not exists bobinas_utilizadas_eventos_codigo_idx
  on estoque_atual.bobinas_utilizadas_eventos (upper(trim(codigo)));
create index if not exists bobinas_utilizadas_eventos_data_idx
  on estoque_atual.bobinas_utilizadas_eventos (data_utilizacao desc);

alter table estoque_atual.bobinas_utilizadas_eventos enable row level security;
drop policy if exists "authenticated manage consumo virgem eventos" on estoque_atual.bobinas_utilizadas_eventos;
create policy "authenticated manage consumo virgem eventos"
on estoque_atual.bobinas_utilizadas_eventos for all to authenticated
using (true) with check (true);
grant select, insert, update, delete on estoque_atual.bobinas_utilizadas_eventos to authenticated;

alter table estoque_atual.retiradas_bopp_virgem
  add column if not exists chave_importacao text;
create unique index if not exists retiradas_bopp_virgem_chave_importacao_uidx
  on estoque_atual.retiradas_bopp_virgem(chave_importacao)
  where chave_importacao is not null;
create unique index if not exists retiradas_bopp_virgem_itens_codigo_uidx
  on estoque_atual.retiradas_bopp_virgem_itens(retirada_id, codigo);

create or replace function estoque_atual.baixar_bopp_virgem(
  p_codigo text,
  p_numero_bobina text default null,
  p_data_utilizacao date default current_date
)
returns jsonb
language plpgsql
security invoker
set search_path = estoque_atual, public
as $$
declare
  v_bobina estoque_atual.bobinas_estoque_virgem%rowtype;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_evento text := 'BAIXA-MANUAL:' || gen_random_uuid()::text;
begin
  if v_codigo = '' then
    raise exception 'Informe o código da bobina de filme.';
  end if;

  if exists (select 1 from estoque_atual.bobinas_utilizadas where upper(trim(codigo)) = v_codigo) then
    return jsonb_build_object('status', 'ja_baixada', 'codigo', v_codigo);
  end if;

  select * into v_bobina
  from estoque_atual.bobinas_estoque_virgem
  where upper(trim(codigo)) = v_codigo
  for update;

  if not found then
    return jsonb_build_object('status', 'nao_encontrada', 'codigo', v_codigo);
  end if;

  insert into estoque_atual.bobinas_utilizadas (
    data_utilizacao, fornecedor, medida, peso_kg, codigo,
    origem_arquivo, numero_bobina, data_entrada_origem
  ) values (
    coalesce(p_data_utilizacao, current_date),
    v_bobina.fornecedor, v_bobina.medida, v_bobina.peso_kg, v_bobina.codigo,
    'Baixa manual pela Cobrideira', nullif(trim(coalesce(p_numero_bobina, '')), ''),
    v_bobina.data_entrada
  );

  insert into estoque_atual.bobinas_utilizadas_eventos (
    chave_evento,codigo,data_utilizacao,fornecedor,data_entrada_origem,medida,peso_kg,operador,origem_arquivo
  ) values (
    v_evento,v_bobina.codigo,coalesce(p_data_utilizacao,current_date),v_bobina.fornecedor,
    v_bobina.data_entrada,v_bobina.medida,v_bobina.peso_kg,null,
    'Baixa manual pela Cobrideira'
  );

  delete from estoque_atual.bobinas_estoque_virgem where id = v_bobina.id;

  return jsonb_build_object(
    'status', 'baixada',
    'codigo', v_bobina.codigo,
    'numero_bobina', nullif(trim(coalesce(p_numero_bobina, '')), '')
  );
end;
$$;

grant execute on function estoque_atual.baixar_bopp_virgem(text,text,date) to authenticated;
