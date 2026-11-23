
-- Histórico de envios para a Bahia (importação inicial e automação dos próximos envios).

create table if not exists cobrideira.historico_envios_bahia (
 id bigserial primary key,
 entrada_id bigint,
 data_entrada date not null,
 nf text not null,
 produto text not null,
 lote text not null,
 codigo_container text not null unique check (codigo_container ~ '^[0-9]{8}$'),
 peso_kg numeric not null check (peso_kg > 0),
 valor_por_container numeric,
 valor_por_kg numeric not null default 0,
 fornecedor text not null,
 data_envio date not null,
 mes text not null,
 status text not null default 'ENVIADO PARA BAHIA',
 origem text not null default 'HISTORICO_IMPORTADO',
 criado_em timestamptz not null default now()
);
alter table cobrideira.historico_envios_bahia enable row level security;
revoke all on cobrideira.historico_envios_bahia from anon,authenticated;
grant select,insert,update,delete on cobrideira.historico_envios_bahia to service_role;
grant usage,select on sequence cobrideira.historico_envios_bahia_id_seq to service_role;
create index if not exists historico_envios_bahia_data_idx on cobrideira.historico_envios_bahia(data_envio desc);
create index if not exists historico_envios_bahia_lote_idx on cobrideira.historico_envios_bahia(lote);

create or replace function cobrideira.registrar_historico_envio_bahia()
returns trigger language plpgsql set search_path=''
as $function$
declare v_mes text; v_data date;
begin
 if new.tipo <> 'RETIRADA_BAHIA' or new.codigo_container is null then return new; end if;
 v_data := (new.ocorrido_em at time zone 'America/Sao_Paulo')::date;
 v_mes := case extract(month from v_data)::integer
  when 1 then 'Janeiro' when 2 then 'Fevereiro' when 3 then 'Março'
  when 4 then 'Abril' when 5 then 'Maio' when 6 then 'Junho'
  when 7 then 'Julho' when 8 then 'Agosto' when 9 then 'Setembro'
  when 10 then 'Outubro' when 11 then 'Novembro' when 12 then 'Dezembro' end;
 insert into cobrideira.historico_envios_bahia
  (entrada_id,data_entrada,nf,produto,lote,codigo_container,peso_kg,
   valor_por_container,valor_por_kg,fornecedor,data_envio,mes,status,origem)
 select e.id,e.data_chegada,e.nf,e.produto,e.lote,new.codigo_container,
        e.peso_por_container_kg,e.valor_por_container,coalesce(e.valor_por_kg,0),
        e.fornecedor,v_data,v_mes,'ENVIADO PARA BAHIA','MOVIMENTACAO'
 from cobrideira.estoque_cola_entradas e where e.id=new.entrada_id
 on conflict (codigo_container) do nothing;
 return new;
end;
$function$;
drop trigger if exists trg_registrar_historico_envio_bahia on cobrideira.movimentacoes_cola;
create trigger trg_registrar_historico_envio_bahia after insert on cobrideira.movimentacoes_cola
for each row execute function cobrideira.registrar_historico_envio_bahia();

create temporary table tmp_envios_ba (
 data_entrada date,nf text,produto text,lote text,codigo_container text,
 peso_kg numeric,valor_por_container numeric,valor_por_kg numeric,
 fornecedor text,data_envio date
) on commit drop;
insert into tmp_envios_ba
select data_entrada,nf,produto,lote,codigo_container,peso_kg,
       valor_por_container,valor_por_kg,fornecedor,data_envio
