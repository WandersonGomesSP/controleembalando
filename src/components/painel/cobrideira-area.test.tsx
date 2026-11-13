import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CobrideiraArea } from './cobrideira-area'

const { schemaMock, fromMock, selectMock, orderMock, limitMock } = vi.hoisted(
  () => ({
    schemaMock: vi.fn(),
    fromMock: vi.fn(),
    selectMock: vi.fn(),
    orderMock: vi.fn(),
    limitMock: vi.fn(),
  }),
)

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: schemaMock },
}))

describe('CobrideiraArea', () => {
  beforeEach(() => {
    limitMock.mockResolvedValue({ data: [], error: null })
    orderMock.mockReturnValue({ limit: limitMock })
    selectMock.mockReturnValue({ order: orderMock })
    fromMock.mockReturnValue({ select: selectMock })
    schemaMock.mockReturnValue({ from: fromMock })
  })

  it('calculates liquid weight and updates width defaults from the selected width', () => {
    render(<CobrideiraArea onChangeArea={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Largura'), {
      target: { value: '980.28' },
    })
    fireEvent.change(screen.getByLabelText('Peso final (kg)'), {
      target: { value: '100' },
    })

    expect(screen.getByLabelText('Peso cilindro (kg)')).toHaveValue('3')
    expect(screen.getByLabelText('Vareta (g)')).toHaveValue('28')
    expect(screen.getByLabelText('Peso líquido (kg)')).toHaveValue('97,00')
  })

  it('shows client and print-color fields for customized production lines', () => {
    render(<CobrideiraArea onChangeArea={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Linha'), {
      target: { value: 'Personalizada' },
    })

    expect(screen.getByLabelText('Cliente')).toBeVisible()
    expect(screen.getByLabelText('Cor de impressão')).toBeVisible()
  })
})
