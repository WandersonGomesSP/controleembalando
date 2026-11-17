-- Complementa o cadastro de bobinas do Estoque Atual.
-- O cliente identifica pedidos personalizados sem misturar clientes diferentes.
alter table estoque_atual.bobinas_estoque
  add column if not exists cliente text;

-- Impede duplicidade do mesmo código dentro da mesma categoria.
create unique index if not exists bobinas_estoque_categoria_codigo_uidx
  on estoque_atual.bobinas_estoque (categoria, codigo)
  where codigo is not null and btrim(codigo) <> '';

-- O histórico de bobinas utilizadas usa o código como identificador.
create unique index if not exists bobinas_utilizadas_codigo_uidx
  on estoque_atual.bobinas_utilizadas (codigo)
  where codigo is not null and btrim(codigo) <> '';
