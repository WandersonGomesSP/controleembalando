# Controle Embalando — Coletor Android e iOS

Aplicativo para Android e iOS para fotografar etiquetas, reconhecer QR Codes/códigos de barras e ler códigos impressos por OCR local (Google ML Kit).

## Configuração

1. Copie `.env.example` para `.env`.
2. Copie os valores de `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do `.env` do ERP para `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` no arquivo `mobile/.env`. A URL já está preenchida no exemplo; falta a chave anon pública. Nunca coloque a service-role key no aplicativo.
3. Entre com o mesmo e-mail e senha usados no Controle Embalando.

## Instalação local no Windows

Requisitos: Node.js 22.13+ e uma conta Expo. O EAS compila na nuvem; não é necessário instalar Android Studio, Android SDK ou Xcode para gerar os arquivos de instalação.

```powershell
cd mobile
npm install
npm run android
```

A primeira compilação instala o módulo nativo de OCR. Expo Go não é suficiente; este projeto usa um build próprio. Para gerar APK de teste: `eas build --platform android --profile preview`. Para iOS: `eas build --platform ios --profile preview` (instalação em iPhone exige distribuição/certificados Apple adequados).

## Fluxo

- **Produção Cobrideira:** guarda códigos lidos como pendentes para seleção no ERP antes do cadastro da bobina.
- **Entrada de BOPP:** guarda códigos junto dos dados de fornecedor, empresa, NF, datas, medida e peso informado.
- A fila fica salva localmente. O envio ao Supabase usa UUID gerado no aparelho e upsert, evitando duplicar a mesma leitura quando a conexão cai e o envio é repetido.

## Banco

Execute a migration `supabase/migrations/202611260001_coletor_leituras_mobile.sql` no projeto Supabase `aifuunmqdgwceneshksc`. Ela cria a caixa de entrada de leituras com RLS. O formulário da Cobrideira mostra códigos pendentes para seleção e os conclui após salvar a bobina. A Entrada de BOPP mostra as leituras recebidas; após selecionar os códigos e salvar a entrada agrupada, o ERP marca as leituras como PROCESSADO.