from jsonb_to_recordset('[{"data_entrada":"2026-07-28","nf":"222414","produto":"PS-2001","lote":"A026Q7I011","codigo_container":"09280726","peso_kg":1000,"valor_por_container":8773.28,"valor_por_kg":8.77328,"fornecedor":"DOW","data_envio":"2026-11-19"},{"data_entrada":"2026-07-28","nf":"222414","produto":"PS-2001","lote":"A026Q7I011","codigo_container":"07280726","peso_kg":1000,"valor_por_container":8773.28,"valor_por_kg":8.77328,"fornecedor":"DOW","data_envio":"2026-11-19"},{"data_entrada":"2026-07-28","nf":"222414","produto":"PS-2001","lote":"A026Q7I011","codigo_container":"20280726","peso_kg":1000,"valor_por_container":8773.28,"valor_por_kg":8.77328,"fornecedor":"DOW","data_envio":"2026-11-19"},{"data_entrada":"2026-07-28","nf":"222414","produto":"PS-2001","lote":"A026Q7I011","codigo_container":"22280726","peso_kg":1000,"valor_por_container":8773.28,"valor_por_kg":8.77328,"fornecedor":"DOW","data_envio":"2026-11-19"},{"data_entrada":"2026-07-28","nf":"222414","produto":"PS-2001","lote":"A026Q7I011","codigo_container":"21280726","peso_kg":1000,"valor_por_container":8773.28,"valor_por_kg":8.77328,"fornecedor":"DOW","data_envio":"2026-11-19"},{"data_entrada":"2026-07-28","nf":"222414","produto":"PS-2001","lote":"A026Q7I011","codigo_container":"19280726","peso_kg":1000,"valor_por_container":8773.28,"valor_por_kg":8.77328,"fornecedor":"DOW","data_envio":"2026-11-19"},{"data_entrada":"2026-07-28","nf":"222414","produto":"PS-2001","lote":"A026Q7I011","codigo_container":"18280726","peso_kg":1000,"valor_por_container":8773.28,"valor_por_kg":8.77328,"fornecedor":"DOW","data_envio":"2026-11-19"},{"data_entrada":"2026-07-28","nf":"222414","produto":"PS-2001","lote":"A026Q7I011","codigo_container":"12280726","peso_kg":1000,"valor_por_container":8773.28,"valor_por_kg":8.77328,"fornecedor":"DOW","data_envio":"2026-11-19"},{"data_entrada":"2026-07-28","nf":"222414","produto":"PS-2001","lote":"A026Q7I011","codigo_container":"11280726","peso_kg":1000,"valor_por_container":8773.28,"valor_por_kg":8.77328,"fornecedor":"DOW","data_envio":"2026-11-19"},{"data_entrada":"2026-06-30","nf":"220188","produto":"PS-2001","lote":"A026Q65016","codigo_container":"06300626","peso_kg":1000,"valor_por_container":null,"valor_por_kg":0,"fornecedor":"DOW","data_envio":"2026-11-05"},{"data_entrada":"2026-06-30","nf":"220188","produto":"PS-2001","lote":"A026Q65016","codigo_container":"07300626","peso_kg":1000,"valor_por_container":null,"valor_por_kg":0,"fornecedor":"DOW","data_envio":"2026-11-05"},{"data_entrada":"2026-06-30","nf":"220188","produto":"PS-2001","lote":"A026Q65016","codigo_container":"09300626","peso_kg":1000,"valor_por_container":null,"valor_por_kg":0,"fornecedor":"DOW","data_envio":"2026-11-05"},{"data_entrada":"2026-06-30","nf":"220188","produto":"PS-2001","lote":"A026Q65016","codigo_container":"11300626","peso_kg":1000,"valor_por_container":null,"valor_por_kg":0,"fornecedor":"DOW","data_envio":"2026-11-05"},{"data_entrada":"2026-06-30","nf":"220188","produto":"PS-2001","lote":"A026Q65016","codigo_container":"12300626","peso_kg":1000,"valor_por_container":null,"valor_por_kg":0,"fornecedor":"DOW","data_envio":"2026-11-05"},{"data_entrada":"2026-06-30","nf":"220188","produto":"PS-2001","lote":"A026Q65016","codigo_container":"04300626","peso_kg":1000,"valor_por_container":null,"valor_por_kg":0,"fornecedor":"DOW","data_envio":"2026-11-05"},{"data_entrada":"2026-06-30","nf":"220188","produto":"PS-2001","lote":"A026Q65016","codigo_container":"10300626","peso_kg":1000,"valor_por_container":null,"valor_por_kg":0,"fornecedor":"DOW","data_envio":"2026-11-05"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"03190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"09190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"13190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"07190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"02190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"10190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"14190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"20190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"19190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"22190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"21190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-06-19","nf":"221703","produto":"PS-2001","lote":"A026Q65014","codigo_container":"12190626","peso_kg":1000,"valor_por_container":8914.82,"valor_por_kg":8.91482,"fornecedor":"DOW","data_envio":"2026-10-14"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"02290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"03290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"04290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"05290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"06290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"07290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"08290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"09290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"10290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"11290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"12290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"13290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-29","nf":"211353","produto":"PS-2001","lote":"A026Q5E012","codigo_container":"14290526","peso_kg":1000,"valor_por_container":8903.91,"valor_por_kg":8.90391,"fornecedor":"DOW","data_envio":"2026-09-16"},{"data_entrada":"2026-05-21","nf":"211223","produto":"PS-2001","lote":"A026Q4J027","codigo_container":"24210526","peso_kg":1000,"valor_por_container":8179.02,"valor_por_kg":8.17902,"fornecedor":"DOW","data_envio":"2026-08-28"},{"data_entrada":"2026-05-21","nf":"211223","produto":"PS-2001","lote":"A026Q4J027","codigo_container":"20210526","peso_kg":1000,"valor_por_container":8179.02,"valor_por_kg":8.17902,"fornecedor":"DOW","data_envio":"2026-08-28"},{"data_entrada":"2026-05-21","nf":"211223","produto":"PS-2001","lote":"A026Q4J027","codigo_container":"15210526","peso_kg":1000,"valor_por_container":8179.02,"valor_por_kg":8.17902,"fornecedor":"DOW","data_envio":"2026-08-28"},{"data_entrada":"2026-05-21","nf":"211223","produto":"PS-2001","lote":"A026Q4J027","codigo_container":"10210526","peso_kg":1000,"valor_por_container":8179.02,"valor_por_kg":8.17902,"fornecedor":"DOW","data_envio":"2026-08-28"},{"data_entrada":"2026-05-21","nf":"211223","produto":"PS-2001","lote":"A026Q4J027","codigo_container":"04210526","peso_kg":1000,"valor_por_container":8179.02,"valor_por_kg":8.17902,"fornecedor":"DOW","data_envio":"2026-08-28"},{"data_entrada":"2026-05-21","nf":"211223","produto":"PS-2001","lote":"A026Q4J027","codigo_container":"19210526","peso_kg":1000,"valor_por_container":8179.02,"valor_por_kg":8.17902,"fornecedor":"DOW","data_envio":"2026-08-28"},{"data_entrada":"2026-05-21","nf":"211223","produto":"PS-2001","lote":"A026Q4J027","codigo_container":"14210526","peso_kg":1000,"valor_por_container":8179.02,"valor_por_kg":8.17902,"fornecedor":"DOW","data_envio":"2026-08-28"},{"data_entrada":"2026-05-21","nf":"211223","produto":"PS-2001","lote":"A026Q4J027","codigo_container":"09210526","peso_kg":1000,"valor_por_container":8179.02,"valor_por_kg":8.17902,"fornecedor":"DOW","data_envio":"2026-08-28"},{"data_entrada":"2026-05-21","nf":"211223","produto":"PS-2001","lote":"A026Q4J027","codigo_container":"03210526","peso_kg":1000,"valor_por_container":8179.02,"valor_por_kg":8.17902,"fornecedor":"DOW","data_envio":"2026-08-28"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"21240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"20240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"18240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"17240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"16240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"15240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"14240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"12240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"11240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"10240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"08240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"13240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-08-05"},{"data_entrada":"2026-04-24","nf":"210696","produto":"PS-2001","lote":"A026Q4A005","codigo_container":"01240426","peso_kg":1000,"valor_por_container":8073.65,"valor_por_kg":8.07365,"fornecedor":"DOW","data_envio":"2026-07-14"},{"data_entrada":"2026-04-15","nf":"210537","produto":"PS-2001","lote":"A026Q4A004","codigo_container":"04150426","peso_kg":1000,"valor_por_container":8098.53,"valor_por_kg":8.09853,"fornecedor":"DOW","data_envio":"2026-07-14"},{"data_entrada":"2026-04-15","nf":"210537","produto":"PS-2001","lote":"A026Q4A004","codigo_container":"12150426","peso_kg":1000,"valor_por_container":8098.53,"valor_por_kg":8.09853,"fornecedor":"DOW","data_envio":"2026-07-14"},{"data_entrada":"2026-04-15","nf":"210537","produto":"PS-2001","lote":"A026Q4A004","codigo_container":"14150426","peso_kg":1000,"valor_por_container":8098.53,"valor_por_kg":8.09853,"fornecedor":"DOW","data_envio":"2026-07-14"},{"data_entrada":"2026-04-15","nf":"210537","produto":"PS-2001","lote":"A026Q4A004","codigo_container":"03150426","peso_kg":1000,"valor_por_container":8098.53,"valor_por_kg":8.09853,"fornecedor":"DOW","data_envio":"2026-07-14"},{"data_entrada":"2026-04-15","nf":"210537","produto":"PS-2001","lote":"A026Q4A004","codigo_container":"02150426","peso_kg":1000,"valor_por_container":8098.53,"valor_por_kg":8.09853,"fornecedor":"DOW","data_envio":"2026-07-14"},{"data_entrada":"2026-04-15","nf":"210537","produto":"PS-2001","lote":"A026Q4A004","codigo_container":"23150426","peso_kg":1000,"valor_por_container":8098.53,"valor_por_kg":8.09853,"fornecedor":"DOW","data_envio":"2026-07-14"},{"data_entrada":"2026-04-15","nf":"210537","produto":"PS-2001","lote":"A026Q4A004","codigo_container":"24150426","peso_kg":1000,"valor_por_container":8098.53,"valor_por_kg":8.09853,"fornecedor":"DOW","data_envio":"2026-07-14"},{"data_entrada":"2026-04-15","nf":"210537","produto":"PS-2001","lote":"A026Q4A004","codigo_container":"11150426","peso_kg":1000,"valor_por_container":8098.53,"valor_por_kg":8.09853,"fornecedor":"DOW","data_envio":"2026-07-14"},{"data_entrada":"2026-04-15","nf":"210537","produto":"PS-2001","lote":"A026Q4A004","codigo_container":"13150426","peso_kg":1000,"valor_por_container":8098.53,"valor_por_kg":8.09853,"fornecedor":"DOW","data_envio":"2026-07-14"},{"data_entrada":"2026-04-15","nf":"210537","produto":"PS-2001","lote":"A026Q4A004","codigo_container":"22150426","peso_kg":1000,"valor_por_container":8098.53,"valor_por_kg":8.09853,"fornecedor":"DOW","data_envio":"2026-07-14"},{"data_entrada":"2026-04-01","nf":"210312","produto":"PS-2001","lote":"A026Q3L011","codigo_container":"23010426","peso_kg":1000,"valor_por_container":7809.15,"valor_por_kg":7.80915,"fornecedor":"DOW","data_envio":"2026-06-25"},{"data_entrada":"2026-04-01","nf":"210312","produto":"PS-2001","lote":"A026Q3L011","codigo_container":"20010426","peso_kg":1000,"valor_por_container":7809.15,"valor_por_kg":7.80915,"fornecedor":"DOW","data_envio":"2026-06-25"},{"data_entrada":"2026-04-01","nf":"210312","produto":"PS-2001","lote":"A026Q3L011","codigo_container":"01010426","peso_kg":1000,"valor_por_container":7809.15,"valor_por_kg":7.80915,"fornecedor":"DOW","data_envio":"2026-06-25"},{"data_entrada":"2026-03-31","nf":"210296","produto":"PS-2001","lote":"A026Q3L011","codigo_container":"01310326","peso_kg":1000,"valor_por_container":7812.58,"valor_por_kg":7.81258,"fornecedor":"DOW","data_envio":"2026-06-02"},{"data_entrada":"2026-03-31","nf":"210296","produto":"PS-2001","lote":"A026Q3L011","codigo_container":"13310326","peso_kg":1000,"valor_por_container":7812.58,"valor_por_kg":7.81258,"fornecedor":"DOW","data_envio":"2026-06-02"},{"data_entrada":"2026-03-31","nf":"210296","produto":"PS-2001","lote":"A026Q3L011","codigo_container":"12310326","peso_kg":1000,"valor_por_container":7812.58,"valor_por_kg":7.81258,"fornecedor":"DOW","data_envio":"2026-06-02"}]'::jsonb)
as x(data_entrada date,nf text,produto text,lote text,codigo_container text,
     peso_kg numeric,valor_por_container numeric,valor_por_kg numeric,
     fornecedor text,data_envio date);

