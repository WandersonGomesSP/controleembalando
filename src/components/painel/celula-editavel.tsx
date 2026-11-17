import * as React from 'react'

export function CelulaEditavel({
  value, displayValue, selected, editing, error, numeric, mono, onSelect, onStartEdit, onCommit, onCancel, onMove,
}: {
  value: string
  displayValue?: string
  selected: boolean
  editing: boolean
  error?: string
  numeric?: boolean
  mono?: boolean
  onSelect: () => void
  onStartEdit: (initialValue?: string) => void
  onCommit: (value: string) => void
  onCancel: () => void
  onMove: (direction: 'next' | 'down') => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [draft, setDraft] = React.useState(value)
  React.useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  React.useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  return (
    <td
      title={error}
      tabIndex={selected ? 0 : -1}
      onClick={(event) => { onSelect(); event.currentTarget.focus() }}
      onDoubleClick={() => onStartEdit()}
      onKeyDown={(event) => {
        if (!editing && selected && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          event.preventDefault(); setDraft(event.key); onStartEdit(event.key)
        }
      }}
      className={`relative min-w-32 border border-[#E2E8F0] bg-white px-2 py-2 text-sm text-[#1E293B] ${numeric ? 'text-right [font-variant-numeric:tabular-nums]' : 'text-left'} ${mono ? 'font-mono' : ''} ${selected ? 'outline outline-2 -outline-offset-2 outline-[#B91C1C]' : ''} ${error ? 'bg-red-50' : ''}`}
    >
      {editing ? (
        <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); onCommit(draft) }
            if (event.key === 'Escape') { event.preventDefault(); onCancel() }
            if (event.key === 'Tab') { event.preventDefault(); onCommit(draft); onMove('next') }
          }}
          className="w-full min-w-28 border-2 border-[#B91C1C] bg-white px-1 py-0.5 text-inherit outline-none"
        />
      ) : (
        <span className="block min-h-5 cursor-cell" onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); onStartEdit() }
        }} tabIndex={selected ? 0 : -1}>{(displayValue ?? value) || '—'}</span>
      )}
      {error && <span className="absolute left-0 top-full z-20 mt-1 max-w-64 rounded bg-[#B91C1C] px-2 py-1 text-xs text-white shadow">{error}</span>}
    </td>
  )
}
