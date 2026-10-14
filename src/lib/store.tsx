import * as React from 'react'
import {
  PRIMEIRO_ID_LIVRE,
  PRODUCAO_INICIAL,
  RESIDUOS_INICIAIS,
  ROLOS_INICIAIS,
  TUBETES_INICIAIS,
  type LoteTubete,
  type ProducaoTubo,
  type Residuo,
  type Rolo,
} from '@/lib/fixtures'

// Estado em memória da sessão, alimentado pelos fixtures.
// A API deste contexto é o ponto de troca para persistência real.

type Store = {
  rolos: Rolo[]
  residuos: Residuo[]
  tubetes: LoteTubete[]
  producao: ProducaoTubo[]
  proximoId: number
  adicionarRolos: (
    dados: Omit<Rolo, 'id' | 'entrada'>,
    quantidade: number,
  ) => string[]
  darBaixa: (id: string, residuoKg: number) => void
  ajustarPeso: (id: string, pesoBruto: number, tara: number) => boolean
  adicionarProducao: (p: Omit<ProducaoTubo, 'id'>) => void
  adicionarTubetes: (l: Omit<LoteTubete, 'id'>) => void
}

const StoreContext = React.createContext<Store | null>(null)

export function formatId(n: number) {
  return `R-${n}`
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [rolos, setRolos] = React.useState(ROLOS_INICIAIS)
  const [residuos, setResiduos] = React.useState(RESIDUOS_INICIAIS)
  const [tubetes, setTubetes] = React.useState(TUBETES_INICIAIS)
  const [producao, setProducao] = React.useState(PRODUCAO_INICIAL)
  const [proximoId, setProximoId] = React.useState(PRIMEIRO_ID_LIVRE)

  const value = React.useMemo<Store>(
    () => ({
      rolos,
      residuos,
      tubetes,
      producao,
      proximoId,
      adicionarRolos: (dados, quantidade) => {
        const hoje = new Date().toISOString().slice(0, 10)
        const novos = Array.from({ length: quantidade }, (_, i) => ({
          ...dados,
          id: formatId(proximoId + i),
          entrada: hoje,
        }))
        setRolos((r) => [...r, ...novos])
        setProximoId((n) => n + quantidade)
        return novos.map((n) => n.id)
      },
      darBaixa: (id, residuoKg) => {
        const rolo = rolos.find((r) => r.id === id)
        setRolos((r) => r.filter((x) => x.id !== id))
        if (rolo && residuoKg > 0) {
          setResiduos((list) => [
            {
              id: Date.now(),
              data: new Date().toISOString().slice(0, 10),
              origem: `Rolo ${rolo.id} · ${rolo.medida}`,
              peso: residuoKg,
              operador: 'Operador atual',
            },
            ...list,
          ])
        }
      },
      ajustarPeso: (id, pesoBruto, tara) => {
        if (!rolos.some((r) => r.id === id)) return false
        setRolos((r) =>
          r.map((x) => (x.id === id ? { ...x, pesoBruto, tara } : x)),
        )
        return true
      },
      adicionarProducao: (p) =>
        setProducao((list) => [{ ...p, id: Date.now() }, ...list]),
      adicionarTubetes: (l) =>
        setTubetes((list) => [{ ...l, id: Date.now() }, ...list]),
    }),
    [rolos, residuos, tubetes, producao, proximoId],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = React.useContext(StoreContext)
  if (!ctx) throw new Error('useStore precisa de <StoreProvider>')
  return ctx
}

export const pesoLiquido = (r: Rolo) => r.pesoBruto - r.tara

export const kg = (n: number, digits = 1) =>
  n.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

export const int = (n: number) => n.toLocaleString('pt-BR')

export const dataBR = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y?.slice(2)}`
}
