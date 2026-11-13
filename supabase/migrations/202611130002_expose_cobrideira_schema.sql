-- Expose the Cobrideira schema through the Supabase REST API (PostgREST).
-- Keep the standard Supabase schemas available as well.
alter role authenticator
  set pgrst.db_schemas = 'public, storage, graphql_public, cobrideira';

grant usage on schema cobrideira to authenticated;
grant select, insert on table cobrideira.bobinas to authenticated;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
