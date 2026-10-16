import * as React from 'react'
import { toast } from 'sonner'
import { Hash, PackageMinus, PackagePlus, Save, Search } from 'lucide-react'
import type { InsumoRolo, TipoInsumo } from '@/lib/fixtures'
import { kg, useStore } from '@/lib/store'
import {
  Field,
  Mono,
  Panel,
  PrimaryButton,
  SelectInput,
  TextInput,
} from '@/components/painel/fields'
import { StockOperationHistory } from '@/components/painel/stock-operation-history'

const num = (v: string) => Number(v.replace(',', '.'))

function mascaraValidade(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

function mensagemErro(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return 'Verifique sua conexão e tente novamente.'
}

/* ---------------------------------- Entrada --------------------------------- */

export function EntradaTab() {
  const { adicionarInsumoRolo, sugerirCodigosInsumo, referenciasInsumos } =
    useStore()
  const [tipo, setTipo] = React.useState<TipoInsumo>('ROTULO')
  const [medidaCategoria, setMedidaCategoria] = React.useState('48mm')
  const [quantidade, setQuantidade] = React.useState('1')
  const [codigosSugeridos, setCodigosSugeridos] = React.useState<string[]>([])
  const [maiorCodigo, setMaiorCodigo] = React.useState<string | null>(null)
  const [pesoLiquido, setPesoLiquido] = React.useState('')
  const [validade, setValidade] = React.useState('')
  const [salvando, setSalvando] = React.useState(false)
  const categorias = referenciasInsumos
    .filter((referencia) => referencia.tipo === tipo)
    .map((referencia) => referencia.medidaCategoria)
  const quantidadeNumerica = Number(quantidade)

  React.useEffect(() => {
    let ativo = true
    if (
      !Number.isInteger(quantidadeNumerica) ||
      quantidadeNumerica < 1 ||
      quantidadeNumerica > 99
    ) {
      setCodigosSugeridos([])
      setMaiorCodigo(null)
      return
    }
    setCodigosSugeridos([])
    setMaiorCodigo(null)
    sugerirCodigosInsumo(tipo, medidaCategoria, quantidadeNumerica)
      .then((preview) => {
        if (!ativo) return
        setCodigosSugeridos(preview.codigos)
        setMaiorCodigo(preview.maiorCodigo)
      })
      .catch((error: unknown) => {
        if (ativo) {
          setCodigosSugeridos([])
          setMaiorCodigo(null)
          toast.error('Não foi possível consultar os próximos códigos.', {
            description: mensagemErro(error),
          })
        }
      })
    return () => {
      ativo = false
    }
  }, [tipo, medidaCategoria, quantidadeNumerica, sugerirCodigosInsumo])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const peso = num(pesoLiquido)
    const mes = Number(validade.slice(0, 2))
    if (!medidaCategoria) return toast.error('Selecione a categoria.')
    if (
      !Number.isInteger(quantidadeNumerica) ||
      quantidadeNumerica < 1 ||
      quantidadeNumerica > 99
    )
      return toast.error('Informe uma quantidade entre 1 e 99 rolos.')
    if (!(peso > 0)) return toast.error('Informe o peso líquido do rolo.')
    if (
      tipo === 'ROTULO' &&
      (!/^\d{2}\/\d{2}$/.test(validade) || mes < 1 || mes > 12)
    )
      return toast.error('Validade deve estar no formato MM/AA.')
    setSalvando(true)
    try {
      const criados = await adicionarInsumoRolo(
        {
          tipo,
          medidaCategoria,
          pesoLiqKg: peso,
          validade: tipo === 'ROTULO' ? validade : null,
        },
        quantidadeNumerica,
      )
      toast.success(`${criados.length} rolo(s) adicionado(s) ao estoque`, {
        description: criados.join(', '),
      })
    } catch (error: unknown) {
      toast.error(
        'Não foi possível adicionar os rolos. Atualize os códigos e tente novamente.',
        { description: mensagemErro(error) },
      )
      return
    } finally {
      setSalvando(false)
    }
    setPesoLiquido('')
    setValidade('')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Panel
        title="Entrada de Rolos"
        description="Cadastre rolos individuais de rótulos e capas com código rastreável."
        className="self-start"
      >
      <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <Field label="Tipo de insumo" htmlFor="e-tipo">
          <SelectInput
            id="e-tipo"
            value={tipo}
            onChange={(e) => {
              const novoTipo = e.target.value as TipoInsumo
              setTipo(novoTipo)
              setMedidaCategoria(
                referenciasInsumos.find((referencia) => referencia.tipo === novoTipo)
                  ?.medidaCategoria ?? '',
              )
            }}
            options={['ROTULO', 'CAPA']}
          />
        </Field>
        <Field label="Medida / categoria" htmlFor="e-medida">
          <SelectInput
            id="e-medida"
            value={medidaCategoria}
            onChange={(e) => setMedidaCategoria(e.target.value)}
            options={categorias}
          />
        </Field>
        <Field
          label="Quantidade de rolos"
          htmlFor="e-quantidade"
          hint="Escolha de 1 a 99 rolos para cadastrar de uma vez."
        >
          <TextInput
            id="e-quantidade"
            type="number"
            min={1}
            max={99}
            step={1}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field label="Peso líquido (kg)" htmlFor="e-peso">
          <TextInput
            id="e-peso"
            inputMode="decimal"
            placeholder="Ex: 12,5"
            value={pesoLiquido}
            onChange={(e) => setPesoLiquido(e.target.value)}
          />
        </Field>
        {tipo === 'ROTULO' && (
          <Field label="Validade (MM/AA)" htmlFor="e-validade">
            <TextInput
              id="e-validade"
              inputMode="numeric"
              placeholder="MM/AA"
              value={validade}
              onChange={(e) => setValidade(mascaraValidade(e.target.value))}
            />
          </Field>
        )}

        <div role="status" className="rounded-md border border-border px-4 py-3">
          <Hash className="size-4 shrink-0 text-muted-foreground" />
          <div className="mt-2 min-w-0">
            <p className="text-xs text-muted-foreground">
              Maior código já ocupado
            </p>
            <Mono className="block truncate text-base font-semibold">
              {maiorCodigo || '—'}
            </Mono>
            <p className="mt-3 text-xs text-muted-foreground">
              Próximos {codigosSugeridos.length} código(s)
            </p>
            <div className="flex flex-wrap gap-x-2">
              {codigosSugeridos.length ? (
                codigosSugeridos.map((proximo) => (
                  <Mono key={proximo} className="text-base font-semibold">
                    {proximo}
                  </Mono>
                ))
              ) : (
                <Mono className="text-base font-semibold">—</Mono>
              )}
            </div>
          </div>
        </div>

        <PrimaryButton type="submit" className="sm:col-span-2" disabled={salvando}>
          <PackagePlus className="size-5" />
          {salvando ? 'Adicionando...' : 'Adicionar ao Estoque'}
        </PrimaryButton>
      </form>
      </Panel>
      <StockOperationHistory
        title="Histórico de entradas"
        description="Somente rolos cadastrados pela guia de entrada."
        entidades={['Rolo de insumo', 'Rolo']}
        acaoInicial="ENTRADA"
      />
    </div>
  )
}

