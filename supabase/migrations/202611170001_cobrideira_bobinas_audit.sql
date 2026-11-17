alter table cobrideira.bobinas
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id);

update cobrideira.bobinas
set updated_at = created_at
where updated_at is null;

-- numero_bobina já é a chave primária e possui unicidade garantida.
