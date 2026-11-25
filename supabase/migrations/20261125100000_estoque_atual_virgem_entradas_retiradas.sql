alter table estoque_atual.bobinas_estoque_virgem
  add column if not exists entrada_id uuid;

create table if not exists estoque_atual.entradas_bopp_virgem (
  id uuid primary key default gen_random_uuid(),
  fornecedor text not null,
  medida_texto text not null,
  empresa text,
  nf text,
  data_emissao date,
  data_entrada date not null,
  peso_total_kg numeric(14,3) not null check (peso_total_kg > 0),
  quantidade_bobinas integer not null check (quantidade_bobinas > 0),
  created_at timestamptz not null default now()
);

alter table estoque_atual.bobinas_estoque_virgem
  add constraint bobinas_estoque_virgem_entrada_id_fkey
  foreign key (entrada_id) references estoque_atual.entradas_bopp_virgem(id)
  on delete set null;

create table if not exists estoque_atual.entradas_bopp_virgem_itens (
  id uuid primary key default gen_random_uuid(),
  entrada_id uuid not null references estoque_atual.entradas_bopp_virgem(id) on delete cascade,
  bobina_id uuid references estoque_atual.bobinas_estoque_virgem(id) on delete set null,
  codigo text not null,
  peso_rateado_kg numeric(14,3),
  created_at timestamptz not null default now(),
  unique (entrada_id, codigo)
);

create table if not exists estoque_atual.retiradas_bopp_virgem (
  id uuid primary key default gen_random_uuid(),
  data_envio date not null default current_date,
  destino text not null default 'BAHIA',
  quantidade_bobinas integer not null check (quantidade_bobinas > 0),
  peso_total_kg numeric(14,3) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists estoque_atual.retiradas_bopp_virgem_itens (
  id uuid primary key default gen_random_uuid(),
  retirada_id uuid not null references estoque_atual.retiradas_bopp_virgem(id) on delete cascade,
  codigo text not null,
  dados_bobina jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists entradas_bopp_virgem_data_idx on estoque_atual.entradas_bopp_virgem(data_entrada desc);
create index if not exists bobinas_estoque_virgem_entrada_idx on estoque_atual.bobinas_estoque_virgem(entrada_id);
create index if not exists entradas_bopp_virgem_itens_entrada_idx on estoque_atual.entradas_bopp_virgem_itens(entrada_id);
create index if not exists retiradas_bopp_virgem_data_idx on estoque_atual.retiradas_bopp_virgem(data_envio desc);
create index if not exists retiradas_bopp_virgem_itens_retirada_idx on estoque_atual.retiradas_bopp_virgem_itens(retirada_id);

alter table estoque_atual.entradas_bopp_virgem enable row level security;
alter table estoque_atual.entradas_bopp_virgem_itens enable row level security;
alter table estoque_atual.retiradas_bopp_virgem enable row level security;
alter table estoque_atual.retiradas_bopp_virgem_itens enable row level security;

drop policy if exists "authenticated manage itens entradas bopp virgem" on estoque_atual.entradas_bopp_virgem_itens;
create policy "authenticated manage itens entradas bopp virgem" on estoque_atual.entradas_bopp_virgem_itens
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated manage entradas bopp virgem" on estoque_atual.entradas_bopp_virgem;
create policy "authenticated manage entradas bopp virgem" on estoque_atual.entradas_bopp_virgem
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated manage retiradas bopp virgem" on estoque_atual.retiradas_bopp_virgem;
create policy "authenticated manage retiradas bopp virgem" on estoque_atual.retiradas_bopp_virgem
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated manage itens retiradas bopp virgem" on estoque_atual.retiradas_bopp_virgem_itens;
create policy "authenticated manage itens retiradas bopp virgem" on estoque_atual.retiradas_bopp_virgem_itens
for all to authenticated using (true) with check (true);

grant usage on schema estoque_atual to authenticated;
grant select, insert, update, delete on estoque_atual.entradas_bopp_virgem to authenticated;
grant select, insert, update, delete on estoque_atual.entradas_bopp_virgem_itens to authenticated;
grant select, insert, update, delete on estoque_atual.retiradas_bopp_virgem to authenticated;
grant select, insert, update, delete on estoque_atual.retiradas_bopp_virgem_itens to authenticated;
