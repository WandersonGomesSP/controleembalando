create table if not exists estoque_atual.bobinas_estoque_lixeira (
  id uuid primary key default gen_random_uuid(),
  bobina_id uuid not null,
  categoria text not null,
  codigo text,
  dados jsonb not null,
  excluida_por uuid,
  excluida_em timestamptz not null default now()
);

create unique index if not exists bobinas_estoque_lixeira_categoria_codigo_uidx
  on estoque_atual.bobinas_estoque_lixeira (categoria, codigo);
