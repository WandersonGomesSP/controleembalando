-- Separa o estoque BOPP virgem do estoque adesivado e cria lixeira restaurável para a Rebobinadeira.
create table if not exists estoque_atual.bobinas_estoque_virgem
  (like estoque_atual.bobinas_estoque including all);
create table if not exists estoque_atual.bobinas_estoque_virgem_lixeira
  (like estoque_atual.bobinas_estoque_lixeira including all);

alter table estoque_atual.bobinas_estoque_virgem enable row level security;
alter table estoque_atual.bobinas_estoque_virgem_lixeira enable row level security;

grant select, insert, update, delete
  on estoque_atual.bobinas_estoque_virgem,
     estoque_atual.bobinas_estoque_virgem_lixeira
  to anon, authenticated, service_role;

create unique index if not exists bobinas_estoque_virgem_categoria_codigo_uidx
  on estoque_atual.bobinas_estoque_virgem (categoria, codigo);
create unique index if not exists bobinas_estoque_virgem_lixeira_categoria_codigo_uidx
  on estoque_atual.bobinas_estoque_virgem_lixeira (categoria, codigo);

comment on table estoque_atual.bobinas_estoque_virgem is
  'Estoque de bobinas BOPP virgem da Cobrideira. Separado do estoque adesivado.';
comment on table estoque_atual.bobinas_estoque_virgem_lixeira is
  'Lixeira do estoque de bobinas BOPP virgem da Cobrideira.';

create table if not exists rebobinadeira.lancamentos_lixeira (
  id uuid primary key default gen_random_uuid(),
  producao_id bigint not null unique,
  numero_bobina text not null,
  dados jsonb not null,
  excluida_por uuid,
  excluida_em timestamptz not null default now(),
  movimentos jsonb not null default '[]'::jsonb
);
alter table rebobinadeira.lancamentos_lixeira
  add column if not exists movimentos jsonb not null default '[]'::jsonb;
alter table rebobinadeira.lancamentos_lixeira enable row level security;
revoke all on rebobinadeira.lancamentos_lixeira from anon, authenticated;
grant select, insert, update, delete on rebobinadeira.lancamentos_lixeira to service_role;

-- Migra para a lixeira o registro que já havia sido marcado como excluído pela versão anterior.
insert into rebobinadeira.lancamentos_lixeira (producao_id, numero_bobina, dados, excluida_em)
select b.id, b.numero_bobina,
       jsonb_set(to_jsonb(b), '{status_baixa}',
         to_jsonb(case
           when exists (select 1 from rebobinadeira.movimentacoes_bobinas m where m.producao_id=b.id and m.tipo_movimento='DEVOLUCAO') then 'DEVOLVIDA_PARCIAL'
           when exists (select 1 from rebobinadeira.movimentacoes_bobinas m where m.producao_id=b.id and m.tipo_movimento='CONSUMO') then 'EM_USO'
           when exists (select 1 from rebobinadeira.movimentacoes_bobinas m where m.numero_normalizado=b.numero_normalizado and m.tipo_movimento='ENTRADA') then 'CADASTRADA'
           else 'PENDENTE' end)),
       b.criado_em
from rebobinadeira.bobinas b
where b.status_baixa='EXCLUIDA'
on conflict (producao_id) do nothing;
