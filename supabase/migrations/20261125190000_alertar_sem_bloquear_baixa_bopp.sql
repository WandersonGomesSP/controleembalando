-- Corrige divergência >105%: alertar sem bloquear a baixa e limpar saldo órfão já consumido.
alter table estoque_atual.bopp_baixa_conferencias drop constraint if exists bopp_baixa_conferencias_status_check;
alter table estoque_atual.bopp_baixa_conferencias add constraint bopp_baixa_conferencias_status_check
  check (status in ('AGUARDANDO','ALERTA_EXCESSO','BAIXADA','BAIXADA_COM_ALERTA','JA_BAIXADA','SEM_ESTOQUE','SEM_PESO'));
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

  select * into v_bobina
  from estoque_atual.bobinas_estoque_virgem b
  where b.categoria='BOPP' and upper(trim(b.codigo))=v_codigo
  for update;

  if exists (
    select 1 from estoque_atual.bobinas_utilizadas u
    where upper(trim(u.codigo)) = v_codigo
  ) then
    -- Se já existe consumo, elimina qualquer saldo órfão que tenha permanecido no estoque.
    if found then
      delete from estoque_atual.bobinas_estoque_virgem where id=v_bobina.id;
    end if;
    if v_status in ('BAIXADA','BAIXADA_COM_ALERTA') then
      return jsonb_build_object('status',v_status,'codigo',v_codigo,
        'mensagem','Este código já foi consumido e não permanece no estoque.');
    end if;
    insert into estoque_atual.bopp_baixa_conferencias
      (codigo,status,mensagem,updated_at,baixada_em)
    values (v_codigo,'JA_BAIXADA','Este código já constava no histórico de consumo; saldo residual removido do Estoque Atual Virgem.',now(),now())
    on conflict (codigo) do update set
      status='JA_BAIXADA',mensagem=excluded.mensagem,updated_at=now(),baixada_em=coalesce(estoque_atual.bopp_baixa_conferencias.baixada_em,now());
    return jsonb_build_object('status','JA_BAIXADA','codigo',v_codigo,
      'mensagem','Código já consumido; saldo residual removido do estoque.');
  end if;

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
    -- Acima de 105% gera alerta, mas NÃO bloqueia a baixa: o código foi consumido.
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
$$;