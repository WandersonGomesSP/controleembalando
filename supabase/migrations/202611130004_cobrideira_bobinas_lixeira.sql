create table if not exists cobrideira.bobinas_lixeira (
  numero_bobina text primary key,
  dados jsonb not null,
  excluida_em timestamptz not null default now(),
  excluida_por uuid references auth.users(id),
  constraint bobinas_lixeira_dados_numero_check
    check (dados->>'numero_bobina' = numero_bobina)
);

create index if not exists cobrideira_bobinas_lixeira_excluida_em_idx
  on cobrideira.bobinas_lixeira (excluida_em desc);

alter table cobrideira.bobinas_lixeira enable row level security;
grant usage on schema cobrideira to service_role;
grant select, insert, update, delete on table cobrideira.bobinas to service_role;
grant select, insert, update, delete on table cobrideira.bobinas_lixeira to service_role;
