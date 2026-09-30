# Bloco de Pedidos — bloco de notas de pedidos com cronômetro e impressora 58mm

App **web** (roda no navegador) feito para o balcão: o mesmo código funciona no
**Android**, no **iPhone** e no **PC**, sem instalar nada e sem dependências.

- 📋 **Bloco de notas interativo**: pedidos + lembretes fixados (post-its coloridos) na mesma tela.
- ⏱️ **Cronômetro por pedido** com o **limite que você digitar** — avisa o atendente (som, vibração, notificação, modal e faixa vermelha) **sem imprimir nada**.
- 🖨️ **Impressora térmica 58mm** por **Bluetooth**, **IP na rede** ou pela **tela de impressão do celular**.
- 📲 **WhatsApp**: cole a mensagem do cliente e o app monta o pedido; devolve o texto pronto para copiar/compartilhar/mandar.
- 📱 **Instalável** (PWA): Adicionar à Tela de Início, igual a um app nativo.
- 🔄 **Sincroniza** celular ↔ PC em tempo real (SSE) — o caixa e a cozinha veem o mesmo.

## Rodar

Requer **Node.js 18+**. Zero dependências (só Node puro).

```bash
cd pedidos
npm start
```

```
[bloco] 20 min de prazo padrão · PIN 1234
[bloco] neste computador: http://localhost:4191
[bloco] no celular (mesma rede): http://192.168.0.10:4191
```

- **No computador do balcão:** <http://localhost:4191>
- **No celular:** abra o endereço `http://<IP-do-balcão>:4191` (o app mostra o IP ao subir).
  O celular precisa estar **na mesma rede Wi-Fi**.
- **Login:** PIN do caixa (padrão `1234` — troque em **Ajustes**).
- Porta e banco customizados: `PORT=4200 DB_PATH=/caminho/data.json npm start`

## Instalar no celular (parece app nativo)

| Aparelho | Como |
|---|---|
| Android (Chrome) | Menu ⋮ → **Instalar aplicativo** (ou o botão “📲 Instalar agora” em Ajustes) |
| iPhone (Safari) | Compartilhar ⬆️ → **Adicionar à Tela de Início** |

Instalado, ele abre em tela cheia, sem barra de navegador, e continua funcionando
com o balcão desligado (a tela abre; para *salvar* precisa do servidor ligado).

## Impressora térmica 58mm

Em **Ajustes → Impressora térmica 58mm** escolha o modo e teste com **🖨️ Imprimir teste**.
São três caminhos — o app usa o que estiver disponível:

### 1. IP na rede (funciona em Android, iPhone e PC — o mais fácil)

1. Ligue a impressora no **Wi-Fi** (ou no cabo de rede do balcão).
2. Descubra o IP dela: pelo painel da impressora, ou digitando no servidor `arp -a`
   (ou `ip addr`) logo depois de imprimir dela uma página de teste.
3. Em Ajustes: modo **IP na rede**, IP `192.168.0.50`, porta **9100**, protocolo **TCP 9100**.
4. **Imprimir teste**.

> Não precisa ser o mesmo aparelho que imprime: o **servidor** (o PC do balcão) é quem
> escreve na impressora — por isso o iPhone também imprime, mesmo sem Bluetooth.

### 2. Bluetooth (Chrome no Android)

1. Ajustes → **Conectar Bluetooth** → escolha a impressora na lista do sistema.
2. Pronto. As impressões vão direto do celular (ESC/POS).

> O Bluetooth do navegador **não existe no iPhone** — lá use “IP na rede” ou “Tela de impressão”.

### 3. Tela de impressão do celular (iPhone / qualquer um)

Modo **Tela de impressão do celular**: o app abre o cupom em 58mm (`@page 58mm`) e você
escolhe a impressora (AirPrint no iPhone) ou “Salvar em PDF”.

### Opções do cupom

| Opção | O que faz |
|---|---|
| Colunas | **32** = 58mm (padrão). Use 48 se a impressora for 80mm |
| Cortar o papel | Envia o comando de corte no fim |
| Abrir gaveta | Envia o comando da gaveta (se a impressora tiver) |
| Tirar acentos | Recomendado: impressoras baratas não têm acentos (vira “Jose”, “Ze”) |
| Cópias | Quantos cupons sairão |

