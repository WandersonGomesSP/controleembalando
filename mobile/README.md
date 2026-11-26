# Controle Embalando — Coletor Android

Aplicativo Android independente para fotografar etiquetas, reconhecer QR Codes/códigos de barras e ler códigos impressos por OCR local (Google ML Kit).

## Configuração

1. Copie `.env.example` para `.env`.
2. Preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` com os valores públicos do mesmo projeto Supabase usado pelo ERP. Nunca coloque a service-role key no aplicativo.
3. Entre com o mesmo e-mail e senha usados no Controle Embalando.

## Instalação local no Windows

Requisitos: Node.js 22.13+, pnpm/npm, Android Studio, Android SDK e um celular Android com depuração USB ativada.

```powershell
cd mobile
pnpm install
pnpm android
```

A primeira compilação instala o módulo nativo de OCR. Expo Go não é suficiente; este projeto usa um development build.

## Fluxo

- **Produção Cobrideira:** guarda códigos lidos como pendentes para seleção no ERP antes do cadastro da bobina.
- **Entrada de BOPP:** guarda códigos junto dos dados de fornecedor, empresa, NF, datas, medida e peso informado.
- A fila fica salva localmente. O envio ao Supabase usa UUID gerado no aparelho e upsert, evitando duplicar a mesma leitura quando a conexão cai e o envio é repetido.

## Banco

Execute a migration `supabase/migrations/202611260001_coletor_leituras_mobile.sql` no projeto Supabase `aifuunmqdgwceneshksc`. Ela cria a caixa de entrada de leituras com RLS. O ERP deve consumir as leituras com status PENDENTE e marcar como PROCESSADO quando concluir o cadastro/entrada.
