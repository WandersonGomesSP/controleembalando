import AsyncStorage from '@react-native-async-storage/async-storage'

export type ScanDestination = 'COBRIDEIRA_PRODUCAO' | 'BOPP_ENTRADA'
export type ScanItem = {
  id: string
  codigo: string
  destino: ScanDestination
  tipo_leitura: string
  origem: 'CAMERA' | 'FOTO' | 'MANUAL'
  criado_em: string
  sincronizado: boolean
  peso_kg?: string
  observacao?: string
}

const KEY = 'controle-embalando-coletor-fila-v1'

export async function getQueue(): Promise<ScanItem[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]') as ScanItem[]
  } catch {
    return []
  }
}

export async function saveQueue(items: ScanItem[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items))
}

export function normalizarCodigo(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}