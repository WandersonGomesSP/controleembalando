create schema if not exists estoque_atual;

create table if not exists estoque_atual.bobinas_estoque (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  data_entrada date,
  fornecedor text,
  medida numeric,
  peso_kg numeric,
  metragem_m numeric,
  codigo text,
  cor text,
  linha text,
  origem_arquivo text not null,
  importado_em timestamptz not null default now(),
  observacoes text,
  cliente text
);

create table if not exists estoque_atual.bobinas_utilizadas (
  id uuid primary key default gen_random_uuid(),
  data_utilizacao date,
  fornecedor text,
  medida numeric,
  peso_kg numeric,
  metragem_m numeric,
  codigo text,
  cor text,
  linha text,
  campo_adicional text,
  origem_arquivo text not null default 'BOBINAS UTILIZADAS.csv',
  importado_em timestamptz not null default now()
);

create table if not exists estoque_atual.log_baixas (
  id uuid primary key default gen_random_uuid(),
  data_baixa timestamptz,
  numero_bobina text,
  material text,
  produtor_bobina text,
  largura numeric,
  micragem numeric,
  usuario text,
  status text,
  origem_arquivo text not null default 'LOG BAIXAS.csv',
  importado_em timestamptz not null default now()
);

create table if not exists estoque_atual.resumo_estoque_produtos (
  id uuid primary key default gen_random_uuid(),
  medida_produto text not null,
  peso_estoque_kg numeric not null default 0,
  metragem_disponivel_m numeric not null default 0,
  consumo_movel_semanal_m numeric,
  estoque_projetado_m numeric,
  folga_ic numeric,
  estoque_minimo_semanal_m numeric,
  quantidade_jumbos integer,
  estoque_minimo_jumbos integer,
  status_origem text,
  folga_estoque text,
  origem_arquivo text not null default 'ESTOQUE REAL.csv',
  data_referencia date,
  importado_em timestamptz not null default now(),
  categoria text not null default 'BOPP'
);

create table if not exists estoque_atual.bobinas_estoque_lixeira (
  id uuid primary key default gen_random_uuid(),
  bobina_id uuid not null,
  categoria text not null,
  codigo text,
  dados jsonb not null,
  excluida_por uuid,
  excluida_em timestamptz not null default now()
);

alter table estoque_atual.bobinas_estoque
  add column if not exists cliente text;

create unique index if not exists bobinas_estoque_categoria_codigo_uidx
  on estoque_atual.bobinas_estoque (categoria, codigo)
  where codigo is not null and btrim(codigo) <> '';

create unique index if not exists bobinas_utilizadas_codigo_uidx
  on estoque_atual.bobinas_utilizadas (codigo)
  where codigo is not null and btrim(codigo) <> '';

create unique index if not exists bobinas_estoque_lixeira_categoria_codigo_uidx
  on estoque_atual.bobinas_estoque_lixeira (categoria, codigo);
