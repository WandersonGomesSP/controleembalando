import * as React from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Cylinder,
  Factory,
  LockKeyhole,
  LogOut,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AreaId = 'tubeteira' | 'rebobinadeira' | 'estufa'
type Screen = 'login' | 'areas' | 'development'

const AREAS: {
  id: AreaId
  name: string
  description: string
  icon: typeof Boxes
  available: boolean
}[] = [
  {
    id: 'tubeteira',
    name: 'Tubeteira',
    description: 'Produção, rolos e estoque de tubetes',
    icon: Cylinder,
    available: true,
  },
  {
    id: 'rebobinadeira',
    name: 'Rebobinadeira',
    description: 'Controle da operação de rebobinamento',
    icon: Boxes,
    available: false,
  },
  {
    id: 'estufa',
    name: 'Estufa',
    description: 'Acompanhamento dos ciclos de secagem',
    icon: Factory,
    available: false,
  },
]

function AccessButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

function AccessField({
  label,
  onLabelClick,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  onLabelClick?: () => void
}) {
  const inputId = React.useId()

  return (
    <div className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      {onLabelClick ? (
        <button
          type="button"
          onClick={onLabelClick}
          className="w-fit rounded-sm text-left hover:text-foreground focus-visible:outline-none focus-visible:underline"
        >
          {label}
        </button>
      ) : (
        <label htmlFor={inputId}>{label}</label>
      )}
      <input
        id={inputId}
        aria-label={onLabelClick ? label : undefined}
        className="h-9 w-full rounded-md border border-border bg-field px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/65 focus-visible:ring-[3px] focus-visible:ring-ring/40"
        {...props}
      />
    </div>
  )
}

