# PCP · Tubos & Tubetes

Painel web administrativo para controle de produção e estoque de rolos de papel, tubos e tubetes, em tema escuro azulado.

## Telas
- **Resumo** — cards (Rolos Ativos, Peso Total KG, Histórico Resíduo, Estoque Tubete, Capacidade Produção), tabela "Estoque por Medida" e "Histórico de Resíduos (Últimos 20)".
- **+ Entrada** — entrada de rolos com prévia dos próximos IDs.
- **- Saída** — busca por ID ou medida e baixa do rolo com registro de resíduo.
- **Ajuste Peso** — correção de peso bruto e tara.
- **Cad. Produção de Tubos** — registro de produção com códigos de insumos dinâmicos.
- **Entrada Estoque Tubete** — entrada de caixas com tabela de referência de tubetes por caixa e cálculo da quantidade total.

## Tecnologias
TanStack Start (React 19), Tailwind CSS 4, lucide-react, sonner, hospedagem na Netlify.

## Rodando localmente
```bash
pnpm install
netlify dev   # ou: pnpm dev
```

## Próximos passos
Hoje os dados são de exemplo e ficam em memória durante a sessão. O roteiro em [PLAN.md](PLAN.md) cobre persistência com Netlify Database, server functions, login de operadores e relatórios.
