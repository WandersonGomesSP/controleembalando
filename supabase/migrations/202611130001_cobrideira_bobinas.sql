alter table public.user_roles
  drop constraint if exists user_roles_check;

alter table public.user_roles
  drop constraint if exists user_roles_area_check;

alter table public.user_roles
  add constraint user_roles_area_check
  check (
    (role = 'ADMIN' and area is null) or
    (role = 'OPERATOR' and area in ('tubeteira', 'rebobinadeira', 'cobrideira'))
  );

create schema if not exists cobrideira;

create table if not exists cobrideira.bobinas (
  id uuid primary key default gen_random_uuid(),
  idp text not null,
  cod_bob text not null,
  outra_bob boolean not null default false,
  dar_baixa_bobina boolean not null default false,
  data date not null,
  aba text not null,
  material text not null,
  largura numeric(8, 2) not null check (largura > 0),
  peso_bruto numeric(12, 3) not null check (peso_bruto > 0),
  peso_final numeric(12, 3) not null check (peso_final > 0),
  peso_cilindro numeric(12, 3) not null check (peso_cilindro >= 0),
  peso_liquido numeric(12, 3) generated always as (peso_final - peso_cilindro) stored,
  metragem integer not null check (metragem > 0),
  perda_kg numeric(12, 3) not null default 0 check (perda_kg >= 0),
  fornecedor_filme text not null,
  vareta_g integer not null check (vareta_g in (16, 18, 20, 22, 26, 28)),
  kg_cola numeric(12, 3) not null default 0 check (kg_cola >= 0),
  lote_cola text not null default '',
  codigo_interno text not null default '',
  fornecedor_cola text not null default '',
  turno text not null check (turno in ('1º TURNO', '2º TURNO')),
  linha text not null check (linha in ('Padrão', 'Personalizada', 'Impressa Linha')),
  cor_fundo text not null,
  pigmento_kg numeric(12, 3) not null default 0 check (pigmento_kg >= 0),
  cor_mistura text not null default '',
  pigmento_mistura text not null default '',
  cliente text not null default '',
  cor_impressao text not null default '',
  emenda boolean not null default false,
  codigo_emenda text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (peso_final > peso_cilindro)
);

create index if not exists cobrideira_bobinas_created_at_idx
  on cobrideira.bobinas (created_at desc);
create index if not exists cobrideira_bobinas_idp_idx
  on cobrideira.bobinas (idp);
create index if not exists cobrideira_bobinas_cod_bob_idx
  on cobrideira.bobinas (cod_bob);

grant usage on schema cobrideira to authenticated;
grant select, insert on table cobrideira.bobinas to authenticated;
alter table cobrideira.bobinas enable row level security;

drop policy if exists "cobrideira users read bobinas" on cobrideira.bobinas;
create policy "cobrideira users read bobinas"
on cobrideira.bobinas for select to authenticated
using (public.can_access_area('cobrideira'));

drop policy if exists "cobrideira users insert bobinas" on cobrideira.bobinas;
create policy "cobrideira users insert bobinas"
on cobrideira.bobinas for insert to authenticated
with check (
  public.can_access_area('cobrideira')
  and created_by = auth.uid()
);
