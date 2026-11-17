type Modo = 'lista' | 'planilha'

export function AlternadorModo({ modo, onChange }: { modo: Modo; onChange: (modo: Modo) => void }) {
  return (
    <div role="group" aria-label="Modo de visualização" className="inline-flex rounded-lg border border-[#E2E8F0] bg-white p-1">
      {(['lista', 'planilha'] as const).map((opcao) => (
        <button key={opcao} type="button" onClick={() => onChange(opcao)} aria-pressed={modo === opcao}
          className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${modo === opcao ? 'bg-[#B91C1C] text-white' : 'border border-[#E2E8F0] bg-white text-[#0B1F4D]'}`}>
          {opcao === 'lista' ? 'Lista' : 'Planilha'}
        </button>
      ))}
    </div>
  )
}