create temporary table tmp_entradas_ba on commit drop as
select distinct data_entrada,nf,produto,lote,peso_kg,valor_por_container,fornecedor,count(*)::integer quantidade
from tmp_envios_ba
group by data_entrada,nf,produto,lote,peso_kg,valor_por_container,fornecedor;

insert into cobrideira.estoque_cola_entradas
 (data_chegada,nf,produto,lote,quantidade_containers,peso_por_container_kg,
  valor_por_container,fornecedor,observacoes,localizacao)
select g.data_entrada,g.nf,g.produto,g.lote,g.quantidade,g.peso_kg,
       coalesce(g.valor_por_container,0),g.fornecedor,
       'Entrada histórica importada da relação de envios para Bahia fornecida pelo usuário.',
       'ESTOQUE'
from tmp_entradas_ba g
where not exists(select 1 from cobrideira.estoque_cola_entradas e where e.data_chegada=g.data_entrada and e.nf=g.nf and e.lote=g.lote);

create temporary table tmp_mapa_entradas_ba on commit drop as
select e.id entrada_id,e.data_chegada,e.nf,e.lote
from cobrideira.estoque_cola_entradas e
join tmp_entradas_ba g on e.data_chegada=g.data_entrada and e.nf=g.nf and e.lote=g.lote;

