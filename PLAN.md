# Roteiro — PCP · Tubos & Tubetes

Painel administrativo de controle de produção e estoque de rolos de papel, tubos e tubetes.

## Marco 1 — Superfície do produto ✅
Painel em tema escuro azulado com as seis abas navegáveis e interativas (Resumo, + Entrada, - Saída, Ajuste Peso, Cad. Produção de Tubos, Entrada Estoque Tubete). Os dados vêm de `src/lib/fixtures.ts` e vivem em memória (`src/lib/store.tsx`) durante a sessão.

## Marco 2 — Banco de dados (Netlify Database)
- Esquema Drizzle em `db/schema.ts`: `medidas` (com mínimo kg), `rolos`, `residuos`, `producao_tubos` + `producao_codigos`, `lotes_tubete`, `tubetes_por_caixa`, sequência de IDs de rolo.
- Seed com as medidas e a tabela de referência de tubetes por caixa.

## Marco 3 — Server functions e troca do store
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
