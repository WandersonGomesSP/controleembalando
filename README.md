# Sistema Controle Embalando SP
Testando a atualização automática via Git.

## Supabase

1. Instale as dependências com `pnpm install`.
2. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env` local e nas variáveis de ambiente do deploy.
3. Execute `supabase/schema.sql` no SQL Editor do projeto Supabase.
4. Crie as contas em **Authentication > Users** e habilite o provedor de e-mail/senha.
5. Mantenha o cadastro público desabilitado. O banco permite leitura e gravação somente para sessões autenticadas.

As tabelas são iniciadas vazias. Os dados de `src/lib/fixtures.ts` não são importados automaticamente.
