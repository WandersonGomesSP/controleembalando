-- Registra o estado atual das conferências que já existiam antes da criação do histórico.
insert into estoque_atual.bopp_baixa_conferencias_historico
  (codigo,status,quantidade_bobinas,peso_estoque_kg,peso_produzido_kg,diferenca_percentual,mensagem,baixada_em)
select c.codigo,c.status,c.quantidade_bobinas,c.peso_estoque_kg,c.peso_produzido_kg,c.diferenca_percentual,c.mensagem,c.baixada_em
from estoque_atual.bopp_baixa_conferencias c
where not exists (
  select 1 from estoque_atual.bopp_baixa_conferencias_historico h
  where h.codigo=c.codigo and h.status=c.status
);