import * as React from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Cylinder,
  Factory,
  KeyRound,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react'

type AreaId = 'tubeteira' | 'rebobinadeira' | 'estufa'
type Screen = 'login' | 'areas' | 'development'

type Credential = {
  id: string
  name: string
  username: string
  salt: string
  passwordHash: string
  areas: AreaId[]
  canManageUsers: boolean
}

const STORAGE_KEY = 'controle-tubeteira-credentials'

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

function isCredential(value: unknown): value is Credential {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<Credential>
  return (
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.username === 'string' &&
    typeof entry.salt === 'string' &&
    typeof entry.passwordHash === 'string' &&
    Array.isArray(entry.areas) &&
    typeof entry.canManageUsers === 'boolean'
  )
}

function readCredentials(): Credential[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isCredential) : []
  } catch {
    return []
  }
}

function saveCredentials(credentials: Credential[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials))
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password: string, salt: string) {
  const encoded = new TextEncoder().encode(`${salt}:${password}`)
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)))
}

function makeSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)))
}

function AccessButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

function AccessField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-foreground">
      {label}
      <input
        className="h-11 w-full rounded-lg border border-border bg-field px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/65 focus-visible:ring-[3px] focus-visible:ring-ring/40"
        {...props}
      />
    </label>
  )
}

