-- Caixa de entrada do Coletor Android. As fotos são analisadas no próprio aparelho;
-- somente os códigos reconhecidos e os metadados operacionais são enviados ao ERP.
create table if not exists public.coletor_leituras (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  codigo text not null check (length(trim(codigo)) between 1 and 160),
  destino text not null check (destino in ('COBRIDEIRA_PRODUCAO','BOPP_ENTRADA')),
  tipo_leitura text not null default 'MANUAL',
  origem text not null check (origem in ('CAMERA','FOTO','MANUAL')),
  metadados jsonb not null default '{}'::jsonb,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','PROCESSADO','IGNORADO')),
  created_at timestamptz not null default now(),
  sincronizado_em timestamptz,
  processado_em timestamptz,
  processado_por uuid references auth.users(id) on delete set null,
  observacao text
);

create index if not exists coletor_leituras_usuario_status_data_idx
  on public.coletor_leituras(user_id,status,created_at desc);
create index if not exists coletor_leituras_codigo_idx
  on public.coletor_leituras(codigo);
create index if not exists coletor_leituras_destino_status_idx
  on public.coletor_leituras(destino,status,created_at desc);

alter table public.coletor_leituras enable row level security;

drop policy if exists "coletor_leituras_select_own" on public.coletor_leituras;
create policy "coletor_leituras_select_own"
  on public.coletor_leituras for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "coletor_leituras_insert_own" on public.coletor_leituras;
create policy "coletor_leituras_insert_own"
  on public.coletor_leituras for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "coletor_leituras_update_own" on public.coletor_leituras;
create policy "coletor_leituras_update_own"
  on public.coletor_leituras for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "coletor_leituras_delete_own" on public.coletor_leituras;
create policy "coletor_leituras_delete_own"
  on public.coletor_leituras for delete to authenticated
  using (user_id = (select auth.uid()));

grant select,insert,update,delete on public.coletor_leituras to authenticated;
