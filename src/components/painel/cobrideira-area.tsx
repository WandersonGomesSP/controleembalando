import * as React from 'react'
import {
  ArrowLeft,
  ClipboardList,
  PackagePlus,
  Search,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Field,
  Panel,
  PrimaryButton,
  SelectInput,
  TextInput,
} from '@/components/painel/fields'
import { supabase } from '@/lib/supabase'
import type {
  CobrideiraBobinaInsert,
  CobrideiraBobinaRow,
} from '@/lib/database.types'

type FormularioBobina = {
  numeroBobina: string
  codBob: string
  data: string
  aba: string
  material: string
  largura: string
  pesoBruto: string
  pesoFinal: string
  pesoCilindro: string
  metragem: string
  perda: string
  fornecedorFilme: string
  vareta: string
  kgCola: string
  loteCola: string
  codigoInterno: string
  fornecedorCola: string
  turno: string
  linha: string
  corFundo: string
  pigmento: string
  corMistura: string
  pigmentoMistura: string
  cliente: string
  corImpressao: string
  emenda: string
  codigoEmenda: string
}

type Secao = 'cadastro' | 'registros'

const LARGURAS = [
  '980.20',
  '980.25',
  '980.28',
  '1020.20',
  '1200.20',
  '1265.20',
  '1270.20',
  '1270.25',
]
const FORNECEDORES_FILME = ['INNOVA', 'TITAN', 'JHP']
const VARETAS = ['16', '18', '20', '22', '26', '28']
const LINHAS = ['Padrão', 'Personalizada', 'Impressa Linha']

function dataLocalHoje() {
  const data = new Date()
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset())
  return data.toISOString().slice(0, 10)
}

function formularioInicial(): FormularioBobina {
  return {
    numeroBobina: '',
    codBob: '',
    data: dataLocalHoje(),
    aba: '',
    material: 'BOPP',
    largura: '980.20',
    pesoBruto: '',
    pesoFinal: '',
    pesoCilindro: '3',
    metragem: '',
    perda: '',
    fornecedorFilme: 'INNOVA',
    vareta: '18',
    kgCola: '',
    loteCola: '',
    codigoInterno: '',
    fornecedorCola: '',
    turno: '1º TURNO',
    linha: 'Padrão',
    corFundo: 'CRISTAL',
    pigmento: '',
    corMistura: '',
    pigmentoMistura: '',
    cliente: '',
    corImpressao: '',
    emenda: 'NÃO',
    codigoEmenda: '',
  }
}

function numero(valor: string) {
  const resultado = Number(valor.trim().replace(',', '.'))
  return Number.isFinite(resultado) ? resultado : null
}

function numeroCampo(valor: string, rotulo: string, padrao = 0) {
  if (!valor.trim()) return padrao
  const resultado = numero(valor)
  if (resultado === null || resultado < 0) {
    throw new Error(`Confira o campo ${rotulo}.`)
  }
  return resultado
}

function pesoCilindroPadrao(largura: string) {
  if (largura.startsWith('980')) return '3'
  if (largura.startsWith('1200')) return '4.8'
  if (largura.startsWith('1265') || largura.startsWith('1270')) return '5'
  return ''
}

function varetaPadrao(largura: string) {
  if (largura.endsWith('.20')) return '18'
  if (largura.endsWith('.25')) return '22'
  if (largura.endsWith('.28')) return '28'
  return ''
}

function formatarPeso(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor)
}

function formatarData(valor: string) {
  return new Date(`${valor}T00:00:00`).toLocaleDateString('pt-BR')
}

function erroMensagem(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return 'Verifique sua conexão e tente novamente.'
}

function CampoDecimal({
  id,
  label,
  value,
  onChange,
  required = false,
  readOnly = false,
}: {
  id: string
  label: string
  value: string
  onChange?: (value: string) => void
  required?: boolean
  readOnly?: boolean
}) {
  return (
    <Field label={label} htmlFor={id}>
      <TextInput
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        required={required}
        readOnly={readOnly}
        className={readOnly ? 'bg-muted font-semibold' : ''}
      />
    </Field>
  )
}

