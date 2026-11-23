-- Preserva as colunas originais do CSV PCP - CONTROLE FILME no estoque virgem
-- e mantém os mesmos campos disponíveis no estoque adesivado.
alter table estoque_atual.bobinas_estoque_virgem
  add column if not exists nf text,
  add column if not exists aba text,
  add column if not exists medida_texto text;

alter table estoque_atual.bobinas_estoque
  add column if not exists nf text,
  add column if not exists aba text,
  add column if not exists medida_texto text;

notify pgrst, 'reload schema';
