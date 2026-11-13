-- Separa a micragem que antes ficava embutida na parte decimal da largura.
-- Exemplo: 980.20 passa a ser largura=980 e micragem=20.
alter table cobrideira.bobinas
  add column if not exists micragem integer;

update cobrideira.bobinas
set micragem = round((largura - trunc(largura)) * 100)::integer,
    largura = trunc(largura)
where micragem is null;

alter table cobrideira.bobinas
  alter column micragem set default 20;

alter table cobrideira.bobinas
  alter column micragem set not null;
