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

## Android — PDV local e offline

O app nativo do **PDV** instala em dispositivos com **Android 8.0 ou superior**. Ele funciona sem internet ou servidor: comandas, produtos, sessões de caixa, sangrias e suprimentos ficam em um banco SQLite privado no aparelho.

```bash
npm run android:apk       # gera APK release
npm run android:bundle    # gera AAB para publicação
```

Para compilar, instale JDK 17 e Android SDK; os scripts usam o Gradle Wrapper incluído no projeto.

O APK gerado fica em `android/app/build/outputs/apk/release/app-release.apk`. Para instalar sem Play Store, transfira esse arquivo para o Android, abra-o e confirme a instalação. Se o Android solicitar, permita a instalação pela fonte usada. O `versionCode` deve ser incrementado a cada atualização.

O app inclui um cardápio local inicial que pode ser complementado com produtos no PDV. Abra o caixa, registre comandas e atualize o preparo; o saldo esperado é calculado pelas vendas concluídas, suprimentos e sangrias da sessão. As sessões fechadas permanecem no histórico. Na **Lixeira**, cada comanda pode ser restaurada; a exclusão permanente pede confirmação e é bloqueada para comandas concluídas que compõem o fechamento.

O banco fica no armazenamento privado do app, não é enviado à nuvem e o app não solicita permissões de rede ou acesso geral a arquivos. As atualizações preservam os dados; **desinstalar o aplicativo apaga o banco local**. O app ainda não tem exportação: registre por outro meio o que precisar manter antes de desinstalar. O caixa Android é local ao aparelho e não sincroniza com o PDV desktop.

### Bloco de Pedidos — app Android separado

O **Bloco de Pedidos** também tem um app nativo independente, sem substituir nem alterar o PDV. Pedidos, cronômetros, lembretes e ajustes são gravados em outro banco SQLite privado, no próprio aparelho. O app funciona offline e não sincroniza com o computador. O cronômetro mostra o prazo e o atraso enquanto o app está aberto; esta versão não envia alertas em segundo plano.

```bash
npm run android:bloco-apk
```

O APK instalável é gerado em `android/bloco/build/outputs/apk/release/bloco-release.apk`. Transfira-o para o Android (8.0 ou superior), abra o arquivo e autorize a instalação pela fonte usada, se solicitado. Para atualizar, instale a nova versão sem desinstalar a anterior. A lixeira permite restaurar pedidos arquivados ou apagar definitivamente apenas o histórico escolhido; esvaziá-la mantém os pedidos ativos, os lembretes e os ajustes. Os lembretes concluídos podem ser limpos separadamente. Compartilhar um pedido usa o menu de compartilhamento do Android (incluindo WhatsApp, quando instalado). Impressão, sincronização com o servidor do computador e importação automática de mensagens do WhatsApp não fazem parte desta versão nativa.

**Sincronização manual:** abra `pedidos/` no computador com `npm start` e conecte o celular à mesma rede Wi-Fi. Em Ajustes no app Android, informe o IP do computador e a porta `4191`, além do PIN do Bloco de Pedidos (padrão `1234`). Teste a conexão e use **Importar** ou **Exportar** quando desejar. Importar adiciona/atualiza registros correspondentes sem apagar os demais dados locais; exportar envia pedidos ativos e lembretes. Para um registro correspondente, prevalece a cópia da última transferência manual. Pedidos que estão na Lixeira não são exportados e a exclusão de um registro não é propagada. Esta versão não sincroniza automaticamente.

**Impressão:** configure a impressora de rede no Bloco de Pedidos do computador, em Ajustes, com IP e protocolo TCP 9100 (ou HTTP se a impressora exigir). No celular, teste a conexão e toque em **Imprimir** no pedido, **Imprimir bloco** nos lembretes ou **Imprimir teste** nos Ajustes. O servidor encaminha os cupons ESC/POS para essa impressora. Celular e computador precisam estar ligados à rede; o servidor precisa continuar aberto. Bluetooth direto no Android ainda não é suportado.

A conexão HTTP sem criptografia serve apenas para uma rede Wi-Fi confiável; para acesso remoto use HTTPS. O PIN e o token de acesso protegem as rotas, mas não substituem TLS fora da rede local.

O Gradle Wrapper incluído exige JDK 17 e Android SDK para compilar. O APK é assinado com a chave de depuração do Gradle para instalação direta; para publicar na Play Store ou atualizar uma instalação assinada com outra chave, configure uma chave de produção.

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
- No app Android, o banco SQLite e o fluxo de caixa são locais ao aparelho e independentes dos dados do desktop.

## Segurança

- Uso em LAN/uso de confiança: os PINs dão acesso ao caixa. O pedido público de rastreio só expõe os dados do próprio pedido.
- Configure PINs para **todos** os usuários e não deixe o serviço exposto na internet.
- No Android, o banco fica no armazenamento privado, backups do Android estão desativados e não há permissões de rede/arquivos. Proteja o aparelho com bloqueio de tela; apagar os dados ou desinstalar o app remove o banco local.