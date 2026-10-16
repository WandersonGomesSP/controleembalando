# Sistema Controle Embalando SP
Testando a atualização automática via Git.

## Supabase

1. Instale as dependências com `pnpm install`.
2. Use `.env.example` como modelo local para `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
3. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nas variáveis privadas de runtime/functions do Netlify. Nunca use prefixo `VITE_` na service-role key.
4. Para um banco novo, execute `supabase/schema.sql`. Para atualizar um banco existente, execute no SQL Editor a migração `supabase/migrations/202610160001_stock_operations_and_integrity.sql`; não reexecute o arquivo inteiro em um banco que já contém dados.
   O histórico começa a registrar operações após a migração; eventos anteriores sem auditoria não podem ser reconstruídos com horário e operador confiáveis.
5. Crie/confirme a conta `pcp.sp@embalando.com.br` em **Authentication > Users**. Ela é a única identidade Dev inicial.
6. Mantenha o cadastro público desabilitado. O Dev cria usuários Admin e Operadores dentro do site.

As tabelas são iniciadas vazias. Os dados de `src/lib/fixtures.ts` não são importados automaticamente.
Administradores acessam todas as áreas de operação; operadores ficam limitados à área atribuída. O modo Dev e suas alterações são validados no servidor e protegidos por RLS.
