# Sistema Controle Embalando SP
Testando a atualização automática via Git.

## Supabase

1. Instale as dependências com `pnpm install`.
2. Use `.env.example` como modelo local para `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
3. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nas variáveis privadas de runtime/functions do Netlify. Nunca use prefixo `VITE_` na service-role key.
4. Para um banco novo, execute `supabase/schema.sql`. Para um banco existente, execute no SQL Editor as migrações em ordem: `supabase/migrations/202610160001_stock_operations_and_integrity.sql`, `supabase/migrations/202610160002_tubete_losses_and_audit_corrections.sql`, `supabase/migrations/202610160003_admin_summary_deletion.sql`, `supabase/migrations/202610160004_production_configuration.sql`, `supabase/migrations/202610160005_production_consumes_insumos.sql`, `supabase/migrations/202610160006_insumo_weight_correction_labels.sql` e `supabase/migrations/202610160007_reuse_released_insumo_codes.sql`; não reexecute o arquivo inteiro em um banco que já contém dados.
   O histórico começa a registrar operações após a primeira migração; eventos anteriores sem auditoria não podem ser reconstruídos com horário e operador confiáveis. A segunda migração troca a perda dos lotes de tubetes para kg, zera as perdas antigas registradas em unidades e remove as colunas antigas de perda e gramatura.
5. Crie/confirme a conta `pcp.sp@embalando.com.br` em **Authentication > Users**. Ela é a única identidade Dev inicial.
6. Mantenha o cadastro público desabilitado. O Dev cria usuários Admin e Operadores dentro do site.

As tabelas são iniciadas vazias. Os dados de `src/lib/fixtures.ts` não são importados automaticamente.
Administradores acessam todas as áreas de operação; operadores ficam limitados à área atribuída. O modo Dev e suas alterações são validados no servidor e protegidos por RLS.
Na entrada de rolos de rótulo/capa, o sistema baixa automaticamente um PDF separado de uma página por rolo, em papel Carta e com margens de 0,5 cm; cada arquivo usa o código do rolo e a data de registro no nome. Todos os campos de texto da etiqueta têm largura mínima de 9 cm; o ID não recebe ampliação adicional para evitar cortes. Ao corrigir o peso de um rolo de rótulo/capa, o sistema grava a alteração, marca o cadastro como corrigido e gera outra etiqueta com o peso novo e a indicação **PESO ALTERADO**; o estado é permanente. Ao cadastrar produção de tubos, os códigos informados para capas e rótulos são validados, removidos do estoque e registrados no histórico na mesma transação; se a baixa falhar, a produção também não é salva. Um código não pode existir simultaneamente em mais de um item ativo de estoque. Após a baixa, ele deixa de ser considerado ocupado e pode voltar a ser sugerido, sem apagar os códigos e eventos do histórico da produção. A subguia de indicadores do Resumo também contém a planilha mensal/anual; correções e exclusões são gravadas no banco e auditadas com responsável e horário, sem exigir motivo manual.

## Sincronização com Google Sheets

A sincronização é somente do Supabase para a planilha `1m3lAn8v0BCC28x9MwvOtmHyfcOFmy1cNVIMAjMxKXHc`. A função agendada `netlify/functions/sync-google-sheets.mts` atualiza as guias Dashboard, Rótulos e Capas, Tubos, Tubetes e Histórico de segunda a sexta-feira às 06h no horário de São Paulo (09h UTC). Se as variáveis privadas necessárias ainda não estiverem configuradas, a execução automática é ignorada sem acessar a planilha. Ela substitui os valores das guias gerenciadas, mas mantém sua formatação.

1. No Google Cloud Console, crie um projeto, habilite **Google Sheets API** e crie uma conta de serviço.
2. Gere uma chave JSON para a conta de serviço. Compartilhe a planilha com o e-mail dessa conta como **Editor**.
3. Nas variáveis privadas do site no Netlify, configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Para a chave privada, cole o valor `private_key` completo; se a tela não preservar quebras de linha, use `\n` literal. Nunca publique ou envie o arquivo JSON da chave.
4. Faça o deploy. A primeira execução agendada após configurar o acesso cria as guias que faltarem. No Modo Dev, também é possível iniciar uma sincronização manual pelo botão **Sincronizar Agora**. O painel mantém um lembrete até o Dev confirmar que configurou as permissões; essa confirmação fica salva na conta e vale em outros navegadores. Monitore as execuções e os logs da função em **Netlify > Functions**.

O núcleo da sincronização não depende do agendador Netlify: ao migrar para Vercel, ele pode ser reutilizado por uma função cron/API da Vercel, mantendo as mesmas variáveis e o mesmo acesso de Editor à planilha. O agendador é a única parte específica do provedor e precisa ser configurado novamente na migração.
