create schema if not exists estoque_atual;

create table if not exists estoque_atual.bobinas_estoque (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('BOPP','CREPE','KRAFT','DUPLA FACE')),
  data_entrada date,
  fornecedor text,
  medida numeric(12,2),
  peso_kg numeric(12,3),
  metragem_m numeric(14,2),
  codigo text,
  cor text,
  linha text,
  origem_arquivo text not null,
  importado_em timestamptz not null default now(),
  observacoes text
);

create index if not exists bobinas_estoque_categoria_idx on estoque_atual.bobinas_estoque(categoria);
create index if not exists bobinas_estoque_codigo_idx on estoque_atual.bobinas_estoque(codigo);

create table if not exists estoque_atual.bobinas_utilizadas (
  id uuid primary key default gen_random_uuid(),
  data_utilizacao date,
  fornecedor text,
  medida numeric(12,2),
  peso_kg numeric(12,3),
  metragem_m numeric(14,2),
  codigo text,
  cor text,
  linha text,
  campo_adicional text,
  origem_arquivo text not null default 'BOBINAS UTILIZADAS.csv',
  importado_em timestamptz not null default now()
);

create index if not exists bobinas_utilizadas_codigo_idx on estoque_atual.bobinas_utilizadas(codigo);
create index if not exists bobinas_utilizadas_data_idx on estoque_atual.bobinas_utilizadas(data_utilizacao);

create table if not exists estoque_atual.log_baixas (
  id uuid primary key default gen_random_uuid(),
  data_baixa timestamptz,
  numero_bobina text,
  material text,
  produtor_bobina text,
  largura numeric(12,2),
  micragem numeric(8,2),
  usuario text,
  status text,
  origem_arquivo text not null default 'LOG BAIXAS.csv',
  importado_em timestamptz not null default now()
);

create index if not exists log_baixas_numero_idx on estoque_atual.log_baixas(numero_bobina);
create index if not exists log_baixas_data_idx on estoque_atual.log_baixas(data_baixa);

create table if not exists estoque_atual.resumo_estoque_produtos (
  id uuid primary key default gen_random_uuid(),
  medida_produto text not null,
  peso_estoque_kg numeric(14,3) not null default 0,
  metragem_disponivel_m numeric(16,2) not null default 0,
  consumo_movel_semanal_m numeric(16,2),
  estoque_projetado_m numeric(16,2),
  folga_ic numeric(12,4),
  estoque_minimo_semanal_m numeric(16,2),
  quantidade_jumbos integer,
  estoque_minimo_jumbos integer,
  status_origem text,
  folga_estoque text,
  origem_arquivo text not null default 'ESTOQUE REAL.csv',
  data_referencia date,
  importado_em timestamptz not null default now(),
  unique (medida_produto, data_referencia)
);

create index if not exists resumo_estoque_medida_idx on estoque_atual.resumo_estoque_produtos(medida_produto);
