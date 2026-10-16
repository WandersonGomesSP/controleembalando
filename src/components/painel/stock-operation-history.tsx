import * as React from 'react'
import { Clock3, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { StockOperationLogRow } from '@/lib/database.types'
import { useStore } from '@/lib/store'
import { Mono, Panel, SelectInput, TextInput } from '@/components/painel/fields'

function detalheTexto(valor: unknown) {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (Array.isArray(valor)) return valor.join(', ')
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

export function StockOperationHistory({
  title,
  description,
  entidades,
  acaoInicial = '',
}: {
  title: string
  description: string
  entidades: string[]
  acaoInicial?: StockOperationLogRow['acao'] | ''
}) {
  const { consultarHistoricoEstoque, historicoEstoque } = useStore()
  const [registros, setRegistros] = React.useState<StockOperationLogRow[]>([])
  const [temMais, setTemMais] = React.useState(false)
  const [carregando, setCarregando] = React.useState(true)
  const [busca, setBusca] = React.useState('')
  const [operador, setOperador] = React.useState('')
  const [acao, setAcao] = React.useState<StockOperationLogRow['acao'] | ''>(acaoInicial)
  const [de, setDe] = React.useState('')
  const [ate, setAte] = React.useState('')
  const [atualizacao, setAtualizacao] = React.useState(0)
  const requisicaoAtual = React.useRef(0)
  const filtroRef = React.useRef({ busca, operador, acao, de, ate })
  filtroRef.current = { busca, operador, acao, de, ate }
  const entidadesKey = entidades.join('\u0000')
  const entidadesEstaveis = React.useMemo(
    () => entidadesKey.split('\u0000'),
    [entidadesKey],
  )

  const carregar = React.useCallback(
    async (inicio: number, anexar = false) => {
      const requisicao = ++requisicaoAtual.current
      setCarregando(true)
      try {
        const resultado = await consultarHistoricoEstoque({
          entidades: entidadesEstaveis,
          busca: filtroRef.current.busca,
          operador: filtroRef.current.operador,
          acao: filtroRef.current.acao,
          de: filtroRef.current.de,
          ate: filtroRef.current.ate,
          inicio,
          limite: 50,
        })
        if (requisicao === requisicaoAtual.current) {
          setRegistros((atuais) =>
            anexar ? [...atuais, ...resultado.registros] : resultado.registros,
          )
          setTemMais(resultado.temMais)
        }
      } catch {
        if (requisicao === requisicaoAtual.current) {
          toast.error('Não foi possível carregar o histórico desta guia.')
        }
      } finally {
        if (requisicao === requisicaoAtual.current) setCarregando(false)
      }
    },
    [consultarHistoricoEstoque, entidadesEstaveis],
  )

  React.useEffect(() => {
    const timeout = setTimeout(() => void carregar(0), 250)
    return () => clearTimeout(timeout)
  }, [busca, operador, acao, de, ate, atualizacao, carregar])
  React.useEffect(() => {
    if (historicoEstoque.length) setAtualizacao((value) => value + 1)
  }, [historicoEstoque[0]?.id])

  const coresAcao: Record<StockOperationLogRow['acao'], string> = {
    ENTRADA: 'text-success',
    'SAÍDA': 'text-warning',
    ALTERAÇÃO: 'text-primary',
  }

  return (
    <Panel
      title={title}
      description={description}
      action={
        <button
          type="button"
          onClick={() => setAtualizacao((valor) => valor + 1)}
          aria-label="Atualizar histórico"
          className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className="size-4" />
        </button>
      }
      className="self-start"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <TextInput
          aria-label="Buscar código ou registro"
          placeholder="Código ou registro"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
        />
        <TextInput
          aria-label="Filtrar operador"
          placeholder="Operador"
          value={operador}
          onChange={(event) => setOperador(event.target.value)}
        />
        <SelectInput
          aria-label="Filtrar ação"
          value={acao}
          onChange={(event) =>
            setAcao(event.target.value as StockOperationLogRow['acao'] | '')
          }
          options={[
            { value: '', label: 'Todas as ações' },
            { value: 'ENTRADA', label: 'Entrada' },
            { value: 'SAÍDA', label: 'Saída' },
            { value: 'ALTERAÇÃO', label: 'Alteração' },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <TextInput
            aria-label="Data inicial"
            title="Data inicial"
            type="date"
            value={de}
            onChange={(event) => setDe(event.target.value)}
          />
          <TextInput
            aria-label="Data final"
            title="Data final"
            type="date"
            value={ate}
            onChange={(event) => setAte(event.target.value)}
          />
        </div>
      </div>

      <div className="scroll-area mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
        {carregando && registros.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Carregando histórico...
          </p>
        ) : registros.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma operação encontrada para estes filtros.
          </p>
        ) : (
          registros.map((registro) => (
            <article
              key={registro.id}
              className="rounded-lg border border-border/80 bg-background/40 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-xs font-semibold ${coresAcao[registro.acao]}`}>
                  {registro.acao} · {registro.entidade}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock3 className="size-3" />
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(registro.ocorrido_em))}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {registro.operador}
                {registro.ator_email && registro.ator_email !== registro.operador
                  ? ` · ${registro.ator_email}`
                  : ''}
              </p>
              <p className="mt-2 text-sm">
                Registro <Mono className="font-semibold">{registro.registro_id}</Mono>
                {' · '}
                <Mono>{registro.quantidade.toLocaleString('pt-BR')}</Mono>
                {registro.entidade === 'Lote de tubetes'
                  ? ' unidades'
                  : registro.entidade === 'Rolo' ||
                      registro.entidade === 'Rolo de insumo'
                    ? ' rolo(s)'
                    : ' item(ns)'}
              </p>
              {registro.codigos.length > 0 && (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  Códigos: <Mono>{registro.codigos.join(', ')}</Mono>
                </p>
              )}
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Ver detalhes</summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                  {Object.entries(registro.detalhes).map(([chave, valor]) => (
                    <React.Fragment key={chave}>
                      <dt className="capitalize">{chave.replaceAll('_', ' ')}</dt>
                      <dd className="break-words text-foreground">
                        {detalheTexto(valor)}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              </details>
            </article>
          ))
        )}
      </div>
      {temMais && (
        <button
          type="button"
          disabled={carregando}
          onClick={() => void carregar(registros.length, true)}
          className="mt-3 w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          Carregar operações anteriores
        </button>
      )}
    </Panel>
  )
}