/* ----------------------------------- Saída ---------------------------------- */

export function SaidaTab() {
  const { baixarInsumoRolo, buscarInsumos } = useStore()
  const [termo, setTermo] = React.useState('')
  const [busca, setBusca] = React.useState<string | null>(null)
  const [resultados, setResultados] = React.useState<InsumoRolo[]>([])
  const [buscando, setBuscando] = React.useState(false)
  const buscaAtual = React.useRef(0)

  async function buscar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const requisicao = ++buscaAtual.current
    setBusca(termo)
    setBuscando(true)
    try {
      const encontrados = await buscarInsumos(termo)
      if (requisicao === buscaAtual.current) setResultados(encontrados)
    } catch {
      if (requisicao === buscaAtual.current) {
        setResultados([])
        toast.error('Não foi possível consultar insumos no Supabase.')
      }
    } finally {
      if (requisicao === buscaAtual.current) setBuscando(false)
    }
  }

  async function baixa(id: string) {
    try {
      await baixarInsumoRolo(id)
    } catch {
      toast.error('Não foi possível registrar a saída no Supabase.')
      return
    }
    toast.success(`Rolo ${id} baixado do estoque.`)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Panel
        title="Saída de Rolos"
        description="Localize um rótulo ou capa pelo código e registre a baixa individual."
        className="self-start"
      >
      <form onSubmit={buscar} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <TextInput
            aria-label="Filtrar por ID ou Medida"
            placeholder="Filtrar por ID ou Medida"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            className="pl-10"
          />
        </div>
        <PrimaryButton type="submit" size="md" className="sm:w-32" disabled={buscando}>
          <Search className="size-4" />
          Buscar
        </PrimaryButton>
      </form>

      <div className="mt-5 overflow-hidden rounded-xl border border-border bg-background/40">
        {resultados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <PackageMinus className="size-8 text-muted-foreground/60" />
            <p className="font-medium">Nenhum rolo encontrado</p>
            <p className="text-sm text-muted-foreground">
              {busca === null
                ? buscando
                  ? 'Consultando Supabase...'
                  : 'Digite um código (ex: 4812) ou categoria e clique em Buscar.'
                : 'Tente outro código ou categoria.'}
            </p>
          </div>
        ) : (
          <div className="scroll-area max-h-[26rem] overflow-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-3 py-3 font-medium">Tipo / categoria</th>
                  <th className="px-3 py-3 text-right font-medium">
                    Líquido (kg)
                  </th>
                  <th className="px-3 py-3 font-medium">Validade</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {resultados.map((r) => (
                  <tr key={r.idCodigo} className="border-t border-border/70">
                    <td className="px-4 py-2.5">
                      <Mono className="font-semibold text-foreground">{r.idCodigo}</Mono>
                    </td>
                    <td className="px-3 py-2.5">{r.tipo} · {r.medidaCategoria}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Mono>{kg(r.pesoLiqKg)}</Mono>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <Mono>{r.validade || '—'}</Mono>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => baixa(r.idCodigo)}
                        className="h-9 rounded-lg border border-destructive/50 bg-destructive/10 px-3 text-xs font-semibold text-destructive-foreground transition-colors hover:bg-destructive/25 focus-visible:ring-[3px] focus-visible:ring-destructive/40 focus-visible:outline-none"
                      >
                        Baixar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {resultados.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {resultados.length} rolo(s) encontrado(s)
        </p>
      )}
      </Panel>
      <StockOperationHistory
        title="Histórico de saídas"
        description="Somente baixas de rolos registradas nesta área."
        entidades={['Rolo de insumo', 'Rolo']}
        acaoInicial="SAÍDA"
      />
    </div>
  )
}

/* -------------------------------- Ajuste Peso ------------------------------- */

export function AjustePesoTab() {
  const { buscarInsumoPorCodigo, ajustarPesoInsumo } = useStore()
  const [id, setId] = React.useState('')
  const [pesoLiquido, setPesoLiquido] = React.useState('')
  const [atual, setAtual] = React.useState<InsumoRolo | null>(null)
  const [buscando, setBuscando] = React.useState(false)

  const normalizado = id.trim().toUpperCase()

  React.useEffect(() => {
    if (!normalizado) return

    let ativo = true
    const timeout = setTimeout(() => {
      buscarInsumoPorCodigo(normalizado)
        .then((rolo) => {
          if (ativo) setAtual(rolo)
        })
        .catch(() => {
          if (ativo) {
            setAtual(null)
            toast.error('Não foi possível consultar o código no Supabase.')
          }
        })
        .finally(() => {
          if (ativo) setBuscando(false)
        })
    }, 250)

    return () => {
      ativo = false
      clearTimeout(timeout)
    }
  }, [normalizado, buscarInsumoPorCodigo])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const peso = num(pesoLiquido)
    if (buscando) return toast.error('Aguarde a consulta do rolo.')
    if (!atual) return toast.error(`Rolo ${normalizado || '—'} não encontrado.`)
    if (!(peso > 0)) return toast.error('Informe o novo peso líquido.')
    try {
      const atualizado = await ajustarPesoInsumo(atual.idCodigo, peso)
      if (!atualizado) return toast.error(`Rolo ${atual.idCodigo} não encontrado.`)
    } catch {
      toast.error('Não foi possível salvar o ajuste no Supabase.')
      return
    }
    toast.success(`Peso do rolo ${atual.idCodigo} atualizado`, {
      description: `Novo líquido: ${kg(peso)} kg`,
    })
    setPesoLiquido('')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Panel
        title="Ajuste de Peso"
        description="Corrija o peso líquido de um rótulo ou capa disponível."
        className="self-start"
      >
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field
          label="Código do Rolo"
          htmlFor="a-id"
          hint={
            atual
              ? `${atual.tipo} · ${atual.medidaCategoria} · ${kg(atual.pesoLiqKg)} kg`
              : buscando
                ? 'Consultando Supabase...'
                : 'Ex: 4812 ou B1005'
          }
        >
          <TextInput
            id="a-id"
            placeholder="Código do rolo"
            value={id}
            onChange={(e) => {
              setId(e.target.value)
              setAtual(null)
              setBuscando(Boolean(e.target.value.trim()))
            }}
            className="font-mono uppercase"
          />
        </Field>
        <Field label="Novo peso líquido (kg)" htmlFor="a-peso">
          <TextInput
            id="a-peso"
            inputMode="decimal"
            placeholder={atual ? kg(atual.pesoLiqKg) : 'Ex: 12,5'}
            value={pesoLiquido}
            onChange={(e) => setPesoLiquido(e.target.value)}
          />
        </Field>
        <PrimaryButton type="submit">
          <Save className="size-5" />
          Salvar Alteração
        </PrimaryButton>
      </form>
      </Panel>
      <StockOperationHistory
        title="Histórico de ajustes"
        description="Alterações realizadas nos registros de rolos."
        entidades={['Rolo de insumo', 'Rolo']}
        acaoInicial="ALTERAÇÃO"
      />
    </div>
  )
}
