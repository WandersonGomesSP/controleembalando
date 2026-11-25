-- Reavalia a baixa também quando o estoque entra ou muda, e soma somente produções marcadas para conferência.
create or replace function estoque_atual.conferir_baixa_bopp_virgem_por_codigo(p_codigo text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_bobina estoque_atual.bobinas_estoque_virgem%rowtype;
  v_qtd integer := 0;
  v_peso_produzido numeric(14,3) := 0;
  v_data_producao date;
  v_diferenca numeric(10,3);
  v_status text;
  v_mensagem text;
begin
  if v_codigo = '' then
    return jsonb_build_object('status','CODIGO_VAZIO');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_codigo, 0));

  select c.status into v_status
  from estoque_atual.bopp_baixa_conferencias c
  where c.codigo=v_codigo;

  if exists (
    select 1 from estoque_atual.bobinas_utilizadas u
    where upper(trim(u.codigo)) = v_codigo
  ) then
    if v_status = 'BAIXADA' then
      return jsonb_build_object('status','BAIXADA','codigo',v_codigo,
        'mensagem','A baixa automática deste código já foi concluída.');
    end if;
    insert into estoque_atual.bopp_baixa_conferencias
      (codigo,status,mensagem,updated_at,baixada_em)
    values (v_codigo,'JA_BAIXADA','Este código já constava no histórico de consumo antes da conferência automática.',now(),now())
    on conflict (codigo) do update set
      status='JA_BAIXADA',mensagem=excluded.mensagem,updated_at=now();
    return jsonb_build_object('status','JA_BAIXADA','codigo',v_codigo);
  end if;

  select * into v_bobina
  from estoque_atual.bobinas_estoque_virgem b
  where b.categoria='BOPP' and upper(trim(b.codigo))=v_codigo
  for update;

  if not found then
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
    return jsonb_build_object('status',v_status,'codigo',v_codigo,'quantidade_bobinas',v_qtd,
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
    return jsonb_build_object('status',v_status,'codigo',v_codigo,'quantidade_bobinas',v_qtd,
      'peso_estoque_kg',v_bobina.peso_kg,'peso_produzido_kg',v_peso_produzido,'diferenca_percentual',v_diferenca);
  end if;

  if v_peso_produzido > v_bobina.peso_kg * 1.05 then
    v_status := 'ALERTA_EXCESSO';
    v_mensagem := format('ATENÇÃO: produção acumulada (%s kg) ultrapassou o peso do estoque (%s kg) em %s%%. Baixa automática bloqueada para conferência.',
      round(v_peso_produzido,3),round(v_bobina.peso_kg,3),v_diferenca);
    insert into estoque_atual.bopp_baixa_conferencias
      (codigo,status,quantidade_bobinas,peso_estoque_kg,peso_produzido_kg,diferenca_percentual,mensagem,updated_at)
    values (v_codigo,v_status,v_qtd,v_bobina.peso_kg,v_peso_produzido,v_diferenca,v_mensagem,now())
    on conflict (codigo) do update set
      status=excluded.status,quantidade_bobinas=excluded.quantidade_bobinas,
      peso_estoque_kg=excluded.peso_estoque_kg,peso_produzido_kg=excluded.peso_produzido_kg,
      diferenca_percentual=excluded.diferenca_percentual,mensagem=excluded.mensagem,updated_at=now();
    return jsonb_build_object('status',v_status,'codigo',v_codigo,'quantidade_bobinas',v_qtd,
      'peso_estoque_kg',v_bobina.peso_kg,'peso_produzido_kg',v_peso_produzido,'diferenca_percentual',v_diferenca,
      'mensagem',v_mensagem);
  end if;

  insert into estoque_atual.bobinas_utilizadas (
    data_utilizacao,fornecedor,medida,peso_kg,codigo,origem_arquivo,
    numero_bobina,data_entrada_origem,nota_fiscal,operador
  ) values (
    coalesce(v_data_producao,current_date),v_bobina.fornecedor,v_bobina.medida,
    v_bobina.peso_kg,v_bobina.codigo,'Baixa automática por conferência de peso BOPP',
    null,v_bobina.data_entrada,v_bobina.nf,'BAIXA AUTOMÁTICA'
  );

  insert into estoque_atual.bobinas_utilizadas_eventos (
    chave_evento,codigo,data_utilizacao,fornecedor,nota_fiscal,data_entrada_origem,
    medida,peso_kg,operador,origem_arquivo
  ) values (
    'BAIXA-AUTO:'||v_codigo,v_bobina.codigo,coalesce(v_data_producao,current_date),
    v_bobina.fornecedor,v_bobina.nf,v_bobina.data_entrada,v_bobina.medida,
    v_bobina.peso_kg,'BAIXA AUTOMÁTICA','Baixa automática por conferência de peso BOPP'
  ) on conflict (chave_evento) do nothing;

  delete from estoque_atual.bobinas_estoque_virgem where id=v_bobina.id;

  v_mensagem := format('Baixa automática concluída: %s bobina(s) produzida(s), %s kg calculados para %s kg no estoque (diferença %s%%).',
    v_qtd,round(v_peso_produzido,3),round(v_bobina.peso_kg,3),v_diferenca);
  insert into estoque_atual.bopp_baixa_conferencias
    (codigo,status,quantidade_bobinas,peso_estoque_kg,peso_produzido_kg,diferenca_percentual,mensagem,updated_at,baixada_em)
  values (v_codigo,'BAIXADA',v_qtd,v_bobina.peso_kg,v_peso_produzido,v_diferenca,v_mensagem,now(),now())
  on conflict (codigo) do update set
    status='BAIXADA',quantidade_bobinas=excluded.quantidade_bobinas,
    peso_estoque_kg=excluded.peso_estoque_kg,peso_produzido_kg=excluded.peso_produzido_kg,
    diferenca_percentual=excluded.diferenca_percentual,mensagem=excluded.mensagem,
    updated_at=now(),baixada_em=now();

  return jsonb_build_object('status','BAIXADA','codigo',v_codigo,'quantidade_bobinas',v_qtd,
    'peso_estoque_kg',v_bobina.peso_kg,'peso_produzido_kg',v_peso_produzido,
    'diferenca_percentual',v_diferenca,'mensagem',v_mensagem);
end;
$$;
create or replace function estoque_atual.conferir_baixa_bopp_virgem_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if upper(trim(coalesce(new.material,'')))='BOPP' then
    perform estoque_atual.conferir_baixa_bopp_virgem_por_codigo(new.cod_bob);
  end if;

  if tg_op='UPDATE'
     and old.cod_bob is distinct from new.cod_bob
     and upper(trim(coalesce(old.material,'')))='BOPP' then
    perform estoque_atual.conferir_baixa_bopp_virgem_por_codigo(old.cod_bob);
  end if;
  return new;
end;
$$;

create or replace function estoque_atual.reavaliar_baixa_bopp_virgem_estoque_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.categoria='BOPP' then
    perform estoque_atual.conferir_baixa_bopp_virgem_por_codigo(new.codigo);
  end if;

  if tg_op='UPDATE'
     and old.codigo is distinct from new.codigo
     and old.categoria='BOPP' then
    perform estoque_atual.conferir_baixa_bopp_virgem_por_codigo(old.codigo);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reavaliar_baixa_bopp_virgem_estoque on estoque_atual.bobinas_estoque_virgem;
create trigger trg_reavaliar_baixa_bopp_virgem_estoque
after insert or update of codigo,peso_kg,categoria on estoque_atual.bobinas_estoque_virgem
for each row execute function estoque_atual.reavaliar_baixa_bopp_virgem_estoque_trigger();
