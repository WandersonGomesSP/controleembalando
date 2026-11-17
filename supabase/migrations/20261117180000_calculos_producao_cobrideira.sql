-- Peso do cilindro conforme a largura real da bobina.
create or replace function cobrideira.definir_peso_cilindro_por_largura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.peso_cilindro := case
    when new.largura = 980 then 3.0
    when new.largura = 1020 then 3.5
    when new.largura = 1200 then 4.8
    when new.largura in (1265, 1270) then 5.0
    else new.peso_cilindro
  end;
  return new;
end;
$$;

drop trigger if exists trg_definir_peso_cilindro_por_largura on cobrideira.bobinas;
create trigger trg_definir_peso_cilindro_por_largura
before insert or update of largura, peso_cilindro
on cobrideira.bobinas
for each row
execute function cobrideira.definir_peso_cilindro_por_largura();

-- Corrige a tara histórica de todos os registros já cadastrados.
update cobrideira.bobinas
set peso_cilindro = case
  when largura = 980 then 3.0
  when largura = 1020 then 3.5
  when largura = 1200 then 4.8
  when largura in (1265, 1270) then 5.0
  else peso_cilindro
end
where largura in (980, 1020, 1200, 1265, 1270)
  and peso_cilindro is distinct from case
    when largura = 980 then 3.0
    when largura = 1020 then 3.5
    when largura = 1200 then 4.8
    when largura in (1265, 1270) then 5.0
    else peso_cilindro
  end;

-- Colunas calculadas no banco: recalculam registros antigos e novas bobinas.
alter table cobrideira.bobinas
  add column if not exists peso_filme_bopp_kg numeric
  generated always as (
    case
      when largura > 0 and metragem > 0 and micragem > 0
      then (largura / 1000.0) * metragem * micragem * 0.000905
      else null
    end
  ) stored,
  add column if not exists peso_cola_seca_kg numeric
  generated always as (
    case
      when largura > 0 and metragem > 0 and micragem > 0
      then (peso_final - peso_cilindro) - ((largura / 1000.0) * metragem * micragem * 0.000905)
      else null
    end
  ) stored,
  add column if not exists consumo_cola_liquida_kg numeric
  generated always as (
    case
      when largura > 0 and metragem > 0 and micragem > 0
      then ((peso_final - peso_cilindro) - ((largura / 1000.0) * metragem * micragem * 0.000905)) / 0.54
      else null
    end
  ) stored,
  add column if not exists gramatura_seca_g_m2 numeric
  generated always as (
    case
      when largura > 0 and metragem > 0 and micragem > 0
      then (
        ((peso_final - peso_cilindro) - ((largura / 1000.0) * metragem * micragem * 0.000905)) * 1000.0
      ) / ((largura / 1000.0) * metragem)
      else null
    end
  ) stored;