export function AccessGate({
  children,
}: {
  children: (onChangeArea: () => void) => React.ReactNode
}) {
  const [screen, setScreen] = React.useState<Screen>('login')
  const [developmentReturn, setDevelopmentReturn] = React.useState<Screen>('login')
  const [credentials, setCredentials] = React.useState<Credential[]>([])
  const [activeUser, setActiveUser] = React.useState<Credential | null>(null)
  const [area, setArea] = React.useState<AreaId | null>(null)
  const [hydrated, setHydrated] = React.useState(false)
  const [loginError, setLoginError] = React.useState('')
  const [developmentMessage, setDevelopmentMessage] = React.useState('')

  React.useEffect(() => {
    setCredentials(readCredentials())
    setHydrated(true)
  }, [])

  function updateCredentials(next: Credential[]) {
    setCredentials(next)
    saveCredentials(next)
  }

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const username = String(form.get('username')).trim().toLowerCase()
    const password = String(form.get('password'))
    const match = credentials.find((entry) => entry.username === username)
    if (!match || (await hashPassword(password, match.salt)) !== match.passwordHash) {
      setLoginError('Usuário ou senha não conferem.')
      return
    }
    setLoginError('')
    setActiveUser(match)
    setScreen('areas')
  }

  async function createCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get('name')).trim()
    const username = String(form.get('username')).trim().toLowerCase()
    const password = String(form.get('password'))
    const areas = AREAS.filter((entry) => form.get(`area-${entry.id}`)).map(
      (entry) => entry.id,
    )
    const canManageUsers = form.get('manage-users') === 'on'

    if (credentials.some((entry) => entry.username === username)) {
      setDevelopmentMessage('Esse usuário já está cadastrado.')
      return
    }
    if (areas.length === 0 && !canManageUsers) {
      setDevelopmentMessage('Libere ao menos uma área ou o gerenciamento de acessos.')
      return
    }

    const salt = makeSalt()
    const created: Credential = {
      id: crypto.randomUUID(),
      name,
      username,
      salt,
      passwordHash: await hashPassword(password, salt),
      areas,
      canManageUsers,
    }
    updateCredentials([...credentials, created])
    setDevelopmentMessage(`Acesso de ${name} criado.`)
    formElement.reset()
  }

  function removeCredential(id: string) {
    updateCredentials(credentials.filter((entry) => entry.id !== id))
    setDevelopmentMessage('Acesso removido.')
  }

  function enterWithoutCredentials() {
    setActiveUser(null)
    setScreen('areas')
  }

  function chooseArea(nextArea: AreaId) {
    setArea(nextArea)
  }

  if (area === 'tubeteira') {
    return <>{children(() => setArea(null))}</>
  }

  if (area) {
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

  const hasCredentials = credentials.length > 0
  const canManageUsers = !activeUser || activeUser.canManageUsers

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-5 py-10 sm:px-8">
      <div className="grid w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/20 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(26rem,1.15fr)]">
        <aside className="relative flex min-h-64 flex-col justify-between overflow-hidden border-b border-border bg-[linear-gradient(145deg,oklch(0.28_0.08_258),oklch(0.19_0.04_190))] p-7 sm:p-9 lg:min-h-[38rem] lg:border-r lg:border-b-0">
          <div className="absolute -right-14 -bottom-12 size-56 rounded-full border border-white/10" />
          <div className="absolute -right-2 -bottom-0 size-32 rounded-full border border-white/10" />
          <div className="relative">
            <span className="grid size-12 place-items-center rounded-lg border border-white/15 bg-black/10 text-emerald-200">
              <Cylinder className="size-6" />
            </span>
            <p className="mt-8 font-mono text-xs uppercase text-emerald-200/80">
              Controle de fábrica
            </p>
            <h1 className="mt-3 max-w-xs text-3xl leading-tight font-semibold text-white sm:text-4xl">
              Controle Tubeteira
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/70">
              Produção e estoque organizados para cada etapa da operação.
            </p>
          </div>
          <div className="relative mt-10 flex items-center gap-2 text-xs text-white/65">
            <span className="size-2 rounded-full bg-emerald-300" />
            Ambiente de operação
          </div>
        </aside>

        <section className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
          {screen === 'login' && (
            <div className="mx-auto w-full max-w-md">
              <p className="font-mono text-xs uppercase text-primary">Acesso ao sistema</p>
              <h2 className="mt-3 text-2xl font-semibold">Entrar</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {hasCredentials
                  ? 'Use seu usuário e senha para continuar.'
                  : 'O acesso ainda está aberto enquanto não há credenciais cadastradas.'}
              </p>

              {hasCredentials ? (
                <form onSubmit={submitLogin} className="mt-8 grid gap-5">
                  <AccessField
                    label="Usuário"
                    name="username"
                    autoComplete="username"
                    required
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
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Entrar <ArrowRight className="size-4" />
                  </AccessButton>
                </form>
              ) : (
                <AccessButton
                  type="button"
                  disabled={!hydrated}
                  onClick={enterWithoutCredentials}
                  className="mt-8 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Acessar sem credenciais <ArrowRight className="size-4" />
                </AccessButton>
              )}

              <div className="mt-8 border-t border-border pt-5">
                <AccessButton
                  type="button"
                  onClick={() => {
                    setDevelopmentMessage('')
                    setDevelopmentReturn('login')
                    setScreen('development')
                  }}
                  className="w-full justify-start bg-transparent px-0 text-muted-foreground hover:text-foreground"
                >
                  <Wrench className="size-4" /> Desenvolvimento e acessos
                </AccessButton>
              </div>
            </div>
          )}

          {screen === 'areas' && (
            <div className="mx-auto w-full max-w-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase text-primary">Ambientes</p>
                  <h2 className="mt-3 text-2xl font-semibold">Onde vamos trabalhar?</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {activeUser ? `Acesso de ${activeUser.name}` : 'Sessão sem credenciais'}
                  </p>
                </div>
                <AccessButton
                  type="button"
                  aria-label="Voltar ao login"
                  onClick={() => {
                    setActiveUser(null)
                    setScreen('login')
                  }}
                  className="size-11 shrink-0 bg-secondary px-0 text-secondary-foreground hover:bg-accent"
                >
                  <ArrowLeft className="size-4" />
                </AccessButton>
              </div>

              <div className="mt-8 grid gap-3">
                {AREAS.map((entry) => {
                  const Icon = entry.icon
                  const allowed = !activeUser || activeUser.areas.includes(entry.id)
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      disabled={!allowed}
                      onClick={() => chooseArea(entry.id)}
                      className="group grid grid-cols-[3rem_1fr_auto] items-center gap-4 rounded-lg border border-border bg-background/45 p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span className="grid size-12 place-items-center rounded-lg bg-secondary text-primary">
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{entry.name}</span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {entry.description}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        {!entry.available && (
                          <span className="hidden text-xs sm:inline">Em breve</span>
                        )}
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </button>
                  )
                })}
              </div>

              {canManageUsers && (
                <AccessButton
                  type="button"
                  onClick={() => {
                    setDevelopmentMessage('')
                    setDevelopmentReturn('areas')
                    setScreen('development')
                  }}
                  className="mt-6 bg-transparent px-0 text-muted-foreground hover:text-foreground"
                >
                  <Wrench className="size-4" /> Gerenciar acessos
                </AccessButton>
              )}
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
              <p className="font-mono text-xs uppercase text-warning">Configuração local</p>
              <h2 className="mt-3 text-2xl font-semibold">Acessos e permissões</h2>
              <p className="mt-2 flex gap-2 text-sm leading-6 text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-warning" />
                Protótipo: os dados ficam neste navegador. Esta tela não protege o sistema; use autenticação no servidor antes de publicar.
              </p>

              <form onSubmit={createCredential} className="mt-7 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <AccessField label="Nome" name="name" autoComplete="name" required />
                  <AccessField
                    label="Usuário"
                    name="username"
                    autoComplete="username"
                    required
                  />
                  <AccessField
                    label="Senha"
                    name="password"
                    type="password"
                    minLength={6}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-medium">Áreas permitidas</legend>
                  {AREAS.map((entry) => (
                    <label
                      key={entry.id}
                      className="flex min-h-10 items-center gap-3 text-sm text-muted-foreground"
                    >
                      <input
                        type="checkbox"
                        name={`area-${entry.id}`}
                        defaultChecked={entry.id === 'tubeteira'}
                        className="size-4 accent-primary"
                      />
                      {entry.name}
                    </label>
                  ))}
                  <label className="flex min-h-10 items-center gap-3 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      name="manage-users"
                      className="size-4 accent-primary"
                    />
                    <ShieldCheck className="size-4" /> Gerenciar credenciais
                  </label>
                </fieldset>

                {developmentMessage && (
                  <p role="status" className="text-sm text-primary">
                    {developmentMessage}
                  </p>
                )}
                <AccessButton
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-fit"
                >
                  <Plus className="size-4" /> Criar credencial
                </AccessButton>
              </form>

              <div className="mt-8 border-t border-border pt-6">
                <h3 className="text-sm font-semibold">Credenciais cadastradas</h3>
                {credentials.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Nenhum usuário cadastrado.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-border">
                    {credentials.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{entry.name}</p>
                          <p className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                            <KeyRound className="size-3" /> {entry.username}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {entry.areas
                              .map((id) => AREAS.find((option) => option.id === id)?.name)
                              .filter(Boolean)
                              .join(', ') || 'Sem áreas'}
                            {entry.canManageUsers ? ' · Gerencia acessos' : ''}
                          </p>
                        </div>
                        <AccessButton
                          type="button"
                          aria-label={`Remover acesso de ${entry.name}`}
                          onClick={() => removeCredential(entry.id)}
                          className="size-10 shrink-0 bg-transparent px-0 text-muted-foreground hover:bg-destructive/15 hover:text-destructive-foreground"
                        >
                          <Trash2 className="size-4" />
                        </AccessButton>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}