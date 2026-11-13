# Roteiro — Controle Embalando

Painel administrativo de controle de produção e estoque dos setores da fábrica.

## Marco 1 — Superfície do produto ✅

Painel em tema claro com fundo azul. A seleção de áreas inclui Tubeteira e Cobrideira disponíveis e áreas futuras sinalizadas como “Em breve” (Rebobinadeira, Estufa, Cartonagem, Flexografia, Fracionadeira e Cortadeira de Papel). A Cobrideira permite cadastrar e consultar bobinas.

## Marco 2 — Persistência Cobrideira

- Supabase com schema separado `cobrideira` no projeto existente, autenticação compartilhada e RLS por área.
- `cobrideira.bobinas` recebe os campos do formulário original; peso líquido é calculado no banco.
- Expor o schema `cobrideira` nas configurações da API do Supabase após executar a migração.
- A baixa solicitada e as integrações com planilhas/etiquetas ainda não executam ações externas.
- O schema público da Tubeteira continua usando as tabelas e migrações atuais.

## Próximos marcos

- Integrar o cadastro Cobrideira às planilhas Google, etiquetas e movimentos de cola/pigmento, com estados independentes e prevenção de duplicidade.
- Confirmar com a operação as regras de identificador único, destino de período, baixa de bobina anterior e políticas de alteração manual das planilhas.

## Referência do sistema Tubeteira — Banco de dados

- O banco Supabase existente mantém suas tabelas operacionais e migrações atuais.

## Referência do sistema Tubeteira — Server functions e troca do store

- Server functions TanStack Start para cada ação do `StoreProvider` (adicionar rolos, dar baixa, ajustar peso, registrar produção, entrada de tubetes).
- Geração de IDs sequenciais no banco (transacional) para evitar IDs duplicados com vários operadores.
- Resumo calculado por consultas agregadas; loaders substituem os fixtures.

## Marco 4 — Acesso e auditoria

- Login de operadores com Netlify Identity; papéis (operador / supervisor).
- Operador preenchido automaticamente a partir do usuário logado.
- Log de auditoria para ajustes de peso e baixas.

## Marco 5 — Cadastros e relatórios

- Telas para editar medidas, mínimos, destinos, espessuras, capas e tabela de tubetes por caixa.
- Histórico filtrável de produção e entradas, exportação CSV, alertas de estoque abaixo do mínimo e de validade próxima.