export function CobrideiraArea({ onChangeArea }: { onChangeArea: () => void }) {
  const [secao, setSecao] = React.useState<Secao>('cadastro')
  const [form, setForm] = React.useState(formularioInicial)
  const [registros, setRegistros] = React.useState<CobrideiraBobinaRow[]>([])
  const [busca, setBusca] = React.useState('')
  const [dataInicial, setDataInicial] = React.useState('')
  const [dataFinal, setDataFinal] = React.useState('')
  const [turnoFiltro, setTurnoFiltro] = React.useState('')
  const [fornecedorFiltro, setFornecedorFiltro] = React.useState('')
  const [linhaFiltro, setLinhaFiltro] = React.useState('')
  const [carregando, setCarregando] = React.useState(true)
  const [salvando, setSalvando] = React.useState(false)
  const [erroConsulta, setErroConsulta] = React.useState('')

  const pesoLiquido = (() => {
    const final = numero(form.pesoFinal)
    const cilindro = numero(form.pesoCilindro)
    if (final === null || cilindro === null) return ''
    return formatarPeso(final - cilindro)
  })()
  const clienteVisivel = form.linha !== 'Padrão'
  const corImpressaoVisivel =
    form.linha === 'Personalizada' || form.linha === 'Impressa Linha'
  const registrosFiltrados = registros.filter((registro) => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    const correspondeBusca =
      !termo ||
      registro.numero_bobina.toLocaleLowerCase('pt-BR').includes(termo) ||
      registro.cod_bob.toLocaleLowerCase('pt-BR').includes(termo) ||
      registro.cliente.toLocaleLowerCase('pt-BR').includes(termo)
    return (
      correspondeBusca &&
      (!dataInicial || registro.data >= dataInicial) &&
      (!dataFinal || registro.data <= dataFinal) &&
      (!turnoFiltro || registro.turno === turnoFiltro) &&
      (!fornecedorFiltro || registro.fornecedor_filme === fornecedorFiltro) &&
      (!linhaFiltro || registro.linha === linhaFiltro)
    )
  })
  const pesoTotalFiltrado = registrosFiltrados.reduce(
    (total, registro) => total + Number(registro.peso_liquido || 0),
    0,
  )
  const metragemTotalFiltrada = registrosFiltrados.reduce(
    (total, registro) => total + Number(registro.metragem || 0),
    0,
  )
  const producaoPorDia = Object.values(
    registrosFiltrados.reduce<Record<string, { data: string; quantidade: number }>>(
      (grupos, registro) => {
        const chave = registro.data
        grupos[chave] ??= { data: chave, quantidade: 0 }
        grupos[chave].quantidade += 1
        return grupos
      },
      {},
    ),
  ).sort((a, b) => a.data.localeCompare(b.data)).slice(-7)
  const maxProducaoDia = Math.max(1, ...producaoPorDia.map((item) => item.quantidade))

  async function consultarRegistros() {
    const { data, error } = await supabase
      .schema('cobrideira')
      .from('bobinas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return data
  }

  React.useEffect(() => {
    let ativa = true
    consultarRegistros()
      .then((data) => {
        if (ativa) setRegistros(data)
      })
      .catch((error: unknown) => {
        if (ativa) {
          setErroConsulta(
            `Não foi possível carregar as bobinas. Confira a migração e a exposição do schema Cobrideira no Supabase. ${erroMensagem(error)}`,
          )
        }
      })
      .finally(() => {
        if (ativa) setCarregando(false)
      })
    return () => {
      ativa = false
    }
  }, [])

  async function carregarRegistros() {
    setCarregando(true)
    setErroConsulta('')
    try {
      setRegistros(await consultarRegistros())
    } catch (error: unknown) {
      setErroConsulta(
        `Não foi possível carregar as bobinas. Confira a migração e a exposição do schema Cobrideira no Supabase. ${erroMensagem(error)}`,
      )
    } finally {
      setCarregando(false)
    }
  }

  function atualizar<K extends keyof FormularioBobina>(
    campo: K,
    valor: FormularioBobina[K],
  ) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
  }

  async function salvar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const bruto = numero(form.pesoBruto)
    const final = numero(form.pesoFinal)
    const cilindro = numero(form.pesoCilindro)
    const metragem = Number.parseInt(form.metragem, 10)
    if (bruto === null || bruto <= 0)
      return toast.error('Informe um peso bruto válido.')
    if (final === null || final <= 0)
      return toast.error('Informe um peso final válido.')
    if (cilindro === null || cilindro < 0)
      return toast.error('Informe um peso de cilindro válido.')
    if (final <= cilindro)
      return toast.error('O peso final deve ser maior que o peso do cilindro.')
    if (!Number.isInteger(metragem) || metragem <= 0)
      return toast.error('Informe uma metragem válida.')
    if (form.emenda === 'SIM' && !form.codigoEmenda.trim()) {
      return toast.error('Informe o código da emenda.')
    }

    const avisos: string[] = []
    if (metragem > 7000) avisos.push('Metragem maior que 7000.')
    if (metragem < 1000) avisos.push('Metragem menor que 4 dígitos.')
    if (String(Math.trunc(bruto)).length > 3)
      avisos.push('Peso bruto tem mais de 3 dígitos.')
    if (String(Math.trunc(final)).length > 3)
      avisos.push('Peso final tem mais de 3 dígitos.')
    const cilindroEsperado = pesoCilindroPadrao(form.largura)
    if (cilindroEsperado && cilindro !== Number(cilindroEsperado)) {
      avisos.push('Peso do cilindro diverge do padrão da largura selecionada.')
    }
    const varetaEsperada = varetaPadrao(form.largura)
    if (varetaEsperada && form.vareta !== varetaEsperada) {
      avisos.push('Vareta diverge do padrão da largura selecionada.')
    }
    if (
      avisos.length &&
      !window.confirm(
        `Atenção:\n${avisos.map((item) => `- ${item}`).join('\n')}\n\nDeseja continuar mesmo assim?`,
      )
    ) {
      return
    }

    setSalvando(true)
    try {
      const insercao: CobrideiraBobinaInsert = {
        numero_bobina: form.numeroBobina.trim(),
        cod_bob: form.codBob.trim(),
        data: form.data,
        aba: form.aba.trim(),
        material: form.material.trim(),
        largura: Number(form.largura),
        peso_bruto: bruto,
        peso_final: final,
        peso_cilindro: cilindro,
        metragem,
        perda_kg: numeroCampo(form.perda, 'perda'),
        fornecedor_filme: form.fornecedorFilme,
        vareta_g: Number(form.vareta),
        kg_cola: numeroCampo(form.kgCola, 'kg de cola'),
        lote_cola: form.loteCola.trim(),
        codigo_interno: form.codigoInterno.trim(),
        fornecedor_cola: form.fornecedorCola.trim(),
        turno: form.turno,
        linha: form.linha,
        cor_fundo: form.corFundo.trim(),
        pigmento_kg: numeroCampo(form.pigmento, 'pigmento'),
        cor_mistura: form.corMistura.trim(),
        pigmento_mistura: form.pigmentoMistura.trim(),
        cliente: form.cliente.trim(),
        cor_impressao: form.corImpressao.trim(),
        emenda: form.emenda === 'SIM',
        codigo_emenda: form.codigoEmenda.trim(),
      }
      const { data, error } = await supabase
        .schema('cobrideira')
        .from('bobinas')
        .insert(insercao)
        .select('*')
        .single()
      if (error) throw error
      setRegistros((atuais) => [data, ...atuais].slice(0, 100))
      setForm(formularioInicial())
      setSecao('registros')
      toast.success('Bobina cadastrada na Cobrideira.')
    } catch (error: unknown) {
      toast.error('Não foi possível cadastrar a bobina.', {
        description: erroMensagem(error),
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-0 bg-transparent shadow-none">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-3 px-4 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                <PackagePlus className="size-5" />
              </span>
              <div>
                <h1 className="text-lg leading-tight font-semibold tracking-tight">
                  Cobrideira
                </h1>
                <p className="text-xs text-muted-foreground">
                  Cadastro e controle de bobinas
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onChangeArea}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border-0 bg-[#e3262e] px-4 text-xs font-bold text-black shadow-sm transition-colors hover:bg-[#ff3b42] hover:text-black"
            >
              <ArrowLeft className="size-4" />
              Trocar setor
            </button>
          </div>
          <nav aria-label="Menus da Cobrideira" className="flex gap-2 pb-3">
            <button
              type="button"
              aria-current={secao === 'cadastro' ? 'page' : undefined}
              onClick={() => setSecao('cadastro')}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium ${secao === 'cadastro' ? 'bg-[#e3262e] text-black shadow-sm' : 'bg-[#e3262e] text-black hover:bg-[#ff3b42]'}`}
            >
              <PackagePlus className="size-4" />
              Cadastrar bobina
            </button>
            <button
              type="button"
              aria-current={secao === 'registros' ? 'page' : undefined}
              onClick={() => setSecao('registros')}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium ${secao === 'registros' ? 'bg-[#e3262e] text-black shadow-sm' : 'bg-[#e3262e] text-black hover:bg-[#ff3b42]'}`}
            >
              <ClipboardList className="size-4" />
              Bobinas registradas
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-[90rem] gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {secao === 'cadastro' ? (
          <>
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">
              Cadastro salvo no schema isolado{' '}
              <span className="font-mono text-foreground">cobrideira</span>.
            </div>
            <Panel
              title="Cadastro de produção · nova bobina"
              description="Preencha os dados da bobina. O peso líquido é calculado pelo peso final menos o peso do cilindro."
            >
              <form onSubmit={salvar} className="grid gap-6">
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Número da bobina" htmlFor="cb-numero-bobina">
                    <TextInput
                      id="cb-numero-bobina"
                      value={form.numeroBobina}
                      onChange={(e) =>
                        atualizar('numeroBobina', e.target.value.trim())
                      }
                      required
                      maxLength={80}
                    />
                  </Field>
                  <Field label="Cód. bobina (externo)" htmlFor="cb-codigo">
                    <TextInput
                      id="cb-codigo"
                      value={form.codBob}
                      onChange={(e) =>
                        atualizar('codBob', e.target.value.toUpperCase())
                      }
                      required
                      maxLength={100}
                    />
                  </Field>
                  <Field label="Data" htmlFor="cb-data">
                    <TextInput
                      id="cb-data"
                      type="date"
                      value={form.data}
                      onChange={(e) => atualizar('data', e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Aba / período de destino" htmlFor="cb-aba">
                    <TextInput
                      id="cb-aba"
                      value={form.aba}
                      onChange={(e) => atualizar('aba', e.target.value)}
                      placeholder="Ex.: NOV/2026"
                      required
                      maxLength={80}
                    />
                  </Field>
                </section>

                <div className="grid gap-6 xl:grid-cols-2">
                  <Panel title="Bobina e produção">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Material" htmlFor="cb-material">
                        <TextInput
                          id="cb-material"
                          value={form.material}
                          onChange={(e) =>
                            atualizar('material', e.target.value.toUpperCase())
                          }
                          required
                          maxLength={100}
                        />
                      </Field>
                      <Field label="Largura" htmlFor="cb-largura">
                        <SelectInput
                          id="cb-largura"
                          value={form.largura}
                          onChange={(e) =>
                            setForm((atual) => ({
                              ...atual,
                              largura: e.target.value,
                              pesoCilindro: pesoCilindroPadrao(e.target.value),
                              vareta:
                                varetaPadrao(e.target.value) || atual.vareta,
                            }))
                          }
                          options={LARGURAS}
                        />
                      </Field>
                      <CampoDecimal
                        id="cb-peso-bruto"
                        label="Peso bruto (kg)"
                        value={form.pesoBruto}
                        onChange={(value) => atualizar('pesoBruto', value)}
                        required
                      />
                      <CampoDecimal
                        id="cb-peso-final"
                        label="Peso final (kg)"
                        value={form.pesoFinal}
                        onChange={(value) => atualizar('pesoFinal', value)}
                        required
                      />
                      <CampoDecimal
                        id="cb-cilindro"
                        label="Peso cilindro (kg)"
                        value={form.pesoCilindro}
                        onChange={(value) => atualizar('pesoCilindro', value)}
                      />
                      <CampoDecimal
                        id="cb-peso-liquido"
                        label="Peso líquido (kg)"
                        value={pesoLiquido}
                        readOnly
                      />
                      <Field label="Metragem" htmlFor="cb-metragem">
                        <TextInput
                          id="cb-metragem"
                          type="number"
                          min={1}
                          step={1}
                          value={form.metragem}
                          onChange={(e) =>
                            atualizar('metragem', e.target.value)
                          }
                          required
                        />
                      </Field>
                      <CampoDecimal
                        id="cb-perda"
                        label="Perda (kg)"
                        value={form.perda}
                        onChange={(value) => atualizar('perda', value)}
                      />
                      <Field
                        label="Fornecedor do filme"
                        htmlFor="cb-fornecedor-filme"
                      >
                        <SelectInput
                          id="cb-fornecedor-filme"
                          value={form.fornecedorFilme}
                          onChange={(e) =>
                            atualizar('fornecedorFilme', e.target.value)
                          }
                          options={FORNECEDORES_FILME}
                        />
                      </Field>
                      <Field label="Vareta (g)" htmlFor="cb-vareta">
                        <SelectInput
                          id="cb-vareta"
                          value={form.vareta}
                          onChange={(e) => atualizar('vareta', e.target.value)}
                          options={VARETAS}
                        />
                      </Field>
                    </div>
                  </Panel>

                  <Panel title="Cola, turno e linha">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <CampoDecimal
                        id="cb-kg-cola"
                        label="Cola (kg)"
                        value={form.kgCola}
                        onChange={(value) => atualizar('kgCola', value)}
                      />
                      <Field label="Lote da cola" htmlFor="cb-lote-cola">
                        <TextInput
                          id="cb-lote-cola"
                          value={form.loteCola}
                          onChange={(e) =>
                            atualizar('loteCola', e.target.value.toUpperCase())
                          }
                          maxLength={100}
                        />
                      </Field>
                      <Field
                        label="Código interno da cola"
                        htmlFor="cb-codigo-interno"
                      >
                        <TextInput
                          id="cb-codigo-interno"
                          value={form.codigoInterno}
                          onChange={(e) =>
                            atualizar(
                              'codigoInterno',
                              e.target.value.toUpperCase(),
                            )
                          }
                          maxLength={100}
                        />
                      </Field>
                      <Field
                        label="Fornecedor da cola"
                        htmlFor="cb-fornecedor-cola"
                      >
                        <TextInput
                          id="cb-fornecedor-cola"
                          value={form.fornecedorCola}
                          onChange={(e) =>
                            atualizar(
                              'fornecedorCola',
                              e.target.value.toUpperCase(),
                            )
                          }
                          maxLength={100}
                        />
                      </Field>
                      <Field label="Turno" htmlFor="cb-turno">
                        <SelectInput
                          id="cb-turno"
                          value={form.turno}
                          onChange={(e) => atualizar('turno', e.target.value)}
                          options={['1º TURNO', '2º TURNO']}
                        />
                      </Field>
                      <Field label="Linha" htmlFor="cb-linha">
                        <SelectInput
                          id="cb-linha"
                          value={form.linha}
                          onChange={(e) => atualizar('linha', e.target.value)}
                          options={LINHAS}
                        />
                      </Field>
                      {clienteVisivel && (
                        <Field label="Cliente" htmlFor="cb-cliente">
                          <TextInput
                            id="cb-cliente"
                            value={form.cliente}
                            onChange={(e) =>
                              atualizar('cliente', e.target.value.toUpperCase())
                            }
                            maxLength={160}
                          />
                        </Field>
                      )}
                      {corImpressaoVisivel && (
                        <Field
                          label="Cor de impressão"
                          htmlFor="cb-cor-impressao"
                        >
                          <TextInput
                            id="cb-cor-impressao"
                            value={form.corImpressao}
                            onChange={(e) =>
                              atualizar(
                                'corImpressao',
                                e.target.value.toUpperCase(),
                              )
                            }
                            maxLength={100}
                          />
                        </Field>
                      )}
                    </div>
                  </Panel>
                </div>

                <Panel title="Cor, pigmento e emenda">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Cor de fundo" htmlFor="cb-cor-fundo">
                      <TextInput
                        id="cb-cor-fundo"
                        value={form.corFundo}
                        onChange={(e) =>
                          atualizar('corFundo', e.target.value.toUpperCase())
                        }
                        required
                        maxLength={100}
                      />
                    </Field>
                    <CampoDecimal
                      id="cb-pigmento"
                      label="Pigmento (kg)"
                      value={form.pigmento}
                      onChange={(value) => atualizar('pigmento', value)}
                    />
                    <Field label="Cor da mistura" htmlFor="cb-cor-mistura">
                      <TextInput
                        id="cb-cor-mistura"
                        value={form.corMistura}
                        onChange={(e) =>
                          atualizar('corMistura', e.target.value.toUpperCase())
                        }
                        maxLength={100}
                      />
                    </Field>
                    <Field
                      label="Pigmento da mistura"
                      htmlFor="cb-pigmento-mistura"
                    >
                      <TextInput
                        id="cb-pigmento-mistura"
                        value={form.pigmentoMistura}
                        onChange={(e) =>
                          atualizar(
                            'pigmentoMistura',
                            e.target.value.toUpperCase(),
                          )
                        }
                        maxLength={100}
                      />
                    </Field>
                    <Field label="Emenda" htmlFor="cb-emenda">
                      <SelectInput
                        id="cb-emenda"
                        value={form.emenda}
                        onChange={(e) => atualizar('emenda', e.target.value)}
                        options={['NÃO', 'SIM']}
                      />
                    </Field>
                    {form.emenda === 'SIM' && (
                      <Field
                        label="Código da emenda"
                        htmlFor="cb-codigo-emenda"
                      >
                        <TextInput
                          id="cb-codigo-emenda"
                          value={form.codigoEmenda}
                          onChange={(e) =>
                            atualizar(
                              'codigoEmenda',
                              e.target.value.toUpperCase(),
                            )
                          }
                          required
                          maxLength={100}
                        />
                      </Field>
                    )}
                  </div>
                </Panel>

                <div className="flex justify-end">
                  <PrimaryButton
                    type="submit"
                    disabled={salvando}
                    className="sm:w-auto"
                  >
                    <Save className="size-4" />
                    {salvando ? 'Salvando...' : 'Salvar registro'}
                  </PrimaryButton>
                </div>
              </form>
            </Panel>
          </>
        ) : (
          <Panel
            title="Bobinas registradas"
            description="Últimos 100 registros da Cobrideira."
            action={
              <button
                type="button"
                onClick={() => void carregarRegistros()}
                className="inline-flex h-10 items-center gap-2 rounded-full border-0 bg-[#e3262e] px-4 text-sm font-bold text-black hover:bg-[#ff3b42]"
              >
                Atualizar
              </button>
            }
          >
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="text-xs font-semibold uppercase text-black">Bobinas filtradas</p>
                <p className="mt-2 text-2xl font-bold text-black">{registrosFiltrados.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="text-xs font-semibold uppercase text-black">Peso líquido total</p>
                <p className="mt-2 text-2xl font-bold text-black">{formatarPeso(pesoTotalFiltrado)} kg</p>
              </div>
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="text-xs font-semibold uppercase text-black">Metragem total</p>
                <p className="mt-2 text-2xl font-bold text-black">{metragemTotalFiltrada.toLocaleString('pt-BR')} m</p>
              </div>
            </div>

            <section className="mb-6 rounded-xl border border-border bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-black">Produção por dia</h3>
                <span className="text-xs text-black">Até 7 dias com registros</span>
              </div>
              {producaoPorDia.length === 0 ? (
                <p className="py-8 text-center text-sm text-black">Sem dados para exibir no gráfico.</p>
              ) : (
                <div className="flex h-40 items-end gap-3 border-b border-border px-2">
                  {producaoPorDia.map((item) => (
                    <div key={item.data} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-xs font-bold text-black">{item.quantidade}</span>
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className="w-full rounded-t-md bg-[#e3262e]"
                          style={{ height: `${Math.max(8, (item.quantidade / maxProducaoDia) * 100)}%` }}
                          title={`${item.quantidade} bobina(s)`}
                        />
                      </div>
                      <span className="pb-2 text-[10px] text-black">{formatarData(item.data).slice(0, 5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mb-5 grid gap-3 rounded-xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
              <label className="grid gap-1 text-xs font-semibold text-black">
                Data inicial
                <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-black">
                Data final
                <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm text-black" />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-black">
                Turno
                <select value={turnoFiltro} onChange={(e) => setTurnoFiltro(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm text-black">
                  <option value="">Todos</option>
                  {Array.from(new Set(registros.map((r) => r.turno))).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-black">
                Fornecedor
                <select value={fornecedorFiltro} onChange={(e) => setFornecedorFiltro(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm text-black">
                  <option value="">Todos</option>
                  {Array.from(new Set(registros.map((r) => r.fornecedor_filme))).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-black">
                Linha
                <select value={linhaFiltro} onChange={(e) => setLinhaFiltro(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm text-black">
                  <option value="">Todas</option>
                  {Array.from(new Set(registros.map((r) => r.linha))).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => { setBusca(''); setDataInicial(''); setDataFinal(''); setTurnoFiltro(''); setFornecedorFiltro(''); setLinhaFiltro('') }} className="h-10 rounded-full bg-[#e3262e] px-4 text-sm font-bold text-black hover:bg-[#ff3b42] sm:col-span-2 lg:col-span-5">
                Limpar filtros
              </button>
            </section>

            <div className="relative mb-4 max-w-md">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <TextInput
                aria-label="Buscar por IDP ou código da bobina"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar IDP ou código da bobina"
                className="pl-9"
              />
            </div>
            {erroConsulta ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              >
                {erroConsulta}
              </p>
            ) : carregando ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Carregando bobinas...
              </p>
            ) : registrosFiltrados.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {busca
                  ? 'Nenhuma bobina encontrada para essa busca.'
                  : 'Nenhuma bobina cadastrada.'}
              </p>
            ) : (
              <div className="scroll-area overflow-x-auto">
                <table className="w-full min-w-[58rem] text-left text-sm">
                  <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Data</th>
                      <th className="px-3 py-3">Número da bobina</th>
                      <th className="px-3 py-3">Cód. bobina</th>
                      <th className="px-3 py-3">Fornecedor</th>
                      <th className="px-3 py-3">Largura</th>
                      <th className="px-3 py-3">Peso líquido</th>
                      <th className="px-3 py-3">Metragem</th>
                      <th className="px-3 py-3">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrosFiltrados.map((registro) => (
                      <tr
                        key={registro.numero_bobina}
                        className="border-b border-border/70 last:border-0"
                      >
                        <td className="px-3 py-3">
                          {formatarData(registro.data)}
                        </td>
                        <td className="px-3 py-3 font-mono">{registro.numero_bobina}</td>
                        <td className="px-3 py-3 font-mono">
                          {registro.cod_bob}
                        </td>
                        <td className="px-3 py-3">
                          {registro.fornecedor_filme}
                        </td>
                        <td className="px-3 py-3">{registro.largura}</td>
                        <td className="px-3 py-3">
                          {formatarPeso(Number(registro.peso_liquido))} kg
                        </td>
                        <td className="px-3 py-3">
                          {registro.metragem.toLocaleString('pt-BR')} m
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          Cadastrada
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </main>
    </div>
  )
}
