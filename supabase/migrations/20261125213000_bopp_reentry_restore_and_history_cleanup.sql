-- Permite reutilizar um código em uma nova entrada, registra o snapshot da bobina,
-- atualiza uma única linha de conferência por código e devolve o saldo quando a produção é excluída.

alter table estoque_atual.bobinas_utilizadas
  add column if not exists bobina_id uuid,
  add column if not exists dados_bobina jsonb;

create or replace function estoque_atual.conferir_baixa_bopp_virgem_por_codigo(p_codigo text)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_bobina estoque_atual.bobinas_estoque_virgem%rowtype;
  v_qtd integer := 0;
  v_peso_produzido numeric(14,3) := 0;
  v_data_producao date;
  v_diferenca numeric(10,3);
  v_status text;
  v_mensagem text;
  v_tem_historico boolean := false;
begin
  if v_codigo = '' then
    return jsonb_build_object('status','CODIGO_VAZIO');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_codigo, 0));

  select c.status into v_status
  from estoque_atual.bopp_baixa_conferencias c
  where c.codigo=v_codigo;

  select * into v_bobina
  from estoque_atual.bobinas_estoque_virgem b
  where b.categoria='BOPP' and upper(trim(b.codigo))=v_codigo
  order by b.importado_em desc
  limit 1
  for update;

  if not found then
    select exists (
      select 1 from estoque_atual.bobinas_utilizadas u
      where upper(trim(u.codigo)) = v_codigo
    ) into v_tem_historico;

    if v_tem_historico then
      insert into estoque_atual.bopp_baixa_conferencias
        (codigo,status,mensagem,updated_at,baixada_em)
      values (v_codigo,'JA_BAIXADA','Este código já foi consumido e não há uma nova entrada ativa no estoque.',now(),now())
      on conflict (codigo) do update set
        status='JA_BAIXADA',mensagem=excluded.mensagem,updated_at=now(),
        baixada_em=coalesce(estoque_atual.bopp_baixa_conferencias.baixada_em,now());
      return jsonb_build_object('status','JA_BAIXADA','codigo',v_codigo,
        'mensagem','Código já consumido; não existe uma nova entrada ativa no estoque.');
    end if;

    insert into estoque_atual.bopp_baixa_conferencias
      (codigo,status,mensagem,updated_at)
    values (v_codigo,'SEM_ESTOQUE','Código não localizado no Estoque Atual Virgem; nenhuma baixa foi realizada.',now())
    on conflict (codigo) do update set
      status='SEM_ESTOQUE',mensagem=excluded.mensagem,updated_at=now();
    return jsonb_build_object('status','SEM_ESTOQUE','codigo',v_codigo);
  end if;

  select count(*)::integer,
         coalesce(sum(b.peso_filme_bopp_kg),0)::numeric(14,3),
         max(b.data)
    into v_qtd,v_peso_produzido,v_data_producao
  from cobrideira.bobinas b
  where upper(trim(b.cod_bob))=v_codigo
    and upper(trim(b.material))='BOPP'
    and b.conferir_baixa_virgem is true;

  if coalesce(v_bobina.peso_kg,0) <= 0 then
    v_status := 'SEM_PESO';
    v_mensagem := 'A bobina do estoque está sem peso válido. Corrija o peso antes da baixa.';
    insert into estoque_atual.bopp_baixa_conferencias
      (codigo,status,quantidade_bobinas,peso_estoque_kg,peso_produzido_kg,mensagem,updated_at)
    values (v_codigo,v_status,v_qtd,v_bobina.peso_kg,v_peso_produzido,v_mensagem,now())
    on conflict (codigo) do update set
      status=excluded.status,quantidade_bobinas=excluded.quantidade_bobinas,
      peso_estoque_kg=excluded.peso_estoque_kg,peso_produzido_kg=excluded.peso_produzido_kg,
      diferenca_percentual=null,mensagem=excluded.mensagem,updated_at=now();
    return jsonb_build_object('status',v_status,'codigo',v_codigo,'mensagem',v_mensagem);
  end if;

  if v_qtd = 0 or v_peso_produzido <= 0 then
    v_status := 'AGUARDANDO';
    v_mensagem := 'Aguardando bobinas de produção para este código.';
    insert into estoque_atual.bopp_baixa_conferencias
      (codigo,status,quantidade_bobinas,peso_estoque_kg,peso_produzido_kg,diferenca_percentual,mensagem,updated_at)
    values (v_codigo,v_status,v_qtd,v_bobina.peso_kg,v_peso_produzido,null,v_mensagem,now())
    on conflict (codigo) do update set
      status=excluded.status,quantidade_bobinas=excluded.quantidade_bobinas,
      peso_estoque_kg=excluded.peso_estoque_kg,peso_produzido_kg=excluded.peso_produzido_kg,
      diferenca_percentual=null,mensagem=excluded.mensagem,updated_at=now();
    return jsonb_build_object('status',v_status,'codigo',v_codigo,
      'peso_estoque_kg',v_bobina.peso_kg,'peso_produzido_kg',v_peso_produzido);
  end if;

  v_diferenca := round(abs(v_peso_produzido-v_bobina.peso_kg)/v_bobina.peso_kg*100,3);

  if v_peso_produzido < v_bobina.peso_kg * 0.95 then
    v_status := 'AGUARDANDO';
    v_mensagem := format('Produção parcial: %s kg de %s kg. Aguardando novas bobinas; tolerância de baixa: 5%%.',
      round(v_peso_produzido,3),round(v_bobina.peso_kg,3));
    insert into estoque_atual.bopp_baixa_conferencias
      (codigo,status,quantidade_bobinas,peso_estoque_kg,peso_produzido_kg,diferenca_percentual,mensagem,updated_at)
    values (v_codigo,v_status,v_qtd,v_bobina.peso_kg,v_peso_produzido,v_diferenca,v_mensagem,now())
    on conflict (codigo) do update set
      status=excluded.status,quantidade_bobinas=excluded.quantidade_bobinas,
      peso_estoque_kg=excluded.peso_estoque_kg,peso_produzido_kg=excluded.peso_produzido_kg,
      diferenca_percentual=excluded.diferenca_percentual,mensagem=excluded.mensagem,updated_at=now();
    return jsonb_build_object('status',v_status,'codigo',v_codigo,
      'peso_estoque_kg',v_bobina.peso_kg,'peso_produzido_kg',v_peso_produzido,'diferenca_percentual',v_diferenca);
  end if;

  if v_peso_produzido > v_bobina.peso_kg * 1.05 then
    v_status := 'BAIXADA_COM_ALERTA';
    v_mensagem := format('ALERTA: produção acumulada (%s kg) ultrapassou o peso do estoque (%s kg) em %s%%. A baixa foi realizada e o código removido do estoque; confira a divergência.',
      round(v_peso_produzido,3),round(v_bobina.peso_kg,3),v_diferenca);
  else
    v_status := 'BAIXADA';
    v_mensagem := format('Baixa automática concluída: %s bobina(s) produzida(s), %s kg calculados para %s kg no estoque (diferença %s%%).',
      v_qtd,round(v_peso_produzido,3),round(v_bobina.peso_kg,3),v_diferenca);
  end if;

  insert into estoque_atual.bobinas_utilizadas (
    data_utilizacao,fornecedor,medida,peso_kg,codigo,origem_arquivo,
    numero_bobina,data_entrada_origem,nota_fiscal,operador,bobina_id,dados_bobina
  ) values (
    coalesce(v_data_producao,current_date),v_bobina.fornecedor,v_bobina.medida,
    v_bobina.peso_kg,v_bobina.codigo,'Baixa automática por conferência de peso BOPP',
    null,v_bobina.data_entrada,v_bobina.nf,'BAIXA AUTOMÁTICA',v_bobina.id,to_jsonb(v_bobina)
  )
  on conflict (codigo) where codigo is not null and btrim(codigo) <> '' do update set
    data_utilizacao=excluded.data_utilizacao,fornecedor=excluded.fornecedor,
    medida=excluded.medida,peso_kg=excluded.peso_kg,
    origem_arquivo=excluded.origem_arquivo,numero_bobina=excluded.numero_bobina,
    data_entrada_origem=excluded.data_entrada_origem,nota_fiscal=excluded.nota_fiscal,
    operador=excluded.operador,bobina_id=excluded.bobina_id,
    dados_bobina=excluded.dados_bobina,importado_em=now();

  insert into estoque_atual.bobinas_utilizadas_eventos (
    chave_evento,codigo,data_utilizacao,fornecedor,nota_fiscal,data_entrada_origem,
    medida,peso_kg,operador,origem_arquivo
  ) values (
    'BAIXA-AUTO:'||v_codigo||':'||v_bobina.id::text,v_bobina.codigo,
    coalesce(v_data_producao,current_date),v_bobina.fornecedor,v_bobina.nf,
    v_bobina.data_entrada,v_bobina.medida,v_bobina.peso_kg,'BAIXA AUTOMÁTICA',
    'Baixa automática por conferência de peso BOPP'
  ) on conflict (chave_evento) do nothing;

  delete from estoque_atual.bobinas_estoque_virgem where id=v_bobina.id;

  insert into estoque_atual.bopp_baixa_conferencias
    (codigo,status,quantidade_bobinas,peso_estoque_kg,peso_produzido_kg,diferenca_percentual,mensagem,updated_at,baixada_em)
  values (v_codigo,v_status,v_qtd,v_bobina.peso_kg,v_peso_produzido,v_diferenca,v_mensagem,now(),now())
  on conflict (codigo) do update set
    status=excluded.status,quantidade_bobinas=excluded.quantidade_bobinas,
    peso_estoque_kg=excluded.peso_estoque_kg,peso_produzido_kg=excluded.peso_produzido_kg,
    diferenca_percentual=excluded.diferenca_percentual,mensagem=excluded.mensagem,
    updated_at=now(),baixada_em=now();

  return jsonb_build_object('status',v_status,'codigo',v_codigo,'quantidade_bobinas',v_qtd,
    'peso_estoque_kg',v_bobina.peso_kg,'peso_produzido_kg',v_peso_produzido,
    'diferenca_percentual',v_diferenca,'mensagem',v_mensagem);
