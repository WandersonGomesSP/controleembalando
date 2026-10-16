create or replace function public.delete_admin_summary_record(
  p_entidade text,
  p_registro_id text,
  p_motivo text,
  p_actor_email text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  id_log bigint;
begin
  if p_motivo is null or length(btrim(p_motivo)) < 3 or length(p_motivo) > 500 then
    raise exception 'Informe um motivo válido para a exclusão.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_entidade || ':' || p_registro_id, 0));
  perform set_config('app.stock_correction_actor_email', p_actor_email, true);
  perform set_config('app.stock_correction_actor_id', p_actor_id::text, true);

  if p_entidade = 'Rolo de insumo' then
    delete from public.insumos_rolos where id_codigo = p_registro_id;
  elsif p_entidade = 'Produção de tubos' and p_registro_id ~ '^\d+$' then
    delete from public.producao_tubos where id = p_registro_id::bigint;
  elsif p_entidade = 'Lote de tubetes' and p_registro_id ~ '^\d+$' then
    delete from public.lotes_tubete where id = p_registro_id::bigint;
  else
    raise exception 'Entidade ou identificador não permitido.';
  end if;

  if not found then
    raise exception 'O registro não existe mais.';
  end if;

  select id into id_log
  from public.stock_operation_logs
  where id = currval(pg_get_serial_sequence('public.stock_operation_logs', 'id'))
    and entidade = p_entidade
    and registro_id = p_registro_id
    and acao = 'SAÍDA';

  if id_log is null then
    raise exception 'Não foi possível registrar a exclusão no histórico.';
  end if;

  update public.stock_operation_logs
  set detalhes = jsonb_set(
    detalhes,
    '{motivo_exclusao}',
    to_jsonb(btrim(p_motivo)),
    true
  )
  where id = id_log;
end;
$$;

revoke all on function public.delete_admin_summary_record(text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_admin_summary_record(text, text, text, text, uuid)
  to service_role;
