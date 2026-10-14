import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Boxes,
  Cylinder,
  LayoutDashboard,
  Scale,
  type LucideIcon,
} from 'lucide-react'
import { StoreProvider } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ResumoTab } from '@/components/painel/resumo-tab'
import {
  AjustePesoTab,
  EntradaTab,
  SaidaTab,
} from '@/components/painel/rolos-tabs'
import { ProducaoTubosTab } from '@/components/painel/producao-tubos-tab'
import { EntradaTubeteTab } from '@/components/painel/entrada-tubete-tab'
import { AccessGate } from '@/components/painel/access-gate'

export const Route = createFileRoute('/')({
  component: () => (
    <AccessGate>
      {(onChangeArea) => <Painel onChangeArea={onChangeArea} />}
    </AccessGate>
  ),
})

const ABAS: {
  id: string
  label: string
  icon?: LucideIcon
  Component: () => React.ReactNode
}[] = [
  { id: 'resumo', label: 'Resumo', icon: LayoutDashboard, Component: ResumoTab },
  { id: 'entrada', label: '+ Entrada', Component: EntradaTab },
  { id: 'saida', label: '- Saída', Component: SaidaTab },
  { id: 'ajuste', label: 'Ajuste Peso', icon: Scale, Component: AjustePesoTab },
  {
    id: 'producao',
    label: 'Cad. Produção de Tubos',
    icon: Cylinder,
    Component: ProducaoTubosTab,
  },
  {
    id: 'tubete',
    label: 'Entrada Estoque Tubete',
    icon: Boxes,
    Component: EntradaTubeteTab,
  },
]

function Painel({ onChangeArea }: { onChangeArea: () => void }) {
  const [aba, setAba] = React.useState('resumo')
  const atual = ABAS.find((a) => a.id === aba) ?? ABAS[0]!

  return (
    <StoreProvider>
      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-[90rem] flex-col gap-3 px-4 pt-4 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_var(--primary)]">
                  <Cylinder className="size-5" />
                </span>
                <div>
                  <h1 className="text-lg leading-tight font-semibold tracking-tight">
                    Controle Tubeteira
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Controle de produção e estoque
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onChangeArea}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Trocar área
              </button>
            </div>

            <nav
              role="tablist"
              aria-label="Seções do painel"
              className="scroll-area -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0"
            >
              {ABAS.map((a) => {
                const ativo = a.id === aba
                return (
                  <button
                    key={a.id}
                    role="tab"
                    id={`tab-${a.id}`}
                    aria-selected={ativo}
                    aria-controls={`painel-${a.id}`}
                    onClick={() => setAba(a.id)}
                    className={cn(
                      'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none',
                      ativo
                        ? 'bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary)]'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {a.icon && <a.icon className="size-4" />}
                    {a.label}
                  </button>
                )
              })}
            </nav>
          </div>
        </header>

        <main
          role="tabpanel"
          id={`painel-${atual.id}`}
          aria-labelledby={`tab-${atual.id}`}
          className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 sm:py-8"
        >
          <atual.Component />
        </main>
      </div>
    </StoreProvider>
  )
}