end;
$function$;

create or replace function estoque_atual.reverter_baixa_bopp_ao_excluir_producao()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_codigo text := upper(trim(coalesce(old.cod_bob,'')));
  v_consumida estoque_atual.bobinas_utilizadas%rowtype;
  v_dados jsonb;
  v_medida_texto text;
  v_bobina_restaurada_id uuid;
begin
  if v_codigo = '' or upper(trim(coalesce(old.material,''))) <> 'BOPP'
     or coalesce(old.conferir_baixa_virgem,false) is not true then
    return old;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_codigo, 0));

  select * into v_consumida
  from estoque_atual.bobinas_utilizadas u
  where upper(trim(u.codigo))=v_codigo
    and u.origem_arquivo='Baixa automática por conferência de peso BOPP'
  order by u.importado_em desc
  limit 1
  for update;

  if not found then
    perform estoque_atual.conferir_baixa_bopp_virgem_por_codigo(v_codigo);
    return old;
  end if;

  if not exists (
    select 1 from estoque_atual.bobinas_estoque_virgem b
    where b.categoria='BOPP' and upper(trim(b.codigo))=v_codigo
  ) then
    if v_consumida.dados_bobina is not null then
      v_dados := (v_consumida.dados_bobina - 'id')
        || jsonb_build_object('id',gen_random_uuid(),'localizacao','ESTOQUE');
      insert into estoque_atual.bobinas_estoque_virgem
      select (jsonb_populate_record(null::estoque_atual.bobinas_estoque_virgem,v_dados)).*
      returning id into v_bobina_restaurada_id;
      if nullif(v_dados->>'entrada_id','') is not null then
        update estoque_atual.entradas_bopp_virgem_itens
        set bobina_id=v_bobina_restaurada_id
        where entrada_id=(v_dados->>'entrada_id')::uuid
          and upper(trim(codigo))=v_codigo;
      end if;
    else
      v_medida_texto := to_char(v_consumida.medida,'FM999999990.00');
      insert into estoque_atual.bobinas_estoque_virgem
        (categoria,data_entrada,fornecedor,medida,peso_kg,metragem_m,codigo,
         origem_arquivo,observacoes,cliente,nf,medida_texto,localizacao)
      values
        ('BOPP',v_consumida.data_entrada_origem,v_consumida.fornecedor,v_consumida.medida,
         v_consumida.peso_kg,v_consumida.metragem_m,v_consumida.codigo,
         'Estorno automático da baixa BOPP por exclusão da produção',
         'Bobina devolvida ao estoque após exclusão do registro de produção.',
         null,v_consumida.nota_fiscal,v_medida_texto,'ESTOQUE');
    end if;
  end if;

  delete from estoque_atual.bobinas_utilizadas_eventos
  where chave_evento = case
    when v_consumida.bobina_id is null then 'BAIXA-AUTO:'||v_codigo
    else 'BAIXA-AUTO:'||v_codigo||':'||v_consumida.bobina_id::text
  end;

  delete from estoque_atual.bobinas_utilizadas where id=v_consumida.id;

  perform estoque_atual.conferir_baixa_bopp_virgem_por_codigo(v_codigo);
  return old;
