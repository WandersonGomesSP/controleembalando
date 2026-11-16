# Sistema Controle Embalando SP

Testando a atualização automática via Git.

## Supabase

1. Instale as dependências com `pnpm install`.
2. Use `.env.example` como modelo local para `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
3. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nas variáveis privadas de runtime/functions do Netlify. Nunca use prefixo `VITE_` na service-role key.
4. Para um banco novo, execute `supabase/schema.sql`. Para um banco existente, execute no SQL Editor as migrações em ordem: `supabase/migrations/202610160001_stock_operations_and_integrity.sql`, `supabase/migrations/202610160002_tubete_losses_and_audit_corrections.sql`, `supabase/migrations/202610160003_admin_summary_deletion.sql`, `supabase/migrations/202610160004_production_configuration.sql`, `supabase/migrations/202610160005_production_consumes_insumos.sql`, `supabase/migrations/202610160006_insumo_weight_correction_labels.sql`, `supabase/migrations/202610160007_reuse_released_insumo_codes.sql` e `supabase/migrations/202611130001_cobrideira_bobinas.sql`; não reexecute o arquivo inteiro em um banco que já contém dados.
   O histórico começa a registrar operações após a primeira migração; eventos anteriores sem auditoria não podem ser reconstruídos com horário e operador confiáveis. A segunda migração troca a perda dos lotes de tubetes para kg, zera as perdas antigas registradas em unidades e remove as colunas antigas de perda e gramatura.
5. No Supabase, adicione `cobrideira` à lista de schemas expostos em **Settings > API > Exposed schemas**. O setor usa um schema PostgreSQL separado no mesmo projeto Supabase e compartilha o login; não é um projeto/banco Supabase independente.
6. Crie/confirme a conta `pcp.sp@embalando.com.br` em **Authentication > Users**. Ela é a única identidade Dev inicial.
7. Mantenha o cadastro público desabilitado. O Dev cria usuários Admin e Operadores dentro do site.

As tabelas são iniciadas vazias. Os dados de `src/lib/fixtures.ts` não são importados automaticamente.
Administradores acessam todas as áreas de operação; operadores ficam limitados à área atribuída. O modo Dev e suas alterações são validados no servidor e protegidos por RLS.
O setor Cobrideira grava bobinas em `cobrideira.bobinas`, isolado das tabelas operacionais da Tubeteira e protegido por RLS. Nesta primeira etapa, as opções de baixa são registradas, mas ainda não movimentam estoque nem sincronizam com planilhas ou etiquetas.
Na entrada de rolos de rótulo/capa, o sistema baixa automaticamente um PDF separado de uma página por rolo, em papel Carta e com margens de 0,5 cm; cada arquivo usa o código do rolo e a data de registro no nome. Todos os campos de texto da etiqueta têm largura mínima de 9 cm; o ID não recebe ampliação adicional para evitar cortes. Ao corrigir o peso de um rolo de rótulo/capa, o sistema grava a alteração, marca o cadastro como corrigido e gera outra etiqueta com o peso novo e a indicação **PESO ALTERADO**; o estado é permanente. Ao cadastrar produção de tubos, os códigos informados para capas e rótulos são validados, removidos do estoque e registrados no histórico na mesma transação; se a baixa falhar, a produção também não é salva. Um código não pode existir simultaneamente em mais de um item ativo de estoque. Após a baixa, ele deixa de ser considerado ocupado e pode voltar a ser sugerido, sem apagar os códigos e eventos do histórico da produção. A subguia de indicadores do Resumo também contém a planilha mensal/anual; correções e exclusões são gravadas no banco e auditadas com responsável e horário, sem exigir motivo manual.

## Planilha Google Sheets da Cobrideira

A planilha configurada no código (ID: 16PAFRIpkoPP5sU-lCOPLIOjzuK7JrHbHuU1CRIhTsig) é exclusiva do setor Cobrideira. A sincronização automática e a sincronização manual enviam somente registros de cobrideira.bobinas, organizados nas guias mensais indicadas no cadastro. Não consultam nem enviam dados da Tubeteira, estoque geral, produção de tubos, lotes de tubetes ou histórico operacional. As guias de outros setores que já existirem na planilha não são apagadas por esta rotina.

Para habilitar a sincronização, configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY nas variáveis privadas do ambiente. Compartilhe a planilha com o e-mail da conta de serviço como Editor.