# Sistema Controle Embalando SP
Testando a atualização automática via Git.

## Supabase

1. Instale as dependências com `pnpm install`.
2. Use `.env.example` como modelo local para `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
3. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nas variáveis privadas de runtime/functions do Netlify. Nunca use prefixo `VITE_` na service-role key.
4. Para um banco novo, execute `supabase/schema.sql`. Para um banco existente, execute no SQL Editor as migrações em ordem: `supabase/migrations/202610160001_stock_operations_and_integrity.sql` e depois `supabase/migrations/202610160002_tubete_losses_and_audit_corrections.sql`; não reexecute o arquivo inteiro em um banco que já contém dados.
   O histórico começa a registrar operações após a primeira migração; eventos anteriores sem auditoria não podem ser reconstruídos com horário e operador confiáveis. A segunda migração troca a perda dos lotes de tubetes para kg, zera as perdas antigas registradas em unidades e remove as colunas antigas de perda e gramatura.
5. Crie/confirme a conta `pcp.sp@embalando.com.br` em **Authentication > Users**. Ela é a única identidade Dev inicial.
6. Mantenha o cadastro público desabilitado. O Dev cria usuários Admin e Operadores dentro do site.

As tabelas são iniciadas vazias. Os dados de `src/lib/fixtures.ts` não são importados automaticamente.
Administradores acessam todas as áreas de operação; operadores ficam limitados à área atribuída. O modo Dev e suas alterações são validados no servidor e protegidos por RLS.
Na entrada de rolos de rótulo/capa, o sistema baixa automaticamente um PDF com uma etiqueta por rolo em papel Carta, respeitando margens de 0,5 cm. A subguia de indicadores do Resumo também contém a planilha mensal/anual; as correções feitas por administradores são gravadas no banco e auditadas no histórico.