end;
$function$;

drop trigger if exists trg_reverter_baixa_bopp_ao_excluir_producao on cobrideira.bobinas;
create trigger trg_reverter_baixa_bopp_ao_excluir_producao
after delete on cobrideira.bobinas
for each row execute function estoque_atual.reverter_baixa_bopp_ao_excluir_producao();

delete from estoque_atual.bopp_baixa_conferencias_historico older
using estoque_atual.bopp_baixa_conferencias_historico newer
where older.codigo=newer.codigo and older.id < newer.id;

create unique index if not exists bopp_baixa_conferencias_historico_codigo_uidx
  on estoque_atual.bopp_baixa_conferencias_historico(codigo);

create or replace function estoque_atual.registrar_historico_conferencia_bopp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='INSERT'
     or old.status is distinct from new.status
     or old.quantidade_bobinas is distinct from new.quantidade_bobinas
     or old.peso_estoque_kg is distinct from new.peso_estoque_kg
     or old.peso_produzido_kg is distinct from new.peso_produzido_kg
     or old.diferenca_percentual is distinct from new.diferenca_percentual
     or old.mensagem is distinct from new.mensagem then
    insert into estoque_atual.bopp_baixa_conferencias_historico
      (codigo,status,quantidade_bobinas,peso_estoque_kg,peso_produzido_kg,diferenca_percentual,mensagem,baixada_em)
    values
      (new.codigo,new.status,new.quantidade_bobinas,new.peso_estoque_kg,new.peso_produzido_kg,new.diferenca_percentual,new.mensagem,new.baixada_em)
    on conflict (codigo) do update set
      status=excluded.status,quantidade_bobinas=excluded.quantidade_bobinas,
      peso_estoque_kg=excluded.peso_estoque_kg,peso_produzido_kg=excluded.peso_produzido_kg,
      diferenca_percentual=excluded.diferenca_percentual,mensagem=excluded.mensagem,
      registrado_em=now(),baixada_em=excluded.baixada_em;
  end if;
  return new;
end;
$$;

revoke all on function estoque_atual.registrar_historico_conferencia_bopp() from public,anon,authenticated,service_role;
