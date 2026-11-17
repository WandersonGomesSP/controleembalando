-- Disponibiliza o schema estoque_atual ao PostgREST sem conceder acesso aos usuários finais.
-- As operações continuam sendo feitas pelo backend autenticado com a service_role.
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage, graphql_public, estoque_atual';

GRANT USAGE ON SCHEMA estoque_atual TO service_role;
REVOKE ALL ON SCHEMA estoque_atual FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA estoque_atual TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA estoque_atual TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA estoque_atual
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA estoque_atual
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

ALTER TABLE estoque_atual.bobinas_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_atual.bobinas_estoque_lixeira ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_atual.bobinas_utilizadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_atual.log_baixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_atual.resumo_estoque_produtos ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload config';
