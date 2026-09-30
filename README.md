# Lanches Rápido — PDV + Delivery com IA

Aplicativo completo para **lanchonetes e restaurantes**, reconstruído do zero:

- 🏪 **PDV**: cardápio em grade, carrinho, cliente, desconto, taxa de entrega, formas de pagamento e impressão térmica 80mm.
- 🔁 **Troca de conta**: login por PIN com cargos (Administrador / Operador / Entregador) e botão "Trocar de conta".
- 🎨 **Aparência**: temas claro/escuro + logo e identidade da loja (nome, telefone, endereço).
- 💬 **IA no WhatsApp**: o cliente manda mensagem ("2 xburger e 1 coca na rua X") e a IA monta o pedido automaticamente e imprime o atendimento para a cozinha.
- 🛵 **App externo de delivery** (bate no celular, é instalável):
  - **Rastreio do cliente** (`/track/#id`): status do pedido em tempo real, mapa com o entregador e a loja.
  - **App do entregador** (`/courier`): login por PIN, recebe as entregas, inicia a rota e compartilha a localização GPS ao vivo com o cliente.
- 📡 **Tempo real**: WebSocket-style via SSE (Server-Sent Events) — PDV, pedidos, rastreio e entregador sincronizados instantaneamente.
- 🖨️ **Impressora térmica 80mm**: cupom não fiscal, atendimento de cozinha, relatório de fechamento de caixa.

## Arquitetura

```
electron/   App desktop (Electron) — janela do PDV, auto-inicia o servidor, imprime
renderer/   Interface do PDV (HTML/CSS/JS puro, sem build)
server/     Hub central (Node puro, zero dependências) — banco, API REST, SSE e páginas web
            public/track.html   página de rastreio do cliente (mapa + entregador ao vivo)
            public/courier.html app do entregador (login, entregas, GPS em tempo real)
pedidos/    App separado: Bloco de Pedidos (bloco de notas + cronômetro de atraso + 58mm)
bebidas/    Protótipo do atendente IA de bebidas
```

O **servidor** é a fonte única dos dados (mesmo `data.json`). Quando você abre o PDV (`npm start`), o Electron **inicia o servidor automaticamente**; os apps de delivery ficam acessíveis na rede local.

## Bloco de Pedidos (`pedidos/`) — app separado

Aplicativo **web** (roda igual no **Android**, no **iPhone** e no PC, sem instalar nada):

```bash
cd pedidos && npm start        # http://localhost:4191
```

- 📋 Bloco de notas interativo: pedidos + post-its de lembrete, sincronizado entre celular e PC.
- ⏱️ **Cronômetro por pedido com o prazo que você digitar**: avisa o atendente (som, vibração, notificação, modal e faixa vermelha) **sem imprimir nada** — a impressão é separada.
- 🖨️ Impressora térmica **58mm** por **Bluetooth**, **IP na rede (TCP 9100)** ou pela **tela de impressão do celular** (iPhone).
- 📲 **WhatsApp**: cola a mensagem do cliente e o app monta o pedido; devolve o texto pronto para mandar.
- 📱 Instalável como app (Adicionar à Tela de Início).

Detalhes, configuração da impressora e solução de problemas: [`pedidos/README.md`](pedidos/README.md).

## Windows — aplicativo compilado

Os dois artefatos já estão prontos em `dist/` (app completo com WhatsApp + navegador embutido):