insert into cobrideira.estoque_cola_containers
 (codigo,status,entrada_id,enviado_em,localizacao)
select t.codigo_container,'ENVIADO_BAHIA',m.entrada_id,
       ((t.data_envio::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo'),
       'ESTOQUE'
from tmp_envios_ba t
join tmp_mapa_entradas_ba m on m.data_chegada=t.data_entrada and m.nf=t.nf and m.lote=t.lote
on conflict (codigo) do update
set status='ENVIADO_BAHIA',entrada_id=excluded.entrada_id,enviado_em=excluded.enviado_em;

-- A quantidade recebida é reconciliada com os containers efetivamente vinculados, evitando duplicar em reexecuções.
update cobrideira.estoque_cola_entradas e
set quantidade_containers = (
  select count(*)::integer from cobrideira.estoque_cola_containers c where c.entrada_id=e.id
)
where exists(select 1 from tmp_mapa_entradas_ba m where m.entrada_id=e.id);

insert into cobrideira.historico_envios_bahia
 (entrada_id,data_entrada,nf,produto,lote,codigo_container,peso_kg,
  valor_por_container,valor_por_kg,fornecedor,data_envio,mes,status,origem)
select m.entrada_id,t.data_entrada,t.nf,t.produto,t.lote,t.codigo_container,t.peso_kg,
       t.valor_por_container,t.valor_por_kg,t.fornecedor,t.data_envio,
       case extract(month from t.data_envio)::integer
        when 1 then 'Janeiro' when 2 then 'Fevereiro' when 3 then 'Março'
        when 4 then 'Abril' when 5 then 'Maio' when 6 then 'Junho'
        when 7 then 'Julho' when 8 then 'Agosto' when 9 then 'Setembro'
        when 10 then 'Outubro' when 11 then 'Novembro' when 12 then 'Dezembro' end,
       'ENVIADO PARA BAHIA','HISTORICO_IMPORTADO'
from tmp_envios_ba t
join tmp_mapa_entradas_ba m on m.data_chegada=t.data_entrada and m.nf=t.nf and m.lote=t.lote
on conflict (codigo_container) do nothing;

insert into cobrideira.movimentacoes_cola
 (tipo,codigo_container,entrada_id,quantidade_containers,cola_liquida_kg,ocorrido_em,observacoes)
select 'RETIRADA_BAHIA',t.codigo_container,m.entrada_id,1,0,
       ((t.data_envio::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo'),
       'Envio histórico para Bahia importado da relação fornecida pelo usuário.'
from tmp_envios_ba t
join tmp_mapa_entradas_ba m on m.data_chegada=t.data_entrada and m.nf=t.nf and m.lote=t.lote
where not exists(select 1 from cobrideira.movimentacoes_cola mv where mv.tipo='RETIRADA_BAHIA' and mv.codigo_container=t.codigo_container);

insert into cobrideira.historico_envios_bahia
 (entrada_id,data_entrada,nf,produto,lote,codigo_container,peso_kg,
  valor_por_container,valor_por_kg,fornecedor,data_envio,mes,status,origem)
select e.id,e.data_chegada,e.nf,e.produto,e.lote,c.codigo,e.peso_por_container_kg,
       e.valor_por_container,coalesce(e.valor_por_kg,0),e.fornecedor,
       (c.enviado_em at time zone 'America/Sao_Paulo')::date,
       'Novembro','ENVIADO PARA BAHIA','MOVIMENTACAO_EXISTENTE'
from cobrideira.estoque_cola_containers c
join cobrideira.estoque_cola_entradas e on e.id=c.entrada_id
where c.status='ENVIADO_BAHIA' and c.codigo='20231126'
on conflict (codigo_container) do nothing;

notify pgrst, 'reload schema';
