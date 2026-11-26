import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { Camera, CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio'
import TextRecognition from '@react-native-ml-kit/text-recognition'
import { supabase } from './src/lib/supabase'
import { getQueue, normalizarCodigo, saveQueue, type ScanDestination, type ScanItem } from './src/lib/queue'

const BLUE = '#00008B'
const RED = '#D71920'
const BARCODE_TYPES: any[] = ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'codabar', 'datamatrix', 'pdf417']
const isCodeLike = (line: string) => {
  const v = normalizarCodigo(line).replace(/[^A-Z0-9-]/g, '')
  return v.length >= 5 && /[A-Z0-9]/.test(v) && !/^(FORNECEDOR|MATERIAL|BOBINA|EMBALANDO|PESO|DATA|CLIENTE|PRODUCAO)$/.test(v)
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [destination, setDestination] = useState<ScanDestination>('COBRIDEIRA_PRODUCAO')
  const [queue, setQueue] = useState<ScanItem[]>([])
  const [queueLoaded, setQueueLoaded] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const [cameraReady, setCameraReady] = useState(false)
  const [scanPaused, setScanPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [supplier, setSupplier] = useState('')
  const [company, setCompany] = useState('')
  const [nf, setNf] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [measure, setMeasure] = useState('')
  const [lastRead, setLastRead] = useState('')
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const cameraRef = useRef<CameraView>(null)
  const locked = useRef(false)
  const beepPlayer = useAudioPlayer('data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAmKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWd/mKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWd/mKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWd/mKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWd/mKOYgGddZ3+Yo5h/Z11nf5ijmIBnXWd/mKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWd/mKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWd/mKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWeAmKOYgGddZ3+Yo5iAZ11nf5ijmH9nXWd/mKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWd/mKOYf2ddZ3+Yo5iAZ11nf5ijmIBnXWd/mKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWd/mKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWd/mKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWeAmKOYgGddZ3+Yo5iAZ11nf5ijmIBnXWd/mKOYgGddZ3+Yo5h/Z11ngJijmIBnXWd/mKOYgGddZ3+Yo5iAZ11n')

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' })
  }, [])

  useEffect(() => {
    getQueue().then(items => { setQueue(items); setQueueLoaded(true) })
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (queueLoaded) void saveQueue(queue) }, [queue, queueLoaded])

  const enviarLeituras = useCallback(async (items: ScanItem[]) => {
    if (!supabase || !session || !items.length) return
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return
      const destinationForBatch = items[0].destino
      const { data: alreadyPending, error: duplicateCheckError } = await supabase.from('coletor_leituras')
        .select('codigo')
        .eq('destino', destinationForBatch)
        .eq('status', 'PENDENTE')
        .in('codigo', items.map(item => item.codigo))
      if (duplicateCheckError) throw duplicateCheckError
      const existingCodes = new Set((alreadyPending ?? []).map(row => row.codigo))
      const itemsToSend = items.filter(item => !existingCodes.has(item.codigo))
      const rows = itemsToSend.map(item => ({
        id: item.id,
        user_id: auth.user!.id,
        codigo: item.codigo,
        destino: item.destino,
        tipo_leitura: item.tipo_leitura,
        origem: item.origem,
        metadados: {
          peso_kg: item.peso_kg || null,
          fornecedor: supplier || null,
          empresa: company || null,
          nf: nf || null,
          data_emissao: issueDate || null,
          data_entrada: entryDate || null,
          medida: measure || null,
          observacao: item.observacao || null,
        },
        status: 'PENDENTE' as const,
        sincronizado_em: new Date().toISOString(),
      }))
      if (rows.length) {
        const { error } = await supabase.from('coletor_leituras').upsert(rows, { onConflict: 'id' })
        if (error) throw error
      }
      const ids = new Set(items.map(item => item.id))
      setQueue(current => current.map(item => ids.has(item.id) ? { ...item, sincronizado: true } : item))
    } catch {
      // Mantém a leitura como pendente no aparelho; o botão de sincronizar permite tentar novamente.
    }
  }, [session, supplier, company, nf, issueDate, entryDate, measure])

  const addCodes = useCallback((values: string[], type: string, origin: ScanItem['origem'], validateFormat = true) => {
    // Leitura direta da câmera: guardar exatamente o conteúdo do código, sem exigir tamanho/formato.
    // A validação mais restrita fica apenas para OCR e digitação manual.
    const unique = [...new Set(values.map(normalizarCodigo).filter(value => value.length > 0 && (!validateFormat || isCodeLike(value))))]
    if (!unique.length) {
      Alert.alert('Nenhum código identificado', 'Tente aproximar a etiqueta, melhorar a iluminação ou digitar o código manualmente.')
      return false
    }
    const existing = new Set(queue.map(item => item.codigo))
    const fresh = unique.filter(code => !existing.has(code))
    const additions: ScanItem[] = fresh.map(codigo => ({
      id: createId(), codigo, destino: destination, tipo_leitura: type, origem,
      criado_em: new Date().toISOString(), sincronizado: false,
      
    }))
    // Códigos já presentes são ignorados silenciosamente durante a leitura contínua.
    setLastRead(fresh.join(', ') || unique.join(', '))
    if (additions.length) {
      setQueue(current => [...additions, ...current])
      void enviarLeituras(additions)
    }
    return additions.length > 0
  }, [destination, queue, enviarLeituras])

  const onBarcode = useCallback((event: BarcodeScanningResult) => {
    if (locked.current || scanPaused) return
    const value = typeof event?.data === 'string' ? event.data.trim() : ''
    if (!value) return
    // Evita processar dezenas de callbacks do mesmo QR enquanto ele permanece diante da câmera.
    locked.current = true
    const added = addCodes([value], typeof event.type === 'string' ? event.type : 'QR_CODE', 'CAMERA', false)
    if (added) {
      // Pausa o preview nativo imediatamente após a primeira leitura para evitar
      // callbacks repetidos enquanto o QR continua enquadrado.
      setScanPaused(true)
      try { beepPlayer.seekTo(0); beepPlayer.play() } catch { /* O bip não deve interromper a leitura. */ }
      setTimeout(() => {
        locked.current = false
        setScanPaused(false)
      }, 900)
    } else {
      setTimeout(() => { locked.current = false }, 500)
    }
  }, [addCodes, beepPlayer, scanPaused])

  const captureAndRead = async () => {
    if (!cameraRef.current || !cameraReady || busy) return
    setBusy(true)
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 })
      if (!photo?.uri) throw new Error('Não foi possível capturar a foto.')
      const [barcodes, text] = await Promise.all([
        Camera.scanFromURLAsync(photo.uri, BARCODE_TYPES).catch(() => []),
        TextRecognition.recognize(photo.uri).catch(() => ({ text: '' })),
      ])
      const barcodeValues = barcodes.map(item => item.data)
      const ocrLines = (text.text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      const candidates = [...barcodeValues, ...ocrLines.filter(isCodeLike)]
      if (candidates.length) addCodes(candidates, barcodeValues.length ? 'CODIGO_DE_BARRAS_QR_OCR' : 'OCR_TEXTO', 'FOTO')
      else Alert.alert('Não encontrei um código', 'A foto foi analisada, mas não encontrei QR Code, código de barras ou texto com aparência de código.')
    } catch (error: any) {
      Alert.alert('Falha na leitura', error?.message || 'Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  const atualizarPesoLeitura = (id: string, value: string) => {
    setQueue(current => current.map(item => item.id === id ? { ...item, peso_kg: value.replace(',', '.') } : item))
  }

  const salvarPesoLeituraNoErp = async (item: ScanItem, value: string) => {
    if (!item.sincronizado || !supabase) return
    const { error } = await supabase.from('coletor_leituras').update({
      metadados: {
        peso_kg: value.trim() ? value.trim().replace(',', '.') : null,
        fornecedor: supplier || null, empresa: company || null, nf: nf || null,
        data_emissao: issueDate || null, data_entrada: entryDate || null,
        medida: measure || null, observacao: item.observacao || null,
      },
    }).eq('id', item.id)
    if (error) Alert.alert('Peso não atualizado no ERP', 'O peso continua salvo no celular e será reenviado na próxima sincronização.')
  }

  const signIn = async () => {
    if (!supabase) return Alert.alert('Configuração necessária', 'Preencha EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no arquivo mobile/.env.')
    setLoginBusy(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoginBusy(false)
    if (error) Alert.alert('Não foi possível entrar', error.message)
    else setSession(data.session)
  }

  const syncQueue = async () => {
    if (!supabase || syncing) return
    const pending = queue.filter(item => !item.sincronizado)
    if (!pending.length) return Alert.alert('Fila sincronizada', 'Não há leituras pendentes neste celular.')
    setSyncing(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error('Sua sessão expirou. Entre novamente.')
      const rows = pending.map(item => ({
        id: item.id,
        user_id: auth.user!.id,
        codigo: item.codigo,
        destino: item.destino,
        tipo_leitura: item.tipo_leitura,
        origem: item.origem,
        metadados: {
          peso_kg: item.peso_kg || null,
          fornecedor: supplier || null,
          empresa: company || null,
          nf: nf || null,
          data_emissao: issueDate || null,
          data_entrada: entryDate || null,
          medida: measure || null,
          observacao: item.observacao || null,
        },
        status: 'PENDENTE',
        sincronizado_em: new Date().toISOString(),
      }))
      const { error } = await supabase.from('coletor_leituras').upsert(rows, { onConflict: 'id' })
      if (error) throw error
      const ids = new Set(pending.map(item => item.id))
      setQueue(current => current.map(item => ids.has(item.id) ? { ...item, sincronizado: true } : item))
      Alert.alert('Enviado ao ERP', pending.length + ' leitura(s) foram enviadas e estão pendentes de conferência no Controle Embalando.')
    } catch (error: any) {
      Alert.alert('Não foi possível sincronizar', error?.message || 'As leituras continuam salvas neste celular.')
    } finally {
      setSyncing(false)
    }
  }

  const signOut = async () => {
    await supabase?.auth.signOut()
    setSession(null)
  }

  const removeItem = async (id: string) => {
    const item = queue.find(row => row.id === id)
    if (item?.sincronizado && supabase) {
      const { error } = await supabase.from('coletor_leituras')
        .update({ status: 'IGNORADO', observacao: 'Removido pelo usuário no Coletor Android.' })
        .eq('id', id).eq('status', 'PENDENTE')
      if (error) return Alert.alert('Não foi possível remover do ERP', error.message)
    }
    setQueue(current => current.filter(row => row.id !== id))
  }
  const clearSynced = () => Alert.alert(
    'Limpar leituras enviadas?',
    'Isso remove apenas os itens enviados desta lista do celular. Eles continuam pendentes no ERP.',
    [{ text: 'Cancelar', style: 'cancel' }, { text: 'Limpar', style: 'destructive', onPress: () => setQueue(current => current.filter(item => !item.sincronizado)) }]
  )
  const addManual = () => {
    const code = normalizarCodigo(manualCode)
    if (!isCodeLike(code)) return Alert.alert('Código inválido', 'Digite um código com pelo menos 5 caracteres.')
    addCodes([code], 'DIGITADO', 'MANUAL')
    setManualCode('')
  }

  const pendingCount = queue.filter(item => !item.sincronizado).length
  const syncedCount = queue.length - pendingCount

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.loginWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.logo}><Image source={require('./assets/logo-embalando.png')} style={styles.logoImage} resizeMode="contain" /></View>
          <Text style={styles.title}>Coletor de códigos</Text>
          <Text style={styles.muted}>Entre com o mesmo usuário e senha do Controle Embalando.</Text>
          <TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/>
          <TextInput style={styles.input} placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword}/>
          <Pressable style={styles.primary} onPress={signIn} disabled={loginBusy}>{loginBusy ? <ActivityIndicator color="#fff"/> : <Text style={styles.primaryText}>Entrar no ERP</Text>}</Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View><Text style={styles.brand}>CONTROLE EMBALANDO</Text><Text style={styles.headerTitle}>Coletor de códigos</Text></View>
        <Pressable onPress={signOut}><Text style={styles.logout}>Sair</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Para onde enviar?</Text>
        <View style={styles.destinations}>
          <Pressable onPress={() => { locked.current = false; setDestination('COBRIDEIRA_PRODUCAO'); setScanPaused(false) }} style={[styles.destination, destination === 'COBRIDEIRA_PRODUCAO' && styles.destinationActive]}>
            <Text style={[styles.destinationTitle, destination === 'COBRIDEIRA_PRODUCAO' && styles.white]}>Produção Cobrideira</Text>
            <Text style={[styles.destinationHint, destination === 'COBRIDEIRA_PRODUCAO' && styles.white]}>Códigos aguardando cadastro</Text>
          </Pressable>
          <Pressable onPress={() => { locked.current = false; setDestination('BOPP_ENTRADA'); setScanPaused(false) }} style={[styles.destination, destination === 'BOPP_ENTRADA' && styles.destinationActive]}>
            <Text style={[styles.destinationTitle, destination === 'BOPP_ENTRADA' && styles.white]}>Entrada de BOPP</Text>
            <Text style={[styles.destinationHint, destination === 'BOPP_ENTRADA' && styles.white]}>Recebimento de material</Text>
          </Pressable>
        </View>

        {destination === 'BOPP_ENTRADA' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Dados da entrada</Text>
            <Text style={styles.muted}>Preencha uma vez; os dados acompanham cada código desta fila.</Text>
            <View style={styles.twoCols}>
              <TextInput style={styles.inputHalf} placeholder="Fornecedor" value={supplier} onChangeText={setSupplier}/>
              <TextInput style={styles.inputHalf} placeholder="Empresa" value={company} onChangeText={setCompany}/>
              <TextInput style={styles.inputHalf} placeholder="NF" value={nf} onChangeText={setNf}/>
              <TextInput style={styles.inputHalf} placeholder="Medida (ex. 1270.20)" value={measure} onChangeText={setMeasure}/>
              <TextInput style={styles.inputHalf} placeholder="Data emissão (AAAA-MM-DD)" value={issueDate} onChangeText={setIssueDate}/>
              <TextInput style={styles.inputHalf} placeholder="Data entrada (AAAA-MM-DD)" value={entryDate} onChangeText={setEntryDate}/>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Capturar códigos</Text>
          {!permission?.granted ? (
            <View style={styles.permissionBox}>
              <Text style={styles.muted}>Precisamos da câmera para ler etiquetas, QR Codes e códigos de barras.</Text>
              <Pressable style={styles.primary} onPress={requestPermission}><Text style={styles.primaryText}>Liberar câmera</Text></Pressable>
            </View>
          ) : (
            <View style={styles.cameraFrame}>
              {cameraEnabled ? (
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  active={cameraEnabled && !scanPaused}
                  facing="back"
                  enableTorch={false}
                  barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'pdf417', 'datamatrix', 'aztec'] }}
                  onBarcodeScanned={scanPaused ? undefined : onBarcode}
                  onCameraReady={() => setCameraReady(true)}
                  onMountError={(event) => Alert.alert('Câmera indisponível', event.message || 'Feche outros aplicativos que estejam usando a câmera e tente novamente.')}
                />
              ) : <View style={styles.cameraOff}><Text style={styles.white}>Câmera pausada</Text></View>}
              <View style={styles.cameraActions}>
                <Pressable style={styles.capture} onPress={captureAndRead} disabled={busy || !cameraReady}>
                  {busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.captureText}>FOTOGRAFAR E LER</Text>}
                </Pressable>
                <Pressable style={styles.cameraToggle} onPress={() => {
                  if (!cameraEnabled) { locked.current = false; setCameraEnabled(true); setScanPaused(false) }
                  else if (scanPaused) { locked.current = false; setScanPaused(false) }
                  else setScanPaused(true)
                }}><Text style={styles.white}>{!cameraEnabled ? 'Abrir câmera' : scanPaused ? 'Retomar leitura' : 'Pausar leitura'}</Text></Pressable>
              </View>
            </View>
          )}
          {!!lastRead && <Text style={styles.successText}>Última leitura: {lastRead}</Text>}
          <Text style={styles.muted}>Aponte para ler automaticamente o código de barras/QR ou fotografe a etiqueta para procurar também códigos impressos por OCR.</Text>
          <View style={styles.manualRow}>
            <TextInput style={[styles.input, styles.manualInput]} placeholder="Ou digite um código" value={manualCode} onChangeText={setManualCode} autoCapitalize="characters"/>
            <Pressable style={styles.smallPrimary} onPress={addManual}><Text style={styles.primaryText}>Adicionar</Text></Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.queueHeader}>
            <View><Text style={styles.sectionTitle}>Fila deste celular</Text><Text style={styles.muted}>{queue.length} códigos • {pendingCount} não enviados • {syncedCount} enviados</Text></View>
            <Pressable onPress={clearSynced}><Text style={styles.link}>Limpar enviados do celular</Text></Pressable>
          </View>
          <FlatList
            data={queue}
            scrollEnabled={false}
            keyExtractor={item => item.id}
            ListEmptyComponent={<Text style={styles.empty}>Nenhum código capturado ainda.</Text>}
            renderItem={({ item }) => (
              <View style={styles.queueItem}>
                <View style={styles.queueIcon}><Text style={styles.queueIconText}>▦</Text></View>
                <View style={styles.queueInfo}>
                  <Text style={styles.code}>{item.codigo}</Text>
                  <Text style={styles.queueMeta}>{item.destino === 'BOPP_ENTRADA' ? 'Entrada BOPP' : 'Produção Cobrideira'} • {item.tipo_leitura}</Text>
                  {item.destino === 'BOPP_ENTRADA' && (
                    <TextInput
                      style={styles.weightInput}
                      placeholder="Peso individual (kg)"
                      keyboardType="decimal-pad"
                      value={item.peso_kg || ''}
                      onChangeText={value => atualizarPesoLeitura(item.id, value)}
                      onEndEditing={event => void salvarPesoLeituraNoErp(item, event.nativeEvent.text)}
                    />
                  )}
                </View>
                <Text style={item.sincronizado ? styles.synced : styles.unsynced}>{item.sincronizado ? 'ENVIADO' : 'PENDENTE'}</Text>
                <Pressable onPress={() => removeItem(item.id)} style={styles.remove}><Text style={styles.removeText}>×</Text></Pressable>
              </View>
            )}
          />
          <Pressable style={[styles.primary, styles.syncButton]} onPress={syncQueue} disabled={syncing || pendingCount === 0}>
            {syncing ? <ActivityIndicator color="#fff"/> : <Text style={styles.primaryText}>Enviar {pendingCount} leitura(s) ao ERP</Text>}
          </Pressable>
        </View>
        <Text style={styles.footer}>As leituras ficam guardadas no aparelho até serem sincronizadas. A sincronização usa um identificador único para não duplicar envios em caso de queda de internet.</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function createId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F5FA' },
  header: { backgroundColor: BLUE, paddingHorizontal: 18, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#C8D2FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  headerTitle: { color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 3 },
  logout: { color: '#fff', fontWeight: '700', padding: 8 },
  content: { padding: 14, paddingBottom: 34, gap: 14 },
  sectionTitle: { color: '#17213B', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  muted: { color: '#64708A', fontSize: 12, lineHeight: 18 },
  destinations: { flexDirection: 'row', gap: 10 },
  destination: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE2EE', borderRadius: 12, padding: 13 },
  destinationActive: { backgroundColor: BLUE, borderColor: BLUE },
  destinationTitle: { color: '#17213B', fontWeight: '800', fontSize: 13 },
  destinationHint: { color: '#64708A', fontSize: 11, marginTop: 5 },
  white: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E3E8F1', gap: 9 },
  twoCols: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D5DCE8', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11, color: '#18213A', fontSize: 14 },
  inputHalf: { width: '48%', flexGrow: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D5DCE8', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 10, color: '#18213A', fontSize: 12 },
  cameraFrame: { height: 290, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0B1020' },
  camera: { flex: 1 },
  cameraOff: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraActions: { position: 'absolute', bottom: 12, left: 12, right: 12, flexDirection: 'row', gap: 8 },
  capture: { flex: 1, backgroundColor: RED, padding: 14, borderRadius: 10, alignItems: 'center' },
  captureText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  cameraToggle: { backgroundColor: '#111827CC', padding: 14, borderRadius: 10, justifyContent: 'center' },
  permissionBox: { gap: 10 },
  primary: { backgroundColor: RED, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  smallPrimary: { backgroundColor: RED, borderRadius: 9, paddingHorizontal: 12, justifyContent: 'center' },
  successText: { color: '#087443', fontSize: 12, fontWeight: '700' },
  manualRow: { flexDirection: 'row', gap: 8, marginTop: 5 },
  manualInput: { flex: 1 },
  queueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: BLUE, fontSize: 11, fontWeight: '800' },
  empty: { color: '#78839A', textAlign: 'center', paddingVertical: 18, fontSize: 12 },
  queueItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#EDF0F5', gap: 8 },
  queueIcon: { width: 34, height: 34, backgroundColor: '#EEF1FF', borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  queueIconText: { color: BLUE, fontSize: 18, fontWeight: '900' },
  queueInfo: { flex: 1 },
  code: { color: '#111827', fontWeight: '900', fontSize: 14 },
  queueMeta: { color: '#68748C', fontSize: 10, marginTop: 2 },
  weightInput: { marginTop: 5, maxWidth: 150, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D5DCE8', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, color: '#18213A', fontSize: 11 },
  synced: { color: '#087443', fontSize: 9, fontWeight: '900' },
  unsynced: { color: '#B45309', fontSize: 9, fontWeight: '900' },
  remove: { paddingHorizontal: 7, paddingVertical: 2 },
  removeText: { color: '#C5222A', fontSize: 23, fontWeight: '500' },
  syncButton: { marginTop: 8 },
  footer: { color: '#778198', fontSize: 10, lineHeight: 16, textAlign: 'center', paddingHorizontal: 10 },
  loginWrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 13 },
  logo: { width: 190, height: 92, backgroundColor: '#fff', borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 8, marginBottom: 6 },
  logoImage: { width: '100%', height: '100%' },
  title: { color: '#111827', fontSize: 27, fontWeight: '900' },
})