export function AccessGate({
  children,
}: {
  children: (onChangeArea: () => void) => React.ReactNode
}) {
  const [screen, setScreen] = React.useState<Screen>('login')
  const [developmentReturn, setDevelopmentReturn] = React.useState<Screen>('login')
  const [activeUser, setActiveUser] = React.useState<User | null>(null)
  const [area, setArea] = React.useState<AreaId | null>(null)
  const [sessionReady, setSessionReady] = React.useState(false)
  const [loginError, setLoginError] = React.useState('')
  const userLabelClicks = React.useRef(0)
  const userLabelReset = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    let ativo = true
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!ativo) return
      setActiveUser(session?.user ?? null)
      if (session) {
        setScreen('areas')
      } else {
        setArea(null)
        setScreen('login')
      }
    })

    supabase.auth
      .getSession()
      .then(({ data: sessionData, error }) => {
        if (!ativo) return
        if (error) setLoginError('Não foi possível validar a sessão.')
        setActiveUser(sessionData.session?.user ?? null)
        if (sessionData.session) setScreen('areas')
        setSessionReady(true)
      })
      .catch(() => {
        if (ativo) {
          setLoginError('Não foi possível conectar ao Supabase Auth.')
          setSessionReady(true)
        }
      })

    return () => {
      ativo = false
      data.subscription.unsubscribe()
    }
  }, [])

  function handleUserLabelClick() {
    userLabelClicks.current += 1
    if (userLabelReset.current) clearTimeout(userLabelReset.current)
    if (userLabelClicks.current >= 5) {
      userLabelClicks.current = 0
      setDevelopmentReturn('login')
      setScreen('development')
      return
    }
    userLabelReset.current = setTimeout(() => {
      userLabelClicks.current = 0
    }, 1500)
  }

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    setLoginError('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setLoginError('E-mail ou senha não conferem.')
        return
      }
      setActiveUser(data.user)
      setScreen('areas')
    } catch {
      setLoginError('E-mail ou senha não conferem.')
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      setLoginError('Não foi possível encerrar a sessão.')
      return
    }
    setActiveUser(null)
    setArea(null)
    setScreen('login')
  }

  function chooseArea(nextArea: AreaId) {
    setArea(nextArea)
  }

  if (!sessionReady) {
    return (
      <main className="grid min-h-screen place-items-center px-5 text-sm text-muted-foreground">
        Validando sessão...
      </main>
    )
  }

  if (activeUser && area === 'tubeteira') {
    return <>{children(() => setArea(null))}</>
  }

  if (activeUser && area) {
    const selected = AREAS.find((entry) => entry.id === area)!
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-12 sm:px-8">
        <AccessButton
          type="button"
          onClick={() => setArea(null)}
          className="mb-8 w-fit bg-secondary text-secondary-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-4" /> Voltar às áreas
        </AccessButton>
        <div className="max-w-xl border-l-2 border-warning pl-6">
          <p className="mb-3 font-mono text-xs uppercase text-warning">Área selecionada</p>
          <h1 className="text-3xl font-semibold">{selected.name}</h1>
          <p className="mt-3 text-muted-foreground">
            Esta área ainda não está disponível. O acesso à Tubeteira já está funcionando.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-5 py-10 sm:px-8">
      <div className="grid w-full overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[minmax(18rem,0.85fr)_minmax(26rem,1.15fr)]">
        <aside className="flex min-h-64 flex-col justify-between border-b border-border bg-[oklch(0.19_0_0)] p-7 sm:p-9 lg:min-h-[36rem] lg:border-r lg:border-b-0">
          <div>
            <span className="grid size-10 place-items-center rounded-md border border-border text-muted-foreground">
              <Cylinder className="size-6" />
            </span>
            <p className="mt-8 text-xs tracking-wide text-muted-foreground uppercase">
              Controle de fábrica
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-foreground/75">
              Produção e estoque organizados para cada etapa da operação.
            </p>
          </div>
          <div className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            Ambiente de operação
          </div>
        </aside>

        <section className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
          {screen === 'login' && (
            <div className="mx-auto w-full max-w-md">
              <p className="text-xs tracking-wide text-primary uppercase">Acesso ao sistema</p>
              <h2 className="mt-3 text-2xl font-semibold">Entrar</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Entre com a conta cadastrada no Supabase Auth.
              </p>

              <form onSubmit={submitLogin} className="mt-7 grid gap-4">
                <AccessField
                  label="E-mail"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  onLabelClick={handleUserLabelClick}
                />
                <AccessField
                  label="Senha"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
                {loginError && (
                  <p role="alert" className="text-sm text-destructive-foreground">
                    {loginError}
                  </p>
                )}
                <AccessButton
                  type="submit"
                  className="w-full bg-foreground text-background hover:bg-foreground/90"
                >
                  Entrar <ArrowRight className="size-4" />
                </AccessButton>
              </form>
            </div>
          )}

          {screen === 'areas' && (
            <div className="mx-auto w-full max-w-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs tracking-wide text-primary uppercase">Ambientes</p>
                  <h2 className="mt-3 text-2xl font-semibold">Onde vamos trabalhar?</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {activeUser?.email}
                  </p>
                </div>
                <AccessButton
                  type="button"
                  aria-label="Sair da conta"
                  onClick={signOut}
                  className="size-9 shrink-0 bg-secondary px-0 text-secondary-foreground hover:bg-accent"
                >
                  <LogOut className="size-4" />
                </AccessButton>
              </div>

              <div className="mt-8 grid gap-3">
                {AREAS.map((entry) => {
                  const Icon = entry.icon
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => chooseArea(entry.id)}
                      className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b border-border/80 px-3 py-4 text-left transition-colors first:border-t hover:bg-foreground/[0.035]"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        0{AREAS.indexOf(entry) + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{entry.name}</span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {entry.description}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {!entry.available ? 'Em breve' : 'Disponível'}
                        <Icon className="size-4" />
                      </span>
                    </button>
                  )
                })}
              </div>

            </div>
          )}

          {screen === 'development' && (
            <div className="mx-auto w-full max-w-2xl">
              <AccessButton
                type="button"
                onClick={() => setScreen(developmentReturn)}
                className="mb-5 -ml-4 bg-transparent text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" /> Voltar
              </AccessButton>
              <p className="text-xs tracking-wide text-warning uppercase">Administração</p>
              <h2 className="mt-3 text-2xl font-semibold">Acessos e permissões</h2>
              <p className="mt-2 flex gap-2 text-sm leading-6 text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-warning" />
                Crie e remova contas em Authentication &gt; Users no Supabase. A chave de serviço não deve ser usada no navegador.
              </p>
              <a
                href="https://supabase.com/dashboard/project/aifuunmqdgwceneshksci/auth/users"
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex min-h-10 items-center rounded-md bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90"
              >
                Abrir gerenciamento de usuários
              </a>
              <p className="mt-6 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
                No momento, toda conta autenticada pode acessar todas as áreas e tabelas. Permissões diferentes por operador ainda precisam ser configuradas.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}