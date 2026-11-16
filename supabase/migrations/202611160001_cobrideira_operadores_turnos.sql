create table if not exists cobrideira.operadores (
  nome text primary key check (length(btrim(nome)) between 1 and 120),
  turno text not null check (turno in ('1º TURNO', '2º TURNO'))
);

insert into cobrideira.operadores (nome, turno)
values ('JOSÉ', '1º TURNO')
on conflict (nome) do nothing;

create or replace function public.is_developer_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.developer_accounts d
    where d.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

grant usage on schema cobrideira to authenticated;
grant select, insert, update, delete on cobrideira.operadores to authenticated;
alter table cobrideira.operadores enable row level security;

drop policy if exists "developers manage cobrideira operators" on cobrideira.operadores;
create policy "developers manage cobrideira operators"
on cobrideira.operadores for all to authenticated
using (public.is_developer_user())
with check (public.is_developer_user());
