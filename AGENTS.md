# AGENTS.md

## Visão geral
Painel administrativo (pt-BR) de controle de produção e estoque de tubos e tubetes. TanStack Start + React 19 + Tailwind 4, deploy na Netlify. **Continue a partir de [PLAN.md](PLAN.md)** — o Marco 1 (interface) está pronto; o próximo é o banco de dados.

## Arquitetura
- `src/routes/index.tsx` — única rota. Cabeçalho + menu de abas superior (estado local `aba`), renderiza o componente da aba ativa dentro de `<StoreProvider>`.
- `src/components/painel/` — uma tela por arquivo:
  - `resumo-tab.tsx`, `rolos-tabs.tsx` (Entrada, Saída, Ajuste Peso), `producao-tubos-tab.tsx`, `entrada-tubete-tab.tsx`.
  - `fields.tsx` — primitivas visuais do painel (`Field`, `TextInput`, `SelectInput` nativo, `Panel`, `PrimaryButton`, `Mono`). Use-as em vez dos componentes shadcn para manter os inputs cinzas (`bg-field`).
- `src/lib/fixtures.ts` — **todos** os dados de exemplo e listas de opções (medidas, destinos, espessuras, tabela tubetes/caixa).
- `src/lib/store.tsx` — contexto React com estado em memória e as ações (`adicionarRolos`, `darBaixa`, `ajustarPeso`, `adicionarProducao`, `adicionarTubetes`). Esta API é o ponto de troca: no Marco 3, substitua as implementações por server functions mantendo as assinaturas.
- `src/components/ui/` — componentes shadcn do template (Toaster do sonner usado para feedback).

## Convenções
- Textos de UI em português; nomes de domínio em português (rolo, tara, resíduo).
- Tema: somente escuro (`<html class="dark">`). Cores em `src/styles.css` (`.dark`), incluindo tokens extras `--field`, `--success`, `--warning`. Fontes IBM Plex Sans / IBM Plex Mono (`font-mono` para IDs e números).
- Números formatados com `kg()`, `int()` e datas com `dataBR()` de `store.tsx`. Entradas decimais aceitam vírgula.
- Peso líquido = bruto − tara. "Capacidade Produção" = peso líquido / `KG_POR_TUBO`.
- Tabelas longas ficam em contêiner `.scroll-area` com `max-h` e cabeçalho `sticky`.