1. **`dist/Lanches-Rapido-2.0.0.exe`** — versão **portátil**: copie para o Windows e execute direto, sem instalar nada (não precisa de Node).
2. **`dist/Lanches-Rapido-Setup-2.0.0.exe`** — **instalador** (atualiza preservando os dados em `%APPDATA%\Lanches Rápido\`).

Para recompilar daqui pra frente:

```bash
npm install
npm run dist:win    # recria instalador + portátil em dist/
```

> O `electron-builder` monta o app para Windows e funciona no Windows e no Linux. No **Linux**, a etapa do instalador/ícone usa `wine` (o portátil sai sem wine). A compilação atual foi feita no Linux com Wine 11 relocável (retire embaixo), já com ícone e metadados aplicados no `.exe`.

**No Windows, o app já instalado:**

- Banco e sessão do WhatsApp ficam em `%APPDATA%\Lanches Rápido\`.
- Para atualizar, basta rodar o instalador novo por cima (os dados são preservados).

<details>
<summary>Compilar no Linux (dica: wine relocável, sem sudo)</summary>

O `electron-builder` precisa de `wine` para editar o ícone/versão do `.exe` e montar o instalador. Sem sudo, dá para usar o WineHQ pré-compilado (relocável):

```bash
# baixa e extrai o pacote do WineHQ (ex.: Ubuntu 24.04)
curl -Lso /tmp/wine-stable.deb https://dl.winehq.org/wine-builds/ubuntu/pool/main/w/wine/wine-stable_*.deb
dpkg-deb -x /tmp/wine-stable.deb /tmp/wine-stable
# coloca um `wine` no PATH apontando para ele
ln -sf /tmp/wine-stable/opt/wine-stable/bin/wine /usr/local/bin/wine
wine --version       # inicializa sozinho o prefixo ao primeiro uso
npm run dist:win
```
</details>

## Android — instalar em qualquer celular

O APK é **universal**: 1,3 MB, `minSdk 26` (Android 8.0 ou superior), sem bibliotecas nativas pesadas, apenas as permissões `INTERNET` e `ACCESS_NETWORK_STATE`. Instala em qualquer Android 8+ (arm64, armeabi-v7a, x86, x86_64).

```bash
npm run android:apk       # gera o APK release assinado
npm run android:bundle    # gera o AAB para a Play Store
```

Depois de compilar, os artefatos ficam em:

- `android/app/build/outputs/apk/release/app-release.apk`
- `android/app/build/outputs/bundle/release/app-release.aab`

> **Antes de compilar**, o JDK e o Android SDK precisam estar no `PATH` (eles não vêm por padrão aqui):
>
> ```bash
> export JAVA_HOME=/home/mosh/tools/jdk17
> export ANDROID_HOME=/home/mosh/tools/android-sdk
> export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
> ```

### Instalar direto no celular (sem Play Store)

1. Copie `dist/android/Lanches-Rapido-app-release-1.0.0.apk` para o celular (cabo, WhatsApp, Google Drive, pendrive OTG).
2. Abra o arquivo no celular.
3. O Android vai avisar que o app veio de "fonte desconhecida" — permita **uma vez** nas configurações que aparecer.
4. Toque em **Instalar**.

> A assinatura é a mesma em todas as versões (`SHA-256 314b5e82…dec`). Isso é o que permite **atualizar por cima** sem desinstalar: basta instalar o APK novo, o app e o endereço salvo são preservados. Se a assinatura mudar, o Android recusa a atualização e exige desinstalar.

### Endereço do servidor (o app funciona em qualquer rede)

Na aba **Servidor** do app, cole o endereço da loja. O app aceita o que for digitado e normaliza sozinho:

| O usuário digita | O app conecta em |
|---|---|
| `192.168.0.10:4175` | `http://192.168.0.10:4175` |
| `192.168.0.10` | `http://192.168.0.10:4175` (porta preenchida) |
| `loja.com.br` | `http://loja.com.br` |
| `https://pedidos.loja.com.br` | `https://pedidos.loja.com.br` (mantém caminho e https) |

IPs privados (`192.168.*`, `10.*`, `172.16-31.*`) e `localhost` recebem a porta `4175` automaticamente. Domínios externos assumem as portas padrão do HTTPS.

### Usar fora da rede local (internet)

O servidor escuta em todas as interfaces, então qualquer celular na mesma rede já funciona. Para o app funcionar **fora da LAN** são necessárias duas coisas: um endereço público e **HTTPS** (o Android bloqueia HTTP em destinos externos, e a Play Store exige).

**Opção A — o servidor com HTTPS direto.** Gere um certificado (Let's Encrypt ou o do seu provedor) e inicie com:

```bash
TLS_CERT=/caminho/cert.pem TLS_KEY=/caminho/key.pem npm run server
```

O servidor passa a responder em `https://` com o mesmo código, sem nenhuma configuração extra no app.

**Opção B — proxy reverso.** Coloque o servidor atrás de Nginx/Caddy/Traefik e termine o TLS lá. O processo Node continua em `http://127.0.0.1:4175`.

Depois, o cliente digita `https://seu-dominio.com.br` na aba **Servidor**.

### Atualizar o app depois

Recompile e reinstale por cima — os dados ficam. **Regra do Android:** `versionCode` precisa aumentar a cada publicação. Para subir a versão, edite `android/app/build.gradle.kts`:

```kotlin
versionCode = 2      // era 1
versionName = "1.1.0"
```

## Android — aplicativo de pedidos (Play Store)

**App nativo (Kotlin + Jetpack Compose)** para os clientes pedirem pelo celular, conectado ao **mesmo servidor da lanchonete** e usando a **mesma IA** do WhatsApp.

Artefatos já prontos em `dist/android/`:

| Arquivo | Uso |
|---|---|
| `Lanches-Rapido-app-release-1.0.0.aab` | **Enviar para a Play Store** (signed App Bundle) |
| `Lanches-Rapido-app-release-1.0.0.apk` | Instalar direto no celular (signed, sem Play) |
| `Lanches-Rapido-app-debug.apk` | Versão de desenvolvimento (instalar com adb) |

**Como funciona:**

1. A loja liga o PDV (servidor na porta **4175**). Na aba **Configurações → Aplicativo de pedidos**, ative "Cliente pode pedir pelo app" e veja o endereço `http://<IP-da-loja>:4175`.
2. O cliente instala o app, abre a aba **Servidor** e digita esse endereço (ex.: `http://192.168.0.10:4175`).
3. O app carrega o cardápio, o cliente monta o carrinho (ou digita "2 x-salada e 1 batata" na aba **IA** — mesmos endpoints e mesma IA do servidor) e finaliza.
4. O pedido entra no PDV em tempo real, imprime o atendimento para a cozinha e ganha código de rastreio na aba **Pedido** (status e entregador).

**Permissões (Play Store):** apenas `INTERNET` e `ACCESS_NETWORK_STATE` (o app não pede nada além do necessário).

**Publicação na Play Store (resumo):**

1. `npm run android:bundle` gera o `.aab` assinado.
2. No Google Play Console → **Criar app** (nome: *Lanches Rápido*; idioma: português; tipo: App; grátis) → **Produção** → **Enviar release**, com o `.aab` de `dist/android/`.
3. **Play App Signing**: de preferência **ative** e deixe o Google cuidar da assinatura; guarde a chave de upload em local seguro.
4. **Declarações/Formulários** → **Política de Privacidade**: precisa de uma URL com página descrevendo os dados coletados (nome, telefone e endereço do pedido, usados só para preparar e entregar). Hospede em qualquer página (ex.: site/GitHub Pages).
5. Ficha: ícone (o app já tem ícone adaptável), screenshots de cada tela, resumo/frases curtas em português, categoria **Comida e bebida**.
6. **Teste**: antes de publicar, envie o `.aab` para um teste interno/fechado com o email de alguns usuários.
7. O conteúdo do app usa **HTTP** na sua rede — para internet/fora da LAN, use um túnel (ex.: Tailscale) ou sirva o servidor com HTTPS reverso.

**Keystore (IMPORTANTE — guarde com segurança):**

- Caminho: `/home/mosh/tools/lanchesrapido-release.keystore`
- Senha/alias: `lanchesrapido2026` (config em `android/keystore.properties`, fora do git)
- Perder o keystore com **Play App Signing** desativado impede atualizar o app na Play Store. Mantenha a chave de upload e as senhas fora do repositório.

## Instalação e uso rápido (desenvolvedor)

Requisitos: Node.js 18+.

```bash
npm install
npm start            # abre o PDV (inicia o servidor na porta 4175 sozinho)
```

- Login inicial: **PIN `1234`** (Administrador). Troque em **Configurações → Contas**.
- Páginas públicas (na rede local, use o IP da máquina):
  - Entregador: `http://localhost:4175/courier`
  - Rastreio: `http://localhost:4175/track/<id-do-pedido>` (o link é gerado no PDV)
- Para rodar só o servidor (ex.: em um servidor): `npm run server`.

> O PDV é um app desktop; use-o na máquina da lanchonete. O servidor pode rodar na mesma máquina (recomendado) ou em outro PC na rede.

## Fluxo de uma entrega

1. No **PDV**, finalize um pedido tipo Delivery → um link de rastreio é gerado. Copie e mande para o cliente (por WhatsApp, por ex.).
2. Em **Pedidos**, atribua um entregador (ou o pedido vem automaticamente do WhatsApp).
3. O entregador abre `/courier` no celular, loga com o PIN dele e toca **"Iniciar entrega"** → o GPS dele passa a ser compartilhado em tempo real.
4. O cliente abre o link de rastreio e vê o status + a posição do entregador no mapa.
5. O entregador confirma **"Entregue"** → status atualiza em todos os lados e a venda entra no caixa.

## IA no WhatsApp

1. Em **Configurações → IA + WhatsApp**, informe a chave da API (OpenAI ou qualquer API compatível, ex.: Ollama local via URL base personalizada) e clique em **Testar**. Sem chave, o próprio app reconhece os itens do cardápio localmente.
2. Em **WhatsApp → Conectar**, escaneie o QR code com o celular.
3. Pronto: mensagens de clientes viram pedidos (imprimem o atendimento e geram o link de rastreio).

> O **aplicativo compilado já vem com o WhatsApp funcionando** (navegador Chromium embutido). No primeiro "Conectar", o QR é exibido e a sessão fica salva em `%APPDATA%\Lanches Rápido\wa-session`.
> Na versão de desenvolvimento (npm start), se a dependência não estiver instalada, use a caixa **"Pedido por IA"** em Configurações.

## Impressora térmica

1. No Windows, instale a impressora com driver ESC/POS (ou "Generic / Text Only").
2. Em **Configurações → Impressora**, selecione a impressora e o número de cópias.
3. Cupons e relatórios saem em formato 80mm (A6/receipt).

## Fluxo de caixa

Em **Caixa**: abra o caixa com o valor inicial, acompanhe vendas por forma de pagamento, faça sangrias/suprimentos e feche o caixa com conferência de troco impressa. O **Relatórios** traz faturamento do dia, ticket médio, formas de pagamento e produtos mais vendidos.

## Dados

- Banco único: `%APPDATA%/Lanches Rápido/data.json` (Windows), `~/.config/lanches-caixa/data.json` (Linux).
- Para zerar, limpe esse arquivo (ou reconfigure `DB_PATH`).

## Segurança

- Uso em LAN/uso de confiança: os PINs dão acesso ao caixa. O pedido público de rastreio só expõe os dados do próprio pedido.
- Configure PINs para **todos** os usuários e não deixe o serviço exposto na internet.