O cupom leva loja, número do pedido, horário, itens, total, pagamento, cliente,
telefone, endereço e observação.

## Cronômetro de atraso (só alerta, não imprime)

Cada pedido tem o próprio cronômetro e o **prazo que você digitar** (por pedido, ou o
prazo padrão dos Ajustes):

- **▶ Iniciar preparo** começa a contagem; **⏸ Pausar** segura; **✔ Concluir** fecha e
  guarda o tempo total.
- Barra verde → **amarela** em 80% do prazo → **vermelha piscando** ao estourar.
- Ao estourar: **som**, **vibração**, **notificação do sistema** (se autorizada) e uma
  janela “⏰ Pedido #012 atrasou!”.
- A **faixa do topo** fica vermelha com a lista dos atrasados, e some quando tudo volta
  ao normal.
- Botão **⋯** no pedido: mudar o prazo (ou **+5 min**), pausar, zerar, reabrir.
- **Aviso de 2 minutos antes** (ligável/desligável em Ajustes).

> O cronômetro **não vai para a impressão** — ele é só o alerta do atendente.
> Ele continua contando mesmo com o app fechado: o tempo é calculado pelo horário
> de início, não por um contador na tela.

## WhatsApp

- **Importar**: cole a mensagem do cliente em **Novo → 📲 Colar mensagem do WhatsApp** →
  **Importar**. O app reconhece nome, telefone, endereço, quantidades (`2x`, `2 `, `meia dúzia`)
  e monta os itens — é só conferir e salvar.
- **Mandar**: botão **⋯ → 💬 Mandar no WhatsApp** abre o WhatsApp com o texto de
  confirmação já escrito (use `{code}`, `{time}` e `{total}` em Ajustes para personalizar).
- **Copiar**: **⋯ → 📋 Copiar texto** (funciona no WhatsApp Business normal, sem API).

## Bloco de notas

Aba **Bloco**: post-its coloridos (amarelo, verde, azul, rosa, cinza) para o que não é
pedido — “ligar para o fornecedor”, “trocar o rolo”, “cliente atrasou o pagamento”.
Toque para riscar (feito), no ✕ para apagar, e **🖨️ Imprimir o bloco** para deixar a lista
de pendências no balcão.

## Dados

Banco único em JSON: `~/.config/bloco-pedidos/data.json` (Linux),
`%APPDATA%\bloco-pedidos\data.json` (Windows). Para zerar, apague o arquivo.

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| Impressora não responde (rede) | Confira IP/porta; a impressora tem que estar **ligada e na mesma rede**; algumas usam porta `80` → troque o protocolo para **HTTP** |
| Bluetooth não conecta | Use no Chrome do Android; em alguns modelos é preciso parear antes no sistema |
| Nada abre ao clicar em imprimir | Libere os pop-ups do navegador para o site |
| Sem notificação de atraso | Notificações exigem **HTTPS** ou `localhost`; na rede local use o **som/vibração** (ligados por padrão). Em Ajustes, toque em “Ativar aviso de notificação” |
| O celular não acha o servidor | Mesmo Wi-Fi e use o **IP** (não `localhost`); se a rede isola aparelhos, libere o acesso entre eles no roteador |
| Esqueci o PIN | Edite `pin` no `data.json` e reinicie o servidor |

## API (usada pelo app)

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/api/login` | PIN → token |
| `GET` | `/api/state` | tudo (loja, ajustes, pedidos, notas) |
| `GET` | `/api/events` | tempo real (SSE) |
| `POST` | `/api/orders` | cria pedido |
| `PATCH` | `/api/orders/:id` | `start`, `pause`, `resume`, `reset`, `done`, `limit`, `printed`, `update` |
| `DELETE` | `/api/orders/:id` | exclui |
| `POST` `PATCH` `DELETE` | `/api/notes[/:id]` | bloco de notas |
| `PATCH` | `/api/settings` | loja, prazos, impressora, PIN |
| `POST` | `/api/print-http` | impressão em impressoras HTTP |
| `WS` | `/print?token=` | ponte de impressão (ESC/POS) para a porta 9100 |
