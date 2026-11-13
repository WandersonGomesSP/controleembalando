-- Simplifica a identificação das bobinas da Cobrideira.
-- Preserva um único registro por IDP; em duplicidades, mantém o mais antigo.
with duplicadas as (
  select ctid,
         row_number() over (
           partition by idp
           order by created_at asc, ctid asc
         ) as ordem
  from cobrideira.bobinas
)
delete from cobrideira.bobinas b
using duplicadas d
where b.ctid = d.ctid
  and d.ordem > 1;

alter table cobrideira.bobinas
  drop constraint if exists bobinas_pkey;

alter table cobrideira.bobinas
  drop column if exists id,
  drop column if exists outra_bob,
  drop column if exists dar_baixa_bobina;

alter table cobrideira.bobinas
  rename column idp to numero_bobina;

alter table cobrideira.bobinas
  add constraint bobinas_pkey primary key (numero_bobina);

drop index if exists cobrideira_bobinas_idp_idx;
create index if not exists cobrideira_bobinas_numero_bobina_idx
  on cobrideira.bobinas (numero_bobina);
