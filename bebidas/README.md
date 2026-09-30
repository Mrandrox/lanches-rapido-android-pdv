# Bebidas IA — Atendente IA de vendas de bebidas

Protótipo web (primeira etapa) de um sistema de vendas de bebidas com **atendente IA**,
**carrinho de compras**, pedidos em **tempo real**, **painel de atendimento com impressão
térmica 80mm** e **página de rastreio** do pedido.

> Próximas etapas (fora deste protótipo): app **Android** do cliente, app **Android** do
> entregador com GPS ao vivo e impressão direto na impressora térmica via aplicativo desktop.

## O que já tem funcionando

| Recurso | Onde |
|---|---|
| Cardápio de bebidas (8 categorias, ~45 itens) | Loja web `http://localhost:4189/` |
| Carrinho (qtd, remover, retirada/entrega, total c/ taxa) | Loja web |
| Atendente IA que entende "2 Heineken gelada e meia dúzia de Skol" | Botão **Atender IA** |
| IA com OpenAI (ou API compatível) com **fallback local** sem chave | Server `ai.js` |
| Painel de pedidos em tempo real (SSE) | `http://localhost:4189/adm.html` |
| Impressão térmica 80mm (visão de impressão) | Botão **Imprimir (80mm)** no painel |
| Rastreio do pedido em tempo real (SSE) | `http://localhost:4189/track.html?id=<id>` |
| Login administrativo por PIN | Padrão `1234` |

## Como rodar

Requisitos: Node.js 18+ (só Node puro, zero dependências).

```bash
cd bebidas
npm start          # sobe em http://localhost:4189
```

- **Loja (cliente):** <http://localhost:4189/>
- **Painel (loja):** <http://localhost:4189/adm.html> — PIN `1234`
- **Rastreio:** link gerado após o pedido / botão **Link rastreio** no painel.

Para rodar com banco separado: `DB_PATH=/caminho/data.json npm start`. Porta: `PORT=4200`.

## Como funciona

1. O cliente monta o carrinho no cardápio **ou** conversa com a IA:
   - *"2 Heineken gelada, 1 suco de laranja e meia dúzia de Skol"*
   - *"qual o preço do vinho tinto?"* → a IA responde o preço sem adicionar ao carrinho
   - A IA mostrada pode ser a **local** (sem chave) ou **OpenAI** (configurada).
2. Finaliza com nome, telefone e endereço (se entrega) → o pedido cai no **painel** na hora.
3. No painel, o atendente avança os status: Novo → Preparando → Pronto → Saiu para entrega → Entregue (ou Retirado).
4. O cliente acompanha **em tempo real** pela página de rastreio (SSE, atualiza sozinho).

## Atendente IA

### Local (funciona sem chave)
Reconhece bebidas por nome/alias/tamanho, quantidades (números e por extenso:
*um*, *duas*, *meia dúzia*, *dúzia*), e diferencia por embalagem (ex.: "água com gás" ≠ "água";
"heineken long neck" ≠ "heineken lata"). Também faz up-sell (combo de cerveja, energético, etc.).

### OpenAI / API compatível (qualquer endereço `baseUrl`)
Edite o banco `~/.config/bebidas-ia/data.json`:

```json
"ai": {
  "baseUrl": "https://api.openai.com/v1",
  "key": "sua-chave",
  "model": "gpt-4o-mini"
}
```

Com a chave configurada, o atendente responde perguntas livres, recomenda combos e monta o
pedido usando o cardápio real. Se a API falhar (ou a rede cair), volta sozinho para o local.

## Dados

- Banco único em JSON: `~/.config/bebidas-ia/data.json` (Linux), `%APPDATA%\bebidas-ia\data.json` (Windows).
- Para zerar, apague o arquivo (ou use `DB_PATH`).
- O cardápio (`db.js`) é editável: categorias e produtos com `aliases` usados pelo parser local.

## Painel & impressão 80mm

- Login por PIN (`settings.adminPin`, padrão `1234` — troque antes de usar em produção).
- Filtros: Todos / Novos / Ativos / Finalizados + estatísticas do dia.
- **Imprimir (80mm):** abre o cupom de atendimento já formatado em 80mm para a impressora
  térmica (ou "Generic / Text Only"). A integração com a impressora pelo aplicativo desktop
  de entrega (impressão automática ao chegar pedido) fica para a próxima etapa.

## Roteiro (próximas etapas)

1. **Aplicativo Android do cliente** — pedidos + carrinho + IA + rastreio no celular.
2. **Aplicativo para delivery (Android do entregador)** — login, entregas, GPS ao vivo no mapa.
3. **App desktop (PDV)** — impressão térmica automática, caixa, relatórios.

## Segurança

- Uso em LAN/confiança: o PIN dá acesso ao painel; a página de rastreio só expõe o próprio pedido.
- Não exponha o servidor na internet sem HTTPS/reverso (o app Android de entrega usará esse servidor